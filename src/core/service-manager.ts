/**
 * Service Manager - manages service lifecycle and instances
 */

import type { AgentId, AgentMetadata } from '../types/agent.js';
import type { BaseService, ServiceContext, ScopedDatabase } from '../types/service.js';
import type { LoadedModule } from '../types/module.js';
import { ServiceError } from '../types/errors.js';
import { Database } from './database.js';
import { AgentRegistry } from './agent-registry.js';
import { ConfigLoader } from './config-loader.js';

/**
 * Service instance cache: agentId -> serviceName -> service instance
 */
type ServiceCache = Map<AgentId, Map<string, BaseService>>;

/**
 * Service Manager class
 */
export class ServiceManager {
  private services: ServiceCache = new Map();
  private db: Database;
  private agentRegistry: AgentRegistry;
  private configLoader: ConfigLoader;
  private modules: Map<string, LoadedModule>;

  constructor(
    db: Database,
    agentRegistry: AgentRegistry,
    configLoader: ConfigLoader,
    modules: Map<string, LoadedModule>
  ) {
    this.db = db;
    this.agentRegistry = agentRegistry;
    this.configLoader = configLoader;
    this.modules = modules;
  }

  /**
   * Initialize services for enabled agents (eager initialization)
   * Services are initialized in dependency order
   */
  async initializeEagerServices(): Promise<void> {
    const enabledAgents = this.agentRegistry.getEnabledAgents();

    for (const agent of enabledAgents) {
      const agentConfig = this.agentRegistry.getAgentConfig(agent.agent_id);
      if (!agentConfig) continue;

      // Get services that need eager initialization
      const eagerServices: string[] = [];
      for (const moduleName of agent.modules) {
        const module = this.modules.get(moduleName);
        if (!module || !module.loaded || !module.serviceFactory) continue;

        const moduleConfig = agentConfig.modules[moduleName];
        const lazy = (moduleConfig?.lazy ?? true) as boolean;

        if (!lazy) {
          eagerServices.push(moduleName);
        }
      }

      // Initialize in dependency order
      const initOrder = this.resolveDependencyOrder(eagerServices, agent.agent_id);
      for (const serviceName of initOrder) {
        await this.initializeService(agent.agent_id, serviceName);
      }
    }
  }

  /**
   * Resolve service initialization order based on dependencies
   * Uses topological sort to ensure dependencies are initialized first
   */
  private resolveDependencyOrder(serviceNames: string[], agentId: AgentId): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (serviceName: string): void => {
      if (visiting.has(serviceName)) {
        throw new ServiceError(
          `Circular dependency detected involving service: ${serviceName}`,
          serviceName,
          agentId
        );
      }

      if (visited.has(serviceName)) {
        return;
      }

      visiting.add(serviceName);

      // Get dependencies
      const module = this.modules.get(serviceName);
      if (module?.loaded && module.serviceFactory) {
        const service = module.serviceFactory();
        const dependencies = service.dependsOn?.() ?? [];
        
        // Also check manifest dependencies
        const manifestDeps = module.manifest.dependencies ?? [];
        const allDeps = [...new Set([...dependencies, ...manifestDeps])];

        // Visit dependencies first
        for (const dep of allDeps) {
          if (serviceNames.includes(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(serviceName);
      visited.add(serviceName);
      order.push(serviceName);
    };

    for (const serviceName of serviceNames) {
      if (!visited.has(serviceName)) {
        visit(serviceName);
      }
    }

    return order;
  }

  /**
   * Initialize a service for an agent
   * Automatically initializes dependencies if not already initialized
   */
  async initializeService(agentId: AgentId, serviceName: string): Promise<BaseService> {
    // Check if already initialized
    const existing = this.getService(agentId, serviceName);
    if (existing) {
      return existing;
    }

    // Get module
    const module = this.modules.get(serviceName);
    if (!module || !module.loaded) {
      throw new ServiceError(
        `Module ${serviceName} not found or failed to load`,
        serviceName,
        agentId
      );
    }

    if (!module.serviceFactory) {
      throw new ServiceError(
        `Module ${serviceName} does not provide a service`,
        serviceName,
        agentId
      );
    }

    // Check if agent is enabled
    if (!this.agentRegistry.isEnabled(agentId)) {
      throw new ServiceError(
        `Agent ${agentId} is not enabled`,
        serviceName,
        agentId
      );
    }

    // Resolve configuration
    const config = await this.configLoader.resolveModuleConfig(
      agentId,
      serviceName,
      module.manifest
    );

    // Create service instance to check dependencies
    const tempService = module.serviceFactory();
    const dependencies = tempService.dependsOn?.() ?? [];
    const manifestDeps = module.manifest.dependencies ?? [];
    const allDeps = [...new Set([...dependencies, ...manifestDeps])];

    // Initialize dependencies first
    for (const depName of allDeps) {
      if (!this.hasService(agentId, depName)) {
        await this.initializeService(agentId, depName);
      }
    }

    // Create service instance (reuse the one we created for dependency check)
    const service = tempService;

    // Create service context
    const context = this.createServiceContext(agentId, serviceName);

    try {
      // Initialize service
      await service.init(agentId, config, context);

      // Restore state if available
      if (service.setState) {
        const db = this.db.getDB(agentId, serviceName);
        try {
          const state = await db.read<Record<string, unknown>>();
          if (state && Object.keys(state).length > 0) {
            await service.setState(state);
          }
        } catch (error) {
          // State might not exist yet, that's okay
          console.warn(`Failed to restore state for ${serviceName}@${agentId}:`, error);
        }
      } else {
        // If service doesn't implement setState, try to restore from database directly
        // This is a fallback for services that manage state via database directly
        const db = this.db.getDB(agentId, serviceName);
        try {
          await db.read(); // Ensure state exists in database
        } catch (error) {
          // State doesn't exist yet, that's okay
        }
      }

      // Cache service instance
      if (!this.services.has(agentId)) {
        this.services.set(agentId, new Map());
      }
      this.services.get(agentId)!.set(serviceName, service);

      return service;
    } catch (error) {
      // Cleanup on failure
      if (service.cleanup) {
        try {
          await service.cleanup();
        } catch (cleanupError) {
          console.error(`Error during service cleanup:`, cleanupError);
        }
      }
      throw new ServiceError(
        `Failed to initialize service ${serviceName}: ${error instanceof Error ? error.message : String(error)}`,
        serviceName,
        agentId
      );
    }
  }

  /**
   * Get a service instance from cache (synchronous, no lazy init)
   */
  getService(agentId: AgentId, serviceName: string): BaseService | null {
    const agentServices = this.services.get(agentId);
    if (!agentServices) {
      return null;
    }
    return agentServices.get(serviceName) ?? null;
  }

  /**
   * Check if a service is initialized
   */
  hasService(agentId: AgentId, serviceName: string): boolean {
    return this.getService(agentId, serviceName) !== null;
  }

  /**
   * Create service context for a service
   */
  private createServiceContext(agentId: AgentId, serviceName: string): ServiceContext {
    return {
      getDB: () => this.db.getDB(agentId, serviceName),
      getService: (name: string) => {
        const service = this.getService(agentId, name);
        if (!service) {
          // Try to get module config to check auto_initialize
          const moduleConfig = this.configLoader.getModuleConfigObject(agentId, name);
          const autoInit = (moduleConfig?.auto_initialize ?? false) as boolean;
          
          if (!autoInit) {
            throw new ServiceError(
              `Service ${name} not initialized for agent ${agentId}`,
              name,
              agentId
            );
          }
          
          // Auto-initialize if allowed (synchronous context, so we can't await)
          // This is a limitation - services accessed via context should be pre-initialized
          throw new ServiceError(
            `Service ${name} not initialized. Use initializeService() first or ensure service is eager-loaded.`,
            name,
            agentId
          );
        }
        return service;
      },
      getAgentMetadata: () => {
        const metadata = this.agentRegistry.getAgent(agentId);
        if (!metadata) {
          throw new ServiceError(`Agent ${agentId} not found`, serviceName, agentId);
        }
        return metadata;
      },
      getAgentId: () => agentId,
    };
  }

  /**
   * Cleanup all services for an agent
   */
  async cleanupAgent(agentId: AgentId): Promise<void> {
    const agentServices = this.services.get(agentId);
    if (!agentServices) {
      return;
    }

    for (const [serviceName, service] of agentServices.entries()) {
      if (service.cleanup) {
        try {
          await service.cleanup();
        } catch (error) {
          console.error(`Error cleaning up service ${serviceName}@${agentId}:`, error);
        }
      }
    }

    this.services.delete(agentId);
  }

  /**
   * Cleanup all services
   */
  async cleanupAll(): Promise<void> {
    const agentIds = Array.from(this.services.keys());
    for (const agentId of agentIds) {
      await this.cleanupAgent(agentId);
    }
  }

  /**
   * Persist state for all services
   */
  async persistAllStates(): Promise<void> {
    for (const [agentId, services] of this.services.entries()) {
      for (const [serviceName, service] of services.entries()) {
        if (service.getState) {
          try {
            const state = await service.getState();
            const db = this.db.getDB(agentId, serviceName);
            await db.write(state);
          } catch (error) {
            console.error(`Error persisting state for ${serviceName}@${agentId}:`, error);
          }
        }
      }
    }
  }
}

