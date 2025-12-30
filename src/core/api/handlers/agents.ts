/**
 * Agent API Handlers
 *
 * CRUD operations for agent management
 *
 * New architecture:
 * - Agent definitions store only id, name, enabled, module list
 * - Module configs are passed at creation time, used to init services
 * - Module state is stored separately via StateManager
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentStore } from '../../agent-store.js';
import type { ServiceManager } from '../../service-manager.js';
import type { ModuleInitConfig } from '../../../types/config.js';
import type {
  APIResponse,
  AgentListResponse,
  AgentDetailResponse,
} from '../types.js';
import { createComponentLogger } from '../../logger.js';
import { lettaManager } from '../../letta/index.js';
import { createAgentId } from '../../../types/agent.js';

const log = createComponentLogger('AgentHandler');

/**
 * Request to create a new agent
 */
interface CreateAgentRequest {
  id: string;
  name: string;
  enabled?: boolean;
  modules?: string[];
  module_configs?: Record<string, ModuleInitConfig>;
}

/**
 * Request to update an agent
 */
interface UpdateAgentRequest {
  name?: string;
  enabled?: boolean;
}

/**
 * Agent API Handler
 */
export class AgentAPIHandler {
  private store: AgentStore;
  private serviceManager: ServiceManager;

  constructor(store: AgentStore, serviceManager: ServiceManager) {
    this.store = store;
    this.serviceManager = serviceManager;
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
   * GET /api/admin/agents - List all agents
   */
  async handleListAgents(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const agents = await this.store.getAllAgents();
      const response: APIResponse<AgentListResponse> = {
        success: true,
        data: { agents },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * GET /api/admin/agents/:agentId - Get agent details
   */
  async handleGetAgent(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string
  ): Promise<void> {
    try {
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      // Include state information
      const stateManager = this.serviceManager.getStateManager();
      const state = await stateManager.getAgentStates(agentId);

      const response: APIResponse = {
        success: true,
        data: {
          agent,
          state,
        },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * POST /api/admin/agents - Create a new agent
   *
   * Request body:
   * {
   *   "id": "agent-id",
   *   "name": "Agent Name",
   *   "enabled": true,
   *   "modules": ["letta", "spatial"],
   *   "module_configs": {
   *     "letta": { ... letta config ... },
   *     "spatial": { ... spatial config ... }
   *   }
   * }
   *
   * The module_configs are used to initialize services, then discarded.
   * Only the resulting state is persisted.
   */
  async handleCreateAgent(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown
  ): Promise<void> {
    try {
      const request = body as CreateAgentRequest;

      // Validate request
      if (!request?.id || typeof request.id !== 'string') {
        this.sendError(res, 400, 'Missing or invalid "id" field');
        return;
      }
      if (!request?.name || typeof request.name !== 'string') {
        this.sendError(res, 400, 'Missing or invalid "name" field');
        return;
      }

      // Check if agent already exists
      if (await this.store.hasAgent(request.id)) {
        this.sendError(res, 409, `Agent ${request.id} already exists`);
        return;
      }

      // Module configs are optional per-agent overrides (all modules are available)
      const moduleConfigs = request.module_configs ?? {};

      // Create agent definition (no modules list - all modules are available)
      const agent = await this.store.createAgent({
        id: request.id,
        name: request.name,
        enabled: request.enabled ?? true,
        moduleConfigs,
      });

      const response: APIResponse<AgentDetailResponse> = {
        success: true,
        data: { agent },
        message: `Agent ${request.id} created successfully`,
      };
      this.sendJson(res, 201, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * PUT /api/admin/agents/:agentId - Update an agent
   */
  async handleUpdateAgent(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    body: unknown
  ): Promise<void> {
    try {
      const request = body as UpdateAgentRequest;

      // Check if agent exists
      if (!(await this.store.hasAgent(agentId))) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      const agent = await this.store.updateAgent(agentId, {
        name: request?.name,
        enabled: request?.enabled,
      });

      const response: APIResponse<AgentDetailResponse> = {
        success: true,
        data: { agent },
        message: `Agent ${agentId} updated successfully`,
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * DELETE /api/admin/agents/:agentId - Delete an agent
   */
  async handleDeleteAgent(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    deleteLetta: boolean = false
  ): Promise<void> {
    try {
      // Check if agent exists
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      // If deleteLetta flag is set, try to delete the Letta agent first
      if (deleteLetta) {
        try {
          const typedAgentId = createAgentId(agentId);
          const lettaAgentId = lettaManager.getLettaAgentId(typedAgentId);
          if (lettaAgentId) {
            await lettaManager.deleteAgent(typedAgentId);
            log.info('Deleted Letta agent', { agentId });
          }
        } catch (error) {
          log.warn('Failed to delete Letta agent', { agentId, error: error instanceof Error ? error.message : String(error) });
          // Continue with local deletion even if Letta deletion fails
        }
      }

      // Cleanup services before deletion
      await this.serviceManager.cleanupAgent(agentId as any);

      // Delete from store (also deletes state)
      const deleted = await this.store.deleteAgent(agentId);
      if (!deleted) {
        this.sendError(res, 500, `Failed to delete agent ${agentId}`);
        return;
      }

      const response: APIResponse = {
        success: true,
        message: `Agent ${agentId} deleted successfully${deleteLetta ? ' (including Letta agent)' : ''}`,
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * POST /api/admin/agents/:agentId/enable - Enable an agent
   */
  async handleEnableAgent(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string
  ): Promise<void> {
    try {
      if (!(await this.store.hasAgent(agentId))) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      const agent = await this.store.enableAgent(agentId);

      const response: APIResponse<AgentDetailResponse> = {
        success: true,
        data: { agent },
        message: `Agent ${agentId} enabled`,
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * POST /api/admin/agents/:agentId/disable - Disable an agent
   */
  async handleDisableAgent(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string
  ): Promise<void> {
    try {
      const agent = await this.store.getAgent(agentId);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      // Gracefully cleanup services if agent was enabled
      if (agent.enabled) {
        try {
          await this.serviceManager.cleanupAgent(agentId as any);
        } catch (error) {
          log.warn('Error during cleanup', { agentId, error: error instanceof Error ? error.message : String(error) });
        }
      }

      const updatedAgent = await this.store.disableAgent(agentId);

      const response: APIResponse<AgentDetailResponse> = {
        success: true,
        data: { agent: updatedAgent },
        message: `Agent ${agentId} disabled`,
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
