#!/usr/bin/env node

/**
 * Ampelos - Modular MCP Service Framework for Letta Agents
 *
 * Main entry point for the Ampelos server.
 *
 * Architecture:
 * - SQLite database: Single source of truth for all configuration and state
 * - No more config files - all data lives in the database
 * - Use migration script to import existing data from JSON files
 */

// Load environment variables from .env file FIRST
import 'dotenv/config';

// Initialize logger immediately after dotenv
import { initializeLogger, createComponentLogger, type ILogger } from './core/logger.js';

// Initialize logger synchronously-style with top-level await
const log: ILogger = await initializeLogger();
const mainLog = log.child('Main');

// Global error handlers to prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
  mainLog.error('Unhandled Promise Rejection', {
    reason: String(reason),
    promise: String(promise),
  });
});

process.on('uncaughtException', (error) => {
  mainLog.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

import { Database } from './core/database.js';
import { StateManager } from './core/state-manager.js';
import { AgentStore } from './core/agent-store.js';
import { AgentRegistry } from './core/agent-registry.js';
import { ConfigLoader } from './core/config-loader.js';
import { ModuleLoader } from './core/module-loader.js';
import { ServiceManager } from './core/service-manager.js';
import { MCPServer } from './core/server.js';
import { TemplateRegistry } from './core/template-registry.js';
import { ToolManager } from './core/tool-manager.js';
import { lettaManager } from './core/letta/index.js';

async function main() {
  try {
    mainLog.info('Ampelos MCP Server - Starting...');

    // Initialize SQLite database (creates schema if needed)
    const db = new Database();
    db.initialize();
    mainLog.info('Database initialized');

    // Initialize state manager (auto-persisting reactive state)
    const stateManager = new StateManager(db);
    await stateManager.initialize();
    mainLog.info('State manager initialized');

    // Initialize agent store (CRUD for agents)
    const agentStore = new AgentStore(db);
    mainLog.info('Agent store initialized');

    // Load agent configurations from database
    const configLoader = new ConfigLoader(db);
    await configLoader.load();
    mainLog.info('Config loader initialized');

    // Initialize agent registry
    const agentRegistry = new AgentRegistry(agentStore);
    await agentRegistry.loadAgents();
    mainLog.info('Agent registry initialized');

    // Initialize template registry (for memory block templates)
    const templateRegistry = new TemplateRegistry(db);
    await templateRegistry.initialize();
    mainLog.info('Template registry initialized');

    // Load modules (keyed by manifest.name)
    const moduleLoader = new ModuleLoader();
    const modules = await moduleLoader.loadAllModules();
    mainLog.info(`Loaded ${modules.size} modules`);

    // Note: Module validation removed - all modules are now available to all agents

    // Initialize service manager
    const serviceManager = new ServiceManager(db, stateManager, agentRegistry, configLoader, modules);

    // Create MCP server (before initializing services)
    const server = new MCPServer(agentRegistry, serviceManager, modules);

    // Initialize LettaManager (core infrastructure, before services)
    await lettaManager.init(
      {
        // Route 'letta' namespace to dedicated letta_state table, others to agent_service_state
        getState: (agentId, serviceName) =>
          serviceName === 'letta'
            ? stateManager.getLettaState(agentId)
            : stateManager.getServiceState(agentId, serviceName),
        getAgentMetadata: (agentId) => {
          const metadata = agentRegistry.getAgent(agentId);
          if (!metadata) throw new Error(`Agent ${agentId} not found`);
          return metadata;
        },
        getEnabledAgentIds: () => agentRegistry.getEnabledAgents().map(a => a.agent_id),
        getLettaTools: (agentId) => serviceManager.getServiceContext().getLettaTools?.(agentId) ?? [],
      },
      (lettaAgentId, ampelosAgentId) => server.registerLettaAgent(lettaAgentId, ampelosAgentId)
    );
    mainLog.info('Letta manager initialized');

    // Set LettaManager in server and service manager
    server.setLettaManager(lettaManager);
    serviceManager.setLettaManager(lettaManager);

    // Set MCP server reference in service manager (for Letta agent registration)
    serviceManager.setMCPServer(server);

    // Set agent store reference in service manager (for database config lookups)
    serviceManager.setAgentStore(agentStore);

    // Initialize tool manager for tool attachment APIs
    const toolManager = new ToolManager(db, moduleLoader);

    // Set up admin API router in server
    server.setAdminRouter(db, agentStore, templateRegistry, modules, toolManager);

    // Initialize service singletons first
    await serviceManager.initializeServices();
    mainLog.info('Service singletons initialized');

    // Initialize Letta for all enabled agents with Letta config
    const enabledAgents = agentRegistry.getEnabledAgents();

    // Preload letta state for all enabled agents
    // Note: With SQLite this is synchronous, but we keep the API for compatibility
    for (const agent of enabledAgents) {
      await stateManager.preloadAgentState(agent.agent_id, ['letta']);
    }

    for (const agent of enabledAgents) {
      const lettaConfig = configLoader.getLettaConfig(agent.agent_id);
      try {
        await lettaManager.initAgent(agent.agent_id, lettaConfig);
      } catch (error) {
        const err = error as Error;
        mainLog.error(`Failed to init Letta agent ${agent.agent_id}`, {
          error: err.message,
          stack: err.stack,
        });
      }
    }
    mainLog.info('Letta agents initialized');

    // Eager-init services for agents with existing state (restores polling, timers, etc.)
    await serviceManager.eagerInitializeServicesWithState();
    mainLog.info('Services with existing state initialized');

    // Start MCP server
    await server.start();

    // Handle graceful shutdown
    const shutdown = async () => {
      mainLog.info('Shutting down...');
      await server.stop();
      await lettaManager.cleanup();
      await serviceManager.cleanupAll(); // Flushes state and cleans up
      db.close(); // Close SQLite connection

      // Flush logs before exit
      await log.flush();

      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    const err = error as Error;
    mainLog.error('Failed to start server', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

main();
