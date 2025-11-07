#!/usr/bin/env node

/**
 * Ampelos - Modular MCP Service Framework for Letta Agents
 * 
 * Main entry point for the Ampelos server.
 */

import { Database } from './core/database.js';
import { AgentRegistry } from './core/agent-registry.js';
import { ConfigLoader } from './core/config-loader.js';
import { ModuleLoader } from './core/module-loader.js';
import { ServiceManager } from './core/service-manager.js';
import { MCPServer } from './core/server.js';
import { ConfigWatcher } from './core/config-watcher.js';

async function main() {
  try {
    console.log('Ampelos MCP Server - Starting...');

    // Initialize database
    const db = new Database();
    await db.initialize();
    console.log('Database initialized');

    // Load configuration
    const configLoader = new ConfigLoader();
    await configLoader.loadAgentsConfig();
    console.log('Configuration loaded');

    // Initialize agent registry
    const agentRegistry = new AgentRegistry(
      configLoader.getAgentsConfigPath(),
      db
    );
    await agentRegistry.loadConfig();
    console.log('Agent registry initialized');

    // Load modules
    const moduleLoader = new ModuleLoader();
    const modules = await moduleLoader.loadAllModules();
    console.log(`Loaded ${modules.size} modules`);

    // Initialize service manager
    const serviceManager = new ServiceManager(
      db,
      agentRegistry,
      configLoader,
      modules
    );

    // Initialize eager services
    await serviceManager.initializeEagerServices();
    console.log('Eager services initialized');

    // Create and start MCP server
    const server = new MCPServer(agentRegistry, serviceManager, modules);
    await server.start();

    // Start config watcher for hot-reloading
    const configWatcher = new ConfigWatcher(configLoader, agentRegistry, serviceManager);
    configWatcher.start();

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down...');
      configWatcher.stop();
      await server.stop();
      await serviceManager.persistAllStates();
      await serviceManager.cleanupAll();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
