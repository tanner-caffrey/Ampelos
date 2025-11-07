/**
 * Configuration Watcher - watches for config file changes and hot-reloads
 */

import { watchFile, unwatchFile } from 'fs';
import type { AgentsConfig } from '../types/config.js';
import { ConfigLoader } from './config-loader.js';
import { AgentRegistry } from './agent-registry.js';
import { ServiceManager } from './service-manager.js';

/**
 * Configuration Watcher class
 */
export class ConfigWatcher {
  private configLoader: ConfigLoader;
  private agentRegistry: AgentRegistry;
  private serviceManager: ServiceManager;
  private isWatching: boolean = false;
  private configPath: string;
  private isReloading: boolean = false;

  constructor(
    configLoader: ConfigLoader,
    agentRegistry: AgentRegistry,
    serviceManager: ServiceManager
  ) {
    this.configLoader = configLoader;
    this.agentRegistry = agentRegistry;
    this.serviceManager = serviceManager;
    this.configPath = configLoader.getAgentsConfigPath();
  }

  /**
   * Start watching for configuration changes
   */
  start(): void {
    if (this.isWatching) {
      return; // Already watching
    }

    watchFile(this.configPath, { interval: 1000 }, async (curr: { mtime: Date }, prev: { mtime: Date }) => {
      if (curr.mtime !== prev.mtime && !this.isReloading) {
        await this.handleConfigChange();
      }
    });

    this.isWatching = true;
    console.log(`Watching config file: ${this.configPath}`);
  }

  /**
   * Stop watching for configuration changes
   */
  stop(): void {
    if (this.isWatching) {
      unwatchFile(this.configPath);
      this.isWatching = false;
    }
  }

  /**
   * Handle configuration file change
   */
  private async handleConfigChange(): Promise<void> {
    if (this.isReloading) {
      return; // Already reloading
    }

    this.isReloading = true;
    console.log('Configuration file changed, reloading...');

    try {
      // Wait a bit for file write to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Load new configuration
      const newConfig = await this.configLoader.loadAgentsConfig();

      // Get old configuration
      const oldConfig = this.configLoader.getAgentsConfig();

      if (!oldConfig) {
        console.warn('No old configuration to compare');
        this.isReloading = false;
        return;
      }

      // Compare configurations and reload affected agents
      await this.reloadAffectedAgents(oldConfig, newConfig);

      // Reload agent registry
      await this.agentRegistry.loadConfig();

      console.log('Configuration reloaded successfully');
    } catch (error) {
      console.error('Failed to reload configuration:', error);
      // Try to reload old config
      try {
        await this.configLoader.loadAgentsConfig();
      } catch (reloadError) {
        console.error('Failed to restore old configuration:', reloadError);
      }
    } finally {
      this.isReloading = false;
    }
  }

  /**
   * Reload affected agents when configuration changes
   */
  private async reloadAffectedAgents(
    oldConfig: AgentsConfig,
    newConfig: AgentsConfig
  ): Promise<void> {
    // Find agents with changed module configurations
    for (const [agentId, newAgentConfig] of Object.entries(newConfig.agents)) {
      const oldAgentConfig = oldConfig.agents[agentId];
      
      if (!oldAgentConfig) {
        // New agent - skip (requires restart to add new agents)
        continue;
      }

      // Check for module config changes
      for (const [moduleName, newModuleConfig] of Object.entries(newAgentConfig.modules)) {
        const oldModuleConfig = oldAgentConfig.modules[moduleName];
        
        if (!oldModuleConfig) {
          // New module - skip (requires restart to add new modules)
          continue;
        }

        // Compare configurations (simple deep equality check)
        if (JSON.stringify(oldModuleConfig) !== JSON.stringify(newModuleConfig)) {
          // Config changed - trigger onConfigChange
          await this.handleModuleConfigChange(agentId, moduleName, oldModuleConfig, newModuleConfig);
        }
      }
    }
  }

  /**
   * Handle module configuration change
   */
  private async handleModuleConfigChange(
    agentId: string,
    moduleName: string,
    oldConfig: Record<string, unknown>,
    newConfig: Record<string, unknown>
  ): Promise<void> {
    // Resolve the actual config objects (with defaults)
    // We need to get the module manifest to resolve defaults
    // For now, we'll pass the raw configs and let the service handle it
    
    const service = this.serviceManager.getService(agentId as any, moduleName);
    if (!service) {
      // Service not initialized, nothing to update
      return;
    }

    if (service.onConfigChange) {
      try {
        // Resolve new config with defaults
        // This is a simplified version - in production, we'd resolve with module manifest
        await service.onConfigChange(oldConfig, newConfig);
        console.log(`Config updated for ${moduleName}@${agentId}`);
      } catch (error) {
        console.error(`Failed to update config for ${moduleName}@${agentId}:`, error);
      }
    }
  }
}

