/**
 * Configuration Loader - loads and resolves module configurations
 */

import { readFile } from 'fs/promises';
import { join, isAbsolute } from 'path';
import type { AgentsConfig, ModuleConfig } from '../types/config.js';
import type { ModuleManifest } from '../types/module.js';
import { validateConfig } from './schema-validator.js';

/**
 * Configuration Loader class
 */
export class ConfigLoader {
  private agentsConfigPath: string;
  private agentsConfig: AgentsConfig | null = null;

  constructor(agentsConfigPath?: string) {
    this.agentsConfigPath = agentsConfigPath ?? join(process.cwd(), 'configs', 'agents.json');
  }

  /**
   * Load agents configuration
   */
  async loadAgentsConfig(): Promise<AgentsConfig> {
    try {
      const content = await readFile(this.agentsConfigPath, 'utf-8');
      this.agentsConfig = JSON.parse(content);
      if (!this.agentsConfig) {
        throw new Error('Failed to parse agents configuration');
      }
      return this.agentsConfig;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Agents configuration file not found: ${this.agentsConfigPath}`);
      }
      throw error;
    }
  }

  /**
   * Resolve module configuration for an agent
   * Priority: inline > config_file > module defaults
   */
  async resolveModuleConfig(
    agentId: string,
    moduleName: string,
    manifest: ModuleManifest
  ): Promise<Record<string, unknown>> {
    if (!this.agentsConfig) {
      throw new Error('Agents config not loaded. Call loadAgentsConfig() first.');
    }

    const agentConfig = this.agentsConfig.agents[agentId];
    if (!agentConfig) {
      throw new Error(`Agent ${agentId} not found in configuration`);
    }

    const moduleConfig = agentConfig.modules[moduleName];
    if (!moduleConfig) {
      // Return default config from manifest
      return this.getDefaultConfig(manifest);
    }

    // Start with module defaults
    let resolved: Record<string, unknown> = this.getDefaultConfig(manifest);

    // Load external config file if specified (second priority)
    if (moduleConfig.config_file) {
      const externalConfig = await this.loadExternalConfig(moduleConfig.config_file);
      resolved = { ...resolved, ...externalConfig };
    }

    // Apply inline config (highest priority)
    const inlineConfig = { ...moduleConfig };
    delete inlineConfig.config_file; // Remove config_file from inline config
    resolved = { ...resolved, ...inlineConfig };

    // Validate resolved config against schema if available
    if (manifest.config_schema) {
      const validation = validateConfig(resolved, manifest.config_schema);
      if (!validation.valid) {
        throw new Error(
          `Invalid configuration for module ${moduleName}: ${validation.errors?.join(', ')}`
        );
      }
      // Use validated data (may have been coerced)
      if (validation.data) {
        resolved = validation.data as Record<string, unknown>;
      }
    }

    return resolved;
  }

  /**
   * Get default configuration from manifest
   */
  private getDefaultConfig(manifest: ModuleManifest): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};

    if (manifest.config_schema?.properties) {
      for (const [key, schema] of Object.entries(manifest.config_schema.properties)) {
        if ('default' in schema) {
          defaults[key] = schema.default;
        }
      }
    }

    // Default lazy to true if not specified
    if (!('lazy' in defaults)) {
      defaults.lazy = true;
    }

    return defaults;
  }

  /**
   * Load external configuration file
   */
  private async loadExternalConfig(configFilePath: string): Promise<Record<string, unknown>> {
    // Resolve path relative to configs directory or absolute
    const resolvedPath = isAbsolute(configFilePath)
      ? configFilePath
      : join(process.cwd(), 'configs', configFilePath);

    try {
      const content = await readFile(resolvedPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`External config file not found: ${resolvedPath}`);
      }
      throw error;
    }
  }

  /**
   * Get module config object (for checking auto_initialize, etc.)
   */
  getModuleConfigObject(agentId: string, moduleName: string): ModuleConfig | undefined {
    if (!this.agentsConfig) {
      return undefined;
    }

    const agentConfig = this.agentsConfig.agents[agentId];
    return agentConfig?.modules[moduleName];
  }

  /**
   * Get agents config (cached)
   */
  getAgentsConfig(): AgentsConfig | null {
    return this.agentsConfig;
  }

  /**
   * Get the agents config path
   */
  getAgentsConfigPath(): string {
    return this.agentsConfigPath;
  }
}

