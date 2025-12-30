/**
 * Config Loader - Loads agent configurations from database
 *
 * Architecture:
 * - Database is the single source of truth for agent configs
 * - No more JSON config files - all configuration lives in SQLite
 * - Modules are no longer "attached" to agents - all are available
 * - Per-agent module configs are optional overrides
 */

import type { Database } from './database.js';
import type { LettaAgentConfig } from './letta/index.js';
import { createComponentLogger } from './logger.js';

const log = createComponentLogger('ConfigLoader');

/**
 * Module configuration (per-agent override).
 * All modules are available without config - these are optional overrides.
 */
export interface ModuleConfig {
  [key: string]: unknown;
}

/**
 * Parsed agent configuration.
 * Note: modules field removed - all modules are available to all agents.
 */
export interface ParsedAgentConfig {
  id: string;
  name: string;
  enabled: boolean;
  letta?: LettaAgentConfig;
}

/**
 * Config Loader class - reads agent configs from database
 */
export class ConfigLoader {
  private db: Database;
  private agents: Map<string, ParsedAgentConfig> = new Map();
  private loaded = false;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Load configuration from database.
   * Note: Module list loading removed - all modules are available to all agents.
   */
  async load(): Promise<void> {
    this.agents.clear();

    // Get all agents from database
    const agentRows = this.db.getAllAgents();

    for (const agentRow of agentRows) {
      const agentId = agentRow.id;

      // Get Letta config if it exists
      const lettaRow = this.db.getLettaConfig(agentId);
      let lettaConfig: LettaAgentConfig | undefined;

      if (lettaRow && lettaRow.model && lettaRow.embedding && lettaRow.system_prompt_template) {
        lettaConfig = {
          model: lettaRow.model,
          embedding: lettaRow.embedding,
          enable_sleeptime: Boolean(lettaRow.enable_sleeptime),
          system_prompt_template: lettaRow.system_prompt_template,
          memory_blocks: JSON.parse(lettaRow.memory_blocks || '{}'),
        };
      }

      this.agents.set(agentId, {
        id: agentId,
        name: agentRow.name,
        enabled: Boolean(agentRow.enabled),
        letta: lettaConfig,
      });
    }

    this.loaded = true;
    log.info('Loaded agent configs from database', { count: this.agents.size });
  }

  /**
   * Get all agent configurations
   */
  getAllAgents(): ParsedAgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get enabled agent configurations
   */
  getEnabledAgents(): ParsedAgentConfig[] {
    return Array.from(this.agents.values()).filter((a) => a.enabled);
  }

  /**
   * Get a specific agent's configuration
   */
  getAgent(agentId: string): ParsedAgentConfig | undefined {
    // If not loaded yet, try to load just this agent
    if (!this.loaded || !this.agents.has(agentId)) {
      this.loadAgent(agentId);
    }
    return this.agents.get(agentId);
  }

  /**
   * Get module configuration for an agent (per-agent override).
   * All modules are available without config - this returns overrides only.
   * Queries database directly for fresh config.
   */
  getModuleConfig(agentId: string, moduleName: string): ModuleConfig | undefined {
    // Query database directly for per-agent module config override
    return this.db.getModuleConfig(agentId, moduleName);
  }

  /**
   * Get Letta configuration for an agent
   */
  getLettaConfig(agentId: string): LettaAgentConfig | undefined {
    const agent = this.getAgent(agentId);
    return agent?.letta;
  }

  /**
   * Reload configuration from database
   */
  async reload(): Promise<void> {
    await this.load();
  }

  /**
   * Invalidate cache for an agent (forces reload on next access)
   */
  invalidateAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  /**
   * Invalidate all cached configs
   */
  invalidateAll(): void {
    this.agents.clear();
    this.loaded = false;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Load a single agent's config from database.
   * Note: Module list loading removed - all modules are available to all agents.
   */
  private loadAgent(agentId: string): void {
    const agentRow = this.db.getAgent(agentId);
    if (!agentRow) return;

    // Get Letta config
    const lettaRow = this.db.getLettaConfig(agentId);
    let lettaConfig: LettaAgentConfig | undefined;

    if (lettaRow && lettaRow.model && lettaRow.embedding && lettaRow.system_prompt_template) {
      lettaConfig = {
        model: lettaRow.model,
        embedding: lettaRow.embedding,
        enable_sleeptime: Boolean(lettaRow.enable_sleeptime),
        system_prompt_template: lettaRow.system_prompt_template,
        memory_blocks: JSON.parse(lettaRow.memory_blocks || '{}'),
      };
    }

    this.agents.set(agentId, {
      id: agentId,
      name: agentRow.name,
      enabled: Boolean(agentRow.enabled),
      letta: lettaConfig,
    });
  }
}
