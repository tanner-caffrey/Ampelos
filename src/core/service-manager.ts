/**
 * Service Manager - manages service singletons and agent initialization
 *
 * Architecture:
 * - Services are SINGLETONS (one instance per service type)
 * - Agent-specific state is stored in the database via StateManager
 * - Services receive agentId as parameter when operating on agent data
 *
 * Lifecycle:
 * 1. initializeServices() - creates service singletons, calls init()
 * 2. initializeAgents() - for each enabled agent, calls initAgent() on relevant services
 */

import { randomUUID } from 'crypto';
import type { AgentId, AgentMetadata } from '../types/agent.js';
import { createAgentId } from '../types/agent.js';
import type { BaseService, ServiceContext } from '../types/service.js';
import type { LoadedModule } from '../types/module.js';
import type { ModuleInitConfig } from '../types/config.js';
import { ServiceError } from '../types/errors.js';
import type { Database } from './database.js';
import type { AgentStore } from './agent-store.js';
import { StateManager } from './state-manager.js';
import { AgentRegistry } from './agent-registry.js';
import { ConfigLoader } from './config-loader.js';
import type { LettaManager } from './letta/index.js';
import { createComponentLogger } from './logger.js';

const log = createComponentLogger('ServiceManager');

// Unique instance ID to detect multiple server processes
const INSTANCE_ID = randomUUID().substring(0, 8);

/**
 * Tracks which agents have been initialized for which services
 */
type AgentInitStatus = Map<AgentId, Set<string>>;

/**
 * Service Manager class
 */
export class ServiceManager {
  private services: Map<string, BaseService> = new Map();
  private agentInitStatus: AgentInitStatus = new Map();
  private db: Database;
  private agentStore?: AgentStore;
  private stateManager: StateManager;
  private agentRegistry: AgentRegistry;
  private configLoader: ConfigLoader;
  private modules: Map<string, LoadedModule>;
  private mcpServer?: any;
  private serviceContext?: ServiceContext;
  private lettaManager?: LettaManager;

  constructor(
    db: Database,
    stateManager: StateManager,
    agentRegistry: AgentRegistry,
    configLoader: ConfigLoader,
    modules: Map<string, LoadedModule>
  ) {
    this.db = db;
    this.stateManager = stateManager;
    this.agentRegistry = agentRegistry;
    this.configLoader = configLoader;
    this.modules = modules;
  }

  /**
   * Set the agent store instance (for database config lookups)
   */
  setAgentStore(agentStore: AgentStore): void {
    this.agentStore = agentStore;
  }

  /**
   * Set the MCP server instance (for Letta agent registration)
   */
  setMCPServer(mcpServer: any): void {
    this.mcpServer = mcpServer;
  }

  /**
   * Set the LettaManager instance (for Letta operations)
   */
  setLettaManager(lettaManager: LettaManager): void {
    this.lettaManager = lettaManager;
  }

  /**
   * Get the LettaManager instance
   */
  getLettaManager(): LettaManager {
    if (!this.lettaManager) {
      throw new ServiceError('LettaManager not initialized', 'letta');
    }
    return this.lettaManager;
  }

  /**
   * Get the AgentRegistry instance (for cache management)
   */
  getAgentRegistry(): AgentRegistry {
    return this.agentRegistry;
  }

  /**
   * Register a Letta agent ID mapping with the MCP server
   */
  registerLettaAgent(lettaAgentId: string, ampelosAgentId: AgentId): void {
    if (this.mcpServer && typeof this.mcpServer.registerLettaAgent === 'function') {
      this.mcpServer.registerLettaAgent(lettaAgentId, ampelosAgentId);
    }
  }

  /**
   * Create the global service context
   */
  private createServiceContext(): ServiceContext {
    if (this.serviceContext) {
      return this.serviceContext;
    }

    this.serviceContext = {
      getState: <T>(agentId: AgentId, serviceName: string) => {
        return this.stateManager.getServiceState<T>(agentId, serviceName);
      },
      getGlobalState: <T>(namespace: string) => this.stateManager.getGlobalState<T>(namespace),
      getService: (name: string) => {
        const service = this.services.get(name);
        if (!service) {
          throw new ServiceError(`Service ${name} not found`, name);
        }
        return service;
      },
      getAgentMetadata: (agentId: AgentId) => {
        const metadata = this.agentRegistry.getAgent(agentId);
        if (!metadata) {
          throw new ServiceError(`Agent ${agentId} not found`, 'unknown', agentId);
        }
        return metadata;
      },
      getEnabledAgentIds: () => {
        return this.agentRegistry.getEnabledAgents().map(a => a.agent_id);
      },
      registerLettaAgent: (lettaAgentId: string, ampelosAgentId: AgentId) => {
        this.registerLettaAgent(lettaAgentId, ampelosAgentId);
      },
      getLettaTools: (agentId: AgentId) => {
        return this.collectLettaToolsForAgent(agentId);
      },
      getLettaManager: () => {
        return this.getLettaManager();
      },
      getDatabase: () => {
        return this.db;
      },
    };

    return this.serviceContext;
  }

  /**
   * Get state for a specific agent and service
   * This is the method services should use instead of context.getState()
   */
  getServiceState<T>(agentId: AgentId, serviceName: string) {
    return this.stateManager.getServiceState<T>(agentId, serviceName);
  }

  /**
   * Known global state namespaces that services use
   * These need to be preloaded before services access them to avoid race conditions
   */
  private static readonly GLOBAL_STATE_NAMESPACES = [
    'spatial',
    'multi-agent-chat',
    'web-reader',
    'vision'
  ];

  /**
   * Initialize all service singletons
   */
  async initializeServices(): Promise<void> {
    log.info('ServiceManager initializing', { instanceId: INSTANCE_ID, pid: process.pid });

    // Preload global state for all namespaces that services might use
    // This prevents race conditions where services read undefined state
    await this.stateManager.preloadGlobalState(ServiceManager.GLOBAL_STATE_NAMESPACES);
    log.info('Preloaded global state namespaces');

    // Create service singletons for all modules that provide services
    for (const [moduleName, module] of this.modules) {
      if (!module.loaded || !module.serviceFactory) continue;

      try {
        const service = module.serviceFactory();
        this.services.set(moduleName, service);
        log.info(`Created service singleton: ${moduleName}`);
      } catch (error) {
        const err = error as Error;
        log.error(`Failed to create service ${moduleName}`, { error: err.message });
      }
    }

    // Initialize all services with the global context
    const context = this.createServiceContext();
    for (const [serviceName, service] of this.services) {
      try {
        await service.init(context);
        log.info(`Initialized service: ${serviceName}`);
      } catch (error) {
        const err = error as Error;
        log.error(`Failed to initialize ${serviceName}`, { error: err.message });
      }
    }
  }

  /**
   * Initialize services for all enabled agents
   * @deprecated Use eagerInitializeServicesWithState() instead - modules are now lazily initialized
   */
  async initializeAgents(): Promise<void> {
    const enabledAgents = this.agentRegistry.getEnabledAgents();

    for (const agent of enabledAgents) {
      await this.initializeAgentServices(agent.agent_id);
    }
  }

  /**
   * Eager-initialize services for agents that have existing state.
   * Any service with prior state for an agent will be initialized at startup.
   * This ensures polling, timers, and background tasks resume correctly.
   */
  async eagerInitializeServicesWithState(): Promise<void> {
    log.info('Eager-initializing services with state', { instanceId: INSTANCE_ID });

    // Iterate over all loaded modules that provide services
    for (const [moduleName, module] of this.modules) {
      // Skip modules that don't provide a service
      if (!module.manifest.provides.includes('service')) continue;

      // Get all agents that have existing state for this module
      const agentIds = this.db.getAgentsWithServiceState(moduleName);

      for (const agentIdStr of agentIds) {
        const agentId = createAgentId(agentIdStr);

        // Only init if agent is enabled
        if (!this.agentRegistry.isEnabled(agentId)) continue;

        // Skip if module is disabled for this agent
        if (!this.db.isModuleEnabled(agentIdStr, moduleName)) {
          log.debug(`Skipping ${moduleName} for ${agentId} (module disabled)`);
          continue;
        }

        try {
          await this.ensureAgentInitialized(agentId, moduleName);
          log.info(`Eager-initialized ${moduleName} for ${agentId} (has existing state)`);
        } catch (error) {
          const err = error as Error;
          log.error(`Failed to eager-init ${moduleName} for ${agentId}`, { error: err.message });
        }
      }
    }
  }

  /**
   * Ensure an agent is initialized for a specific module.
   * This is the main entry point for lazy initialization from tool handlers.
   */
  async ensureAgentInitialized(agentId: AgentId, moduleName: string): Promise<void> {
    if (this.isAgentInitialized(agentId, moduleName)) {
      return;
    }

    // Check if module is enabled for this agent
    if (!this.db.isModuleEnabled(agentId, moduleName)) {
      throw new ServiceError(
        `Module ${moduleName} is disabled for agent ${agentId}. Enable it in the admin panel first.`,
        moduleName,
        agentId
      );
    }

    // Preload state for this agent/module combination
    await this.stateManager.preloadAgentState(agentId, [moduleName]);

    // Get config (may be undefined, that's OK - module uses defaults)
    const config = this.configLoader.getModuleConfig(agentId, moduleName) ?? {};

    await this.initAgentForService(agentId, moduleName, config);
  }

  /**
   * Initialize all relevant services for a specific agent.
   * @deprecated Modules are now lazily initialized on first tool use.
   * Use ensureAgentInitialized() for specific modules, or eagerInitializeServicesWithState() at startup.
   */
  async initializeAgentServices(_agentId: AgentId): Promise<void> {
    // No-op: Modules are now lazily initialized on first tool use
    // Services with existing state are eager-initialized via eagerInitializeServicesWithState()
  }

  /**
   * Initialize a specific agent for a specific service
   */
  async initAgentForService(
    agentId: AgentId,
    serviceName: string,
    config?: ModuleInitConfig
  ): Promise<void> {
    // Check if already initialized
    if (this.isAgentInitialized(agentId, serviceName)) {
      return;
    }

    const service = this.services.get(serviceName);
    if (!service) {
      throw new ServiceError(`Service ${serviceName} not found`, serviceName, agentId);
    }

    // Check if agent is enabled
    if (!this.agentRegistry.isEnabled(agentId)) {
      throw new ServiceError(`Agent ${agentId} is not enabled`, serviceName, agentId);
    }

    // Get config from ConfigLoader if not provided, fallback to database config
    let effectiveConfig = config ?? this.configLoader.getModuleConfig(agentId, serviceName);

    // If no config from ConfigLoader (or empty object), check database configs
    if ((!effectiveConfig || Object.keys(effectiveConfig).length === 0) && this.agentStore) {
      const dbConfig = await this.agentStore.getModuleConfig(agentId, serviceName);
      if (dbConfig && Object.keys(dbConfig).length > 0) {
        effectiveConfig = dbConfig;
      }
    }

    effectiveConfig = effectiveConfig ?? {};

    // Check dependencies
    const dependencies = service.dependsOn?.() ?? [];
    const module = this.modules.get(serviceName);
    const manifestDeps = module?.manifest.dependencies ?? [];
    const allDeps = [...new Set([...dependencies, ...manifestDeps])];

    // Initialize dependencies first
    for (const depName of allDeps) {
      if (!this.isAgentInitialized(agentId, depName)) {
        await this.initAgentForService(agentId, depName);
      }
    }

    try {
      log.info(`Calling initAgent for ${serviceName}`, { agentId, instanceId: INSTANCE_ID });
      await service.initAgent(agentId, effectiveConfig);

      // Track initialization
      if (!this.agentInitStatus.has(agentId)) {
        this.agentInitStatus.set(agentId, new Set());
      }
      this.agentInitStatus.get(agentId)!.add(serviceName);

      log.info(`Initialized ${serviceName} for ${agentId}`, { instanceId: INSTANCE_ID });
    } catch (error) {
      throw new ServiceError(
        `Failed to init ${serviceName} for ${agentId}: ${error instanceof Error ? error.message : String(error)}`,
        serviceName,
        agentId
      );
    }
  }

  /**
   * Get a service singleton
   */
  getService(serviceName: string): BaseService | null {
    return this.services.get(serviceName) ?? null;
  }

  /**
   * Check if a service exists
   */
  hasService(serviceName: string): boolean {
    return this.services.has(serviceName);
  }

  /**
   * Check if an agent has been initialized for a service
   */
  isAgentInitialized(agentId: AgentId, serviceName: string): boolean {
    const agentServices = this.agentInitStatus.get(agentId);
    return agentServices?.has(serviceName) ?? false;
  }

  /**
   * Get or initialize a service for an agent (for lazy initialization)
   */
  async getOrInitializeForAgent(agentId: AgentId, serviceName: string): Promise<BaseService> {
    if (!this.isAgentInitialized(agentId, serviceName)) {
      await this.initAgentForService(agentId, serviceName);
    }

    const service = this.services.get(serviceName);
    if (!service) {
      throw new ServiceError(`Service ${serviceName} not found`, serviceName, agentId);
    }

    return service;
  }

  /**
   * Collect all Letta tools from ALL loaded modules.
   * With the new architecture, all modules are available to all agents.
   */
  private collectLettaToolsForAgent(_agentId: AgentId): import('../types/tool.js').LettaToolDefinition[] {
    const lettaTools: import('../types/tool.js').LettaToolDefinition[] = [];

    // Collect Letta tools from ALL modules (not just agent's modules)
    for (const [_moduleName, module] of this.modules) {
      if (module?.loaded && module.lettaTools) {
        lettaTools.push(...module.lettaTools);
      }
    }

    return lettaTools;
  }

  /**
   * Get the ConfigLoader instance
   */
  getConfigLoader(): ConfigLoader {
    return this.configLoader;
  }

  /**
   * Get the StateManager instance
   */
  getStateManager(): StateManager {
    return this.stateManager;
  }

  /**
   * Clean up a specific agent from a service
   */
  async cleanupAgentFromService(agentId: AgentId, serviceName: string): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service) return;

    // Flush state before cleanup
    const state = this.stateManager.getServiceState(agentId, serviceName);
    await state.flush();

    if (service.cleanupAgent) {
      try {
        await service.cleanupAgent(agentId);
      } catch (error) {
        const err = error as Error;
        log.error(`Error cleaning up ${serviceName} for ${agentId}`, { error: err.message });
      }
    }

    // Remove from tracking
    const agentServices = this.agentInitStatus.get(agentId);
    if (agentServices) {
      agentServices.delete(serviceName);
      if (agentServices.size === 0) {
        this.agentInitStatus.delete(agentId);
      }
    }
  }

  /**
   * Clean up all services for an agent
   */
  async cleanupAgent(agentId: AgentId): Promise<void> {
    const agentServices = this.agentInitStatus.get(agentId);
    if (!agentServices) return;

    for (const serviceName of agentServices) {
      await this.cleanupAgentFromService(agentId, serviceName);
    }

    this.agentInitStatus.delete(agentId);
  }

  /**
   * Cleanup all services (global shutdown)
   */
  async cleanupAll(): Promise<void> {
    // Flush all state first
    await this.stateManager.flushAll();

    // Clean up all agents from all services
    const agentIds = Array.from(this.agentInitStatus.keys());
    for (const agentId of agentIds) {
      await this.cleanupAgent(agentId);
    }

    // Clean up service singletons
    for (const [serviceName, service] of this.services) {
      if (service.cleanup) {
        try {
          await service.cleanup();
        } catch (error) {
          const err = error as Error;
          log.error(`Error cleaning up service ${serviceName}`, { error: err.message });
        }
      }
    }
  }

  /**
   * Notify all initialized services that startup is complete.
   * Called after the server is listening and all services have finished initAgent().
   *
   * This allows services to defer work that may trigger agent responses
   * (which could invoke tools from other services) until everything is ready.
   */
  async notifyStartupComplete(): Promise<void> {
    log.info('Notifying services of startup completion', { instanceId: INSTANCE_ID });

    // Iterate over all agents that have initialized services
    for (const [agentId, serviceNames] of this.agentInitStatus) {
      for (const serviceName of serviceNames) {
        const service = this.services.get(serviceName);
        if (!service?.onStartupComplete) continue;

        try {
          await service.onStartupComplete(agentId);
          log.debug(`Startup complete notification sent`, { serviceName, agentId });
        } catch (error) {
          const err = error as Error;
          log.error(`Error in onStartupComplete for ${serviceName}`, {
            agentId,
            error: err.message
          });
          // Continue notifying other services even if one fails
        }
      }
    }

    log.info('All services notified of startup completion');
  }

  /**
   * Get all initialized services for an agent
   */
  getInitializedServicesForAgent(agentId: AgentId): string[] {
    const agentServices = this.agentInitStatus.get(agentId);
    return agentServices ? Array.from(agentServices) : [];
  }

  /**
   * Get the global service context
   */
  getServiceContext(): ServiceContext {
    return this.createServiceContext();
  }
}
