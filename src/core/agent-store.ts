/**
 * Agent Store - Database-backed CRUD operations for agent definitions
 *
 * Uses SQLite database for all operations. The database handles:
 * - Agent definitions (id, name, enabled)
 * - Per-agent module configurations (optional overrides)
 * - Letta configurations
 * - Templates
 *
 * Note: Modules are no longer "attached" to agents. All modules are available
 * to all agents. Per-agent module configs are optional overrides.
 *
 * CASCADE delete handles cleanup automatically.
 */

import type { Database, AgentRow } from './database.js';
import type { AgentDefinition, AgentTemplate, ModuleInitConfig } from '../types/config.js';
import { createComponentLogger } from './logger.js';

const log = createComponentLogger('AgentStore');

/**
 * Options for creating a new agent.
 * Note: modules field removed - all modules are available to all agents.
 */
export interface CreateAgentOptions {
  id: string;
  name: string;
  enabled?: boolean;
  /**
   * Optional per-agent module config overrides.
   * These are stored in agent_module_configs table.
   */
  moduleConfigs?: Record<string, Record<string, unknown>>;
}

/**
 * Options for updating an agent
 */
export interface UpdateAgentOptions {
  name?: string;
  enabled?: boolean;
}

/**
 * Agent Store class - manages agent definitions in the database
 */
export class AgentStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Get all agent definitions
   */
  async getAllAgents(): Promise<AgentDefinition[]> {
    const rows = this.db.getAllAgents();
    return rows.map(row => this.rowToDefinition(row));
  }

  /**
   * Get a single agent by ID
   */
  async getAgent(agentId: string): Promise<AgentDefinition | null> {
    const row = this.db.getAgent(agentId);
    return row ? this.rowToDefinition(row) : null;
  }

  /**
   * Check if an agent exists
   */
  async hasAgent(agentId: string): Promise<boolean> {
    return this.db.getAgent(agentId) !== undefined;
  }

  /**
   * Create a new agent.
   * Note: Modules are not "attached" - all modules are available.
   * Optional moduleConfigs set per-agent config overrides.
   *
   * Special handling for 'letta' config: stored in agent_letta_configs table
   * so it can be used to initialize the Letta agent.
   */
  async createAgent(options: CreateAgentOptions): Promise<AgentDefinition> {
    // Check if agent already exists
    if (this.db.getAgent(options.id)) {
      throw new Error(`Agent ${options.id} already exists`);
    }

    // Create agent and optionally set module configs
    this.db.transaction(() => {
      // Create the agent
      this.db.createAgent({
        id: options.id,
        name: options.name,
        enabled: options.enabled !== false,
      });

      // Set any provided module configs
      if (options.moduleConfigs) {
        for (const [moduleName, config] of Object.entries(options.moduleConfigs)) {
          if (config && Object.keys(config).length > 0) {
            // Special handling for Letta config - store in dedicated table
            if (moduleName === 'letta') {
              const lettaConfig = (config as any).letta_agent_config || config;
              this.db.setLettaConfig(options.id, {
                model: lettaConfig.model as string | null,
                embedding: lettaConfig.embedding as string | null,
                enable_sleeptime: lettaConfig.enable_sleeptime !== false ? 1 : 0,
                system_prompt_template: lettaConfig.system_prompt_template as string | null,
                memory_blocks: JSON.stringify(lettaConfig.memory_blocks ?? {}),
              });
            } else {
              this.db.setModuleConfig(options.id, moduleName, config);
            }
          }
        }
      }
    });

    log.info(`Created agent: ${options.id}`);
    return (await this.getAgent(options.id))!;
  }

  /**
   * Update an existing agent
   */
  async updateAgent(agentId: string, options: UpdateAgentOptions): Promise<AgentDefinition> {
    const existing = this.db.getAgent(agentId);
    if (!existing) {
      throw new Error(`Agent ${agentId} not found`);
    }

    this.db.updateAgent(agentId, options);

    log.info(`Updated agent: ${agentId}`);
    return (await this.getAgent(agentId))!;
  }

  /**
   * Delete an agent (CASCADE handles related data cleanup)
   */
  async deleteAgent(agentId: string): Promise<boolean> {
    const deleted = this.db.deleteAgent(agentId);
    if (deleted) {
      log.info(`Deleted agent: ${agentId}`);
    }
    return deleted;
  }

  /**
   * Enable an agent
   */
  async enableAgent(agentId: string): Promise<AgentDefinition> {
    return this.updateAgent(agentId, { enabled: true });
  }

  /**
   * Disable an agent
   */
  async disableAgent(agentId: string): Promise<AgentDefinition> {
    return this.updateAgent(agentId, { enabled: false });
  }

  /**
   * Get all enabled agents
   */
  async getEnabledAgents(): Promise<AgentDefinition[]> {
    const agents = await this.getAllAgents();
    return agents.filter((a) => a.enabled);
  }

  /**
   * Get module config for an agent (per-agent override).
   * All modules are available without config - this returns overrides only.
   */
  async getModuleConfig(agentId: string, moduleName: string): Promise<Record<string, unknown> | undefined> {
    return this.db.getModuleConfig(agentId, moduleName);
  }

  /**
   * Set module config for an agent (per-agent override).
   * All modules are available without config - this sets optional overrides.
   */
  async setModuleConfig(agentId: string, moduleName: string, config: Record<string, unknown>): Promise<void> {
    const existing = this.db.getAgent(agentId);
    if (!existing) {
      throw new Error(`Agent ${agentId} not found`);
    }

    this.db.setModuleConfig(agentId, moduleName, config);
    log.info(`Set config for ${moduleName} on ${agentId}`);
  }

  /**
   * Delete module config for an agent.
   * The module remains available - this just removes per-agent overrides.
   */
  async deleteModuleConfig(agentId: string, moduleName: string): Promise<void> {
    const existing = this.db.getAgent(agentId);
    if (!existing) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Delete the config row if it exists
    this.db.run(
      'DELETE FROM agent_module_configs WHERE agent_id = ? AND module_name = ?',
      agentId, moduleName
    );
    log.info(`Deleted config for ${moduleName} on ${agentId}`);
  }

  /**
   * @deprecated Use setModuleConfig instead - modules are no longer "attached"
   */
  async addModule(agentId: string, moduleName: string, config?: Record<string, unknown>): Promise<AgentDefinition> {
    if (config && Object.keys(config).length > 0) {
      await this.setModuleConfig(agentId, moduleName, config);
    }
    return (await this.getAgent(agentId))!;
  }

  /**
   * @deprecated Use setModuleConfig instead
   */
  async updateModuleConfig(agentId: string, moduleName: string, config: Record<string, unknown>): Promise<void> {
    await this.setModuleConfig(agentId, moduleName, config);
  }

  /**
   * @deprecated Use deleteModuleConfig instead - modules are no longer "attached"
   */
  async removeModule(agentId: string, moduleName: string): Promise<AgentDefinition> {
    await this.deleteModuleConfig(agentId, moduleName);
    return (await this.getAgent(agentId))!;
  }

  // ==========================================================================
  // Letta Config Operations
  // ==========================================================================

  /**
   * Get Letta config for an agent
   */
  async getLettaConfig(agentId: string): Promise<Record<string, unknown> | undefined> {
    const row = this.db.getLettaConfig(agentId);
    if (!row) return undefined;

    return {
      model: row.model,
      embedding: row.embedding,
      enable_sleeptime: Boolean(row.enable_sleeptime),
      system_prompt_template: row.system_prompt_template,
      memory_blocks: JSON.parse(row.memory_blocks || '{}'),
    };
  }

  /**
   * Set Letta config for an agent
   */
  async setLettaConfig(agentId: string, config: Record<string, unknown>): Promise<void> {
    this.db.setLettaConfig(agentId, {
      model: config.model as string | null,
      embedding: config.embedding as string | null,
      enable_sleeptime: config.enable_sleeptime !== false ? 1 : 0,
      system_prompt_template: config.system_prompt_template as string | null,
      memory_blocks: JSON.stringify(config.memory_blocks ?? {}),
    });
    log.info(`Set Letta config for ${agentId}`);
  }

  // ==========================================================================
  // Agent Templates
  // ==========================================================================

  /**
   * Get all agent templates
   */
  async getAllTemplates(): Promise<AgentTemplate[]> {
    const rows = this.db.getAllTemplates();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      modules: JSON.parse(row.modules),
      variables: JSON.parse(row.variables),
      created_at: row.created_at,
    }));
  }

  /**
   * Get a single agent template by ID
   */
  async getTemplate(templateId: string): Promise<AgentTemplate | null> {
    const row = this.db.getTemplate(templateId);
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      modules: JSON.parse(row.modules),
      variables: JSON.parse(row.variables),
      created_at: row.created_at,
    };
  }

  /**
   * Create an agent template
   */
  async createTemplate(template: AgentTemplate): Promise<AgentTemplate> {
    const existing = this.db.getTemplate(template.id);
    if (existing) {
      throw new Error(`Template ${template.id} already exists`);
    }

    this.db.createTemplate({
      id: template.id,
      name: template.name,
      description: template.description ?? null,
      modules: JSON.stringify(template.modules),
      variables: JSON.stringify(template.variables),
      created_at: template.created_at || new Date().toISOString(),
    });

    log.info(`Created template: ${template.id}`);
    return template;
  }

  /**
   * Delete an agent template
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    const deleted = this.db.deleteTemplate(templateId);
    if (deleted) {
      log.info(`Deleted template: ${templateId}`);
    }
    return deleted;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Convert database row to AgentDefinition.
   * Note: modules field removed - all modules are available to all agents.
   */
  private rowToDefinition(row: AgentRow): AgentDefinition {
    return {
      id: row.id,
      name: row.name,
      enabled: Boolean(row.enabled),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
