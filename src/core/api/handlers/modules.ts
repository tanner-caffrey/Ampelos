/**
 * Module API Handlers
 *
 * Module configuration operations for agents.
 *
 * Architecture (post-refactor):
 * - All modules are available to all agents (no "attachment" needed)
 * - Per-agent module configs are optional overrides stored in database
 * - Module state is stored separately via StateManager
 * - Modules are lazy-initialized on first tool use
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentId } from '../../../types/agent.js';
import type { AgentStore } from '../../agent-store.js';
import type { ServiceManager } from '../../service-manager.js';
import type { LoadedModule } from '../../../types/module.js';
import type { ModuleInitConfig } from '../../../types/config.js';
import type {
  APIResponse,
  AvailableModulesResponse,
  AvailableModuleInfo,
} from '../types.js';
import type SpatialService from '../../../modules/spatial/service.js';
import type BodyAndInventoryService from '../../../modules/embodiment/service.js';
import { createComponentLogger } from '../../logger.js';

const log = createComponentLogger('ModuleHandler');

/**
 * Request to add a module
 */
interface AddModuleRequest {
  config?: ModuleInitConfig;
}

/**
 * Request to update module config
 */
interface UpdateModuleConfigRequest {
  config: ModuleInitConfig;
}

/**
 * Module list response
 */
interface ModuleListResponse {
  modules: string[];
}

/**
 * Request to set module enabled status
 */
interface SetModuleEnabledRequest {
  enabled: boolean;
}

/**
 * Module status response
 */
interface ModuleStatusResponse {
  modules: Record<string, { enabled: boolean; initialized: boolean }>;
}

/**
 * Module API Handler
 */
export class ModuleAPIHandler {
  private store: AgentStore;
  private serviceManager: ServiceManager;
  private loadedModules: Map<string, LoadedModule>;

  constructor(
    store: AgentStore,
    serviceManager: ServiceManager,
    loadedModules: Map<string, LoadedModule>
  ) {
    this.store = store;
    this.serviceManager = serviceManager;
    this.loadedModules = loadedModules;
  }

  /**
   * Send JSON response
   */
  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Send error response
   */
  private sendError(res: ServerResponse, status: number, message: string): void {
    this.sendJson(res, status, { success: false, error: message });
  }

  /**
   * GET /api/admin/agents/:agentId/modules - List modules with config/state for agent
   * Returns all modules that have either config overrides or state for this agent.
   */
  async handleListModules(
    _req: IncomingMessage,
    res: ServerResponse,
    agentId: string
  ): Promise<void> {
    try {
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      // Get modules with state (initialized modules)
      const stateManager = this.serviceManager.getStateManager();
      const initializedModules = this.serviceManager.getInitializedServicesForAgent(agentId as AgentId);

      // Note: All modules are available, but we return which ones have been initialized
      const response: APIResponse<ModuleListResponse> = {
        success: true,
        data: { modules: initializedModules },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * GET /api/admin/agents/:agentId/modules/status - Get enabled/initialized status for all modules
   */
  async handleGetModulesStatus(
    _req: IncomingMessage,
    res: ServerResponse,
    agentId: string
  ): Promise<void> {
    try {
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      // Get database to access module status
      const db = this.serviceManager.getServiceContext().getDatabase();

      // Get modules that have explicit enabled status set
      const dbStatus = db.getModulesStatusForAgent(agentId);

      // Get initialized modules
      const initializedModules = new Set(
        this.serviceManager.getInitializedServicesForAgent(agentId as AgentId)
      );

      // Build response: for all available modules, determine their status
      const modules: Record<string, { enabled: boolean; initialized: boolean }> = {};

      for (const [name, module] of this.loadedModules) {
        if (!module.loaded) continue;

        // Check if explicitly disabled (no entry = enabled by default)
        const isEnabled = dbStatus[name]?.enabled ?? true;
        const isInitialized = initializedModules.has(name);

        modules[name] = {
          enabled: isEnabled,
          initialized: isInitialized,
        };
      }

      const response: APIResponse<ModuleStatusResponse> = {
        success: true,
        data: { modules },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * PUT /api/admin/agents/:agentId/modules/:moduleName/enabled - Set module enabled status
   */
  async handleSetModuleEnabled(
    _req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    moduleName: string,
    body: unknown
  ): Promise<void> {
    try {
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      // Validate module exists
      const module = this.loadedModules.get(moduleName);
      if (!module || !module.loaded) {
        this.sendError(res, 400, `Module ${moduleName} is not available`);
        return;
      }

      const request = body as SetModuleEnabledRequest | null;
      if (request?.enabled === undefined) {
        this.sendError(res, 400, '"enabled" field is required');
        return;
      }

      const enabled = request.enabled;
      const db = this.serviceManager.getServiceContext().getDatabase();

      // Ensure there's a row to update (create if doesn't exist)
      const existingModules = db.getAgentModules(agentId);
      const hasRow = existingModules.some(m => m.module_name === moduleName);

      if (!hasRow) {
        // Create the row with the new enabled state
        db.addAgentModule(agentId, moduleName, { enabled });
      } else {
        // Update existing row
        db.updateAgentModule(agentId, moduleName, { enabled });
      }

      log.info(`Module ${moduleName} ${enabled ? 'enabled' : 'disabled'} for ${agentId}`);

      // If disabling an active module, clean it up
      if (!enabled && this.serviceManager.isAgentInitialized(agentId as AgentId, moduleName)) {
        try {
          await this.serviceManager.cleanupAgentFromService(agentId as AgentId, moduleName);
          log.info(`Cleaned up ${moduleName} service for ${agentId}`);
        } catch (error) {
          log.warn(`Error cleaning up ${moduleName} for ${agentId}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const response: APIResponse = {
        success: true,
        message: `Module ${moduleName} ${enabled ? 'enabled' : 'disabled'} for agent ${agentId}`,
        data: { enabled },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * POST /api/admin/agents/:agentId/modules/:moduleName - Set module config for agent
   * All modules are available - this sets per-agent config overrides.
   */
  async handleAddModule(
    _req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    moduleName: string,
    body: unknown
  ): Promise<void> {
    try {
      // Validate module exists
      if (!this.loadedModules.has(moduleName)) {
        this.sendError(res, 400, `Module ${moduleName} is not available`);
        return;
      }

      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      // Extract config from request (all modules available, just setting config)
      const request = body as AddModuleRequest | null;
      const moduleConfig = request?.config;
      log.info('Setting module config for agent', { moduleName, agentId, config: moduleConfig });

      // Set config if provided
      if (moduleConfig && Object.keys(moduleConfig).length > 0) {
        await this.store.setModuleConfig(agentId, moduleName, moduleConfig);
      }

      const response: APIResponse = {
        success: true,
        message: `Module config set for ${moduleName} on agent ${agentId}`,
      };
      this.sendJson(res, 201, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * DELETE /api/admin/agents/:agentId/modules/:moduleName - Delete module config and state
   * The module remains available - this cleans up per-agent config and state.
   */
  async handleRemoveModule(
    _req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    moduleName: string
  ): Promise<void> {
    try {
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      // Cleanup service first
      try {
        await this.serviceManager.cleanupAgentFromService(agentId as AgentId, moduleName);
      } catch (error) {
        log.warn('Error cleaning up module', { moduleName, agentId, error: error instanceof Error ? error.message : String(error) });
      }

      // Delete config (module remains available, just removes per-agent data)
      await this.store.deleteModuleConfig(agentId, moduleName);

      const response: APIResponse = {
        success: true,
        message: `Module config/state removed for ${moduleName} on agent ${agentId}`,
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * PUT /api/admin/agents/:agentId/modules/:moduleName/config - Update module config
   * All modules are available - this sets per-agent config overrides.
   */
  async handleUpdateModuleConfig(
    _req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    moduleName: string,
    body: unknown
  ): Promise<void> {
    try {
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      // Validate module exists in loaded modules
      if (!this.loadedModules.has(moduleName)) {
        this.sendError(res, 400, `Module ${moduleName} is not available`);
        return;
      }

      const request = body as UpdateModuleConfigRequest | null;
      if (!request?.config) {
        this.sendError(res, 400, 'Config is required');
        return;
      }

      // Update config in database
      await this.store.setModuleConfig(agentId, moduleName, request.config);

      // Reinitialize the service with new config if it was initialized
      if (this.serviceManager.isAgentInitialized(agentId as AgentId, moduleName)) {
        try {
          await this.serviceManager.cleanupAgentFromService(agentId as AgentId, moduleName);
          await this.serviceManager.ensureAgentInitialized(agentId as AgentId, moduleName);
        } catch (error) {
          log.warn('Failed to reinitialize module', { moduleName, agentId, error: error instanceof Error ? error.message : String(error) });
        }
      }

      const response: APIResponse = {
        success: true,
        message: `Config updated for ${moduleName} on agent ${agentId}`,
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * GET /api/admin/agents/:agentId/modules/:moduleName/config - Get module config
   * Returns per-agent config override (empty if none set).
   */
  async handleGetModuleConfig(
    _req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    moduleName: string
  ): Promise<void> {
    try {
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      // Validate module exists
      if (!this.loadedModules.has(moduleName)) {
        this.sendError(res, 400, `Module ${moduleName} is not available`);
        return;
      }

      const config = await this.store.getModuleConfig(agentId, moduleName);

      const response: APIResponse = {
        success: true,
        data: { config: config || {} },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * POST /api/admin/agents/:agentId/modules/:moduleName/init - Initialize module for agent
   * Manually initializes a module's service for this agent without needing a tool call.
   * Only works for modules that provide a 'service'.
   */
  async handleInitModule(
    _req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    moduleName: string
  ): Promise<void> {
    try {
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      // Validate module exists
      const module = this.loadedModules.get(moduleName);
      if (!module || !module.loaded) {
        this.sendError(res, 400, `Module ${moduleName} is not available`);
        return;
      }

      // Check if module provides a service
      if (!module.manifest.provides.includes('service')) {
        this.sendError(res, 400, `Module ${moduleName} does not provide a service and cannot be initialized`);
        return;
      }

      // Check if already initialized
      if (this.serviceManager.isAgentInitialized(agentId as AgentId, moduleName)) {
        this.sendError(res, 400, `Module ${moduleName} is already initialized for agent ${agentId}`);
        return;
      }

      log.info('Initializing module for agent', { moduleName, agentId });

      // Initialize the module
      await this.serviceManager.ensureAgentInitialized(agentId as AgentId, moduleName);

      // Get the new state
      const stateManager = this.serviceManager.getStateManager();
      const state = stateManager.getServiceState(agentId as AgentId, moduleName);

      const response: APIResponse = {
        success: true,
        message: `Module ${moduleName} initialized for agent ${agentId}`,
        data: { state: state.get() || {} },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      log.error('Failed to initialize module', { moduleName, agentId, error: error instanceof Error ? error.message : String(error) });
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * GET /api/admin/modules - List available modules
   */
  async handleListAvailableModules(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const modules: AvailableModuleInfo[] = [];

      for (const [name, module] of this.loadedModules) {
        if (!module.loaded) continue;

        modules.push({
          name: module.manifest.name,
          version: module.manifest.version,
          description: module.manifest.description,
          provides: module.manifest.provides,
          dependencies: module.manifest.dependencies,
          configSchema: module.manifest.config_schema as Record<string, unknown> | undefined,
        });
      }

      const response: APIResponse<AvailableModulesResponse> = {
        success: true,
        data: { modules },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * GET /api/admin/modules/:name/schema - Get module config schema
   */
  async handleGetModuleSchema(
    req: IncomingMessage,
    res: ServerResponse,
    moduleName: string
  ): Promise<void> {
    try {
      const module = this.loadedModules.get(moduleName);
      if (!module || !module.loaded) {
        this.sendError(res, 404, `Module ${moduleName} not found`);
        return;
      }

      const response: APIResponse = {
        success: true,
        data: {
          name: module.manifest.name,
          version: module.manifest.version,
          schema: module.manifest.config_schema ?? {},
        },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // ============================================================================
  // Module State Handlers - Direct interaction with service runtime state
  // ============================================================================

  /**
   * GET /api/admin/agents/:agentId/modules/:moduleName/state - Get module runtime state
   */
  async handleGetModuleState(
    _req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    moduleName: string
  ): Promise<void> {
    try {
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      // Validate module exists
      if (!this.loadedModules.has(moduleName)) {
        this.sendError(res, 400, `Module ${moduleName} is not available`);
        return;
      }

      // Get state from StateManager
      const stateManager = this.serviceManager.getStateManager();
      const state = stateManager.getServiceState(agentId as AgentId, moduleName);
      const currentState = state.get() || {};

      // For spatial module, also include global state (worlds)
      if (moduleName === 'spatial') {
        const globalState = stateManager.getGlobalState<{ worlds: Record<string, unknown> }>('spatial');
        const worlds = globalState.get()?.worlds || {};

        const response: APIResponse = {
          success: true,
          data: {
            agentState: currentState,
            globalState: { worlds }
          },
        };
        this.sendJson(res, 200, response);
        return;
      }

      const response: APIResponse = {
        success: true,
        data: { state: currentState },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * PUT /api/admin/agents/:agentId/modules/spatial/state - Update spatial state
   */
  async handleUpdateSpatialState(
    _req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    body: unknown
  ): Promise<void> {
    try {
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      const request = body as {
        action: 'moveTo' | 'switchWorld';
        location?: string;
        position?: string;
        world_id?: string;
      } | null;

      if (!request?.action) {
        this.sendError(res, 400, 'Action is required');
        return;
      }

      // Get the spatial service
      const spatialService = this.serviceManager.getService('spatial') as SpatialService | null;
      if (!spatialService) {
        this.sendError(res, 503, 'Spatial service not available');
        return;
      }

      // Ensure agent is initialized for this service
      if (!this.serviceManager.isAgentInitialized(agentId as AgentId, 'spatial')) {
        await this.serviceManager.getOrInitializeForAgent(agentId as AgentId, 'spatial');
      }

      let result: { success: boolean; message: string };

      switch (request.action) {
        case 'moveTo':
          if (!request.location) {
            this.sendError(res, 400, 'Location is required for moveTo action');
            return;
          }
          result = await spatialService.moveTo(agentId as AgentId, request.location, request.position);
          break;

        case 'switchWorld':
          if (!request.world_id) {
            this.sendError(res, 400, 'world_id is required for switchWorld action');
            return;
          }
          result = await spatialService.switchWorld(agentId as AgentId, request.world_id);
          break;

        default:
          this.sendError(res, 400, `Unknown action: ${request.action}`);
          return;
      }

      if (!result.success) {
        this.sendError(res, 400, result.message);
        return;
      }

      // Get updated state
      const stateManager = this.serviceManager.getStateManager();
      const state = stateManager.getServiceState(agentId as AgentId, 'spatial');
      const globalState = stateManager.getGlobalState<{ worlds: Record<string, unknown> }>('spatial');

      const response: APIResponse = {
        success: true,
        message: result.message,
        data: {
          agentState: state.get() || {},
          globalState: { worlds: globalState.get()?.worlds || {} }
        },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * PUT /api/admin/agents/:agentId/modules/body_and_inventory/state - Update embodiment state
   */
  async handleUpdateEmbodimentState(
    _req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    body: unknown
  ): Promise<void> {
    try {
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      const request = body as {
        action: 'createBodyPart' | 'addBodyDescriptor' | 'removeBodyDescriptor' |
                'setBodyState' | 'clearBodyState' | 'deleteBodyPart' |
                'addInventoryItem' | 'removeInventoryItem' | 'equipItem' | 'unequipItem' |
                'modifyInventoryItem' | 'markItemForMemory';
        partName?: string;
        key?: string;
        value?: string;
        bodyState?: string;
        itemId?: string;
        itemName?: string;
        slot?: string;
        description?: string;
        descriptors?: Record<string, string>;
        properties?: Record<string, unknown>;
        show?: boolean;
      } | null;

      if (!request?.action) {
        this.sendError(res, 400, 'Action is required');
        return;
      }

      // Get the embodiment service
      const bodyService = this.serviceManager.getService('body_and_inventory') as BodyAndInventoryService | null;
      if (!bodyService) {
        this.sendError(res, 503, 'Embodiment service not available');
        return;
      }

      // Ensure agent is initialized for this service
      if (!this.serviceManager.isAgentInitialized(agentId as AgentId, 'body_and_inventory')) {
        await this.serviceManager.getOrInitializeForAgent(agentId as AgentId, 'body_and_inventory');
      }

      let result: { success: boolean; message: string; item?: unknown };

      switch (request.action) {
        // Body part actions
        case 'createBodyPart':
          if (!request.partName) {
            this.sendError(res, 400, 'partName is required');
            return;
          }
          result = await bodyService.createBodyPart(agentId as AgentId, request.partName);
          break;

        case 'addBodyDescriptor':
          if (!request.partName || !request.key || !request.value) {
            this.sendError(res, 400, 'partName, key, and value are required');
            return;
          }
          result = await bodyService.addBodyDescriptor(agentId as AgentId, request.partName, request.key, request.value);
          break;

        case 'removeBodyDescriptor':
          if (!request.partName || !request.key) {
            this.sendError(res, 400, 'partName and key are required');
            return;
          }
          result = await bodyService.removeBodyDescriptor(agentId as AgentId, request.partName, request.key);
          break;

        case 'setBodyState':
          if (!request.partName || !request.bodyState) {
            this.sendError(res, 400, 'partName and bodyState are required');
            return;
          }
          result = await bodyService.setBodyState(agentId as AgentId, request.partName, request.bodyState);
          break;

        case 'clearBodyState':
          if (!request.partName) {
            this.sendError(res, 400, 'partName is required');
            return;
          }
          result = await bodyService.clearBodyState(agentId as AgentId, request.partName);
          break;

        // Inventory actions
        case 'addInventoryItem':
          if (!request.itemName) {
            this.sendError(res, 400, 'itemName is required');
            return;
          }
          result = await bodyService.addInventoryItem(
            agentId as AgentId,
            request.itemName,
            request.description,
            request.descriptors,
            request.properties
          );
          break;

        case 'removeInventoryItem':
          if (!request.itemId) {
            this.sendError(res, 400, 'itemId is required');
            return;
          }
          result = await bodyService.removeInventoryItem(agentId as AgentId, request.itemId);
          break;

        case 'equipItem':
          if (!request.itemId || !request.slot) {
            this.sendError(res, 400, 'itemId and slot are required');
            return;
          }
          result = await bodyService.equipInventoryItem(agentId as AgentId, request.itemId, request.slot);
          break;

        case 'unequipItem':
          if (!request.itemId) {
            this.sendError(res, 400, 'itemId is required');
            return;
          }
          result = await bodyService.unequipInventoryItem(agentId as AgentId, request.itemId);
          break;

        case 'modifyInventoryItem':
          if (!request.itemId) {
            this.sendError(res, 400, 'itemId is required');
            return;
          }
          result = await bodyService.modifyInventoryItem(agentId as AgentId, request.itemId, {
            name: request.itemName,
            description: request.description,
            descriptors: request.descriptors,
            properties: request.properties,
          });
          break;

        case 'markItemForMemory':
          if (!request.itemId || request.show === undefined) {
            this.sendError(res, 400, 'itemId and show are required');
            return;
          }
          result = await bodyService.markItemForMemory(agentId as AgentId, request.itemId, request.show);
          break;

        default:
          this.sendError(res, 400, `Unknown action: ${request.action}`);
          return;
      }

      if (!result.success) {
        this.sendError(res, 400, result.message);
        return;
      }

      // Get updated state
      const stateManager = this.serviceManager.getStateManager();
      const state = stateManager.getServiceState(agentId as AgentId, 'body_and_inventory');

      const response: APIResponse = {
        success: true,
        message: result.message,
        data: { state: state.get() || {} },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
