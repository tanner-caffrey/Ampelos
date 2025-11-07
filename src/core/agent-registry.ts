/**
 * Agent Registry - manages agent configurations and metadata
 */

import { readFile } from 'fs/promises';
import type { AgentsConfig, AgentConfig } from '../types/config.js';
import type { AgentId, AgentMetadata } from '../types/agent.js';
import { createAgentId, createAgentName } from '../types/agent.js';
import { Database } from './database.js';

/**
 * Agent Registry class
 */
export class AgentRegistry {
  private agents: Map<AgentId, AgentMetadata> = new Map();
  private configs: Map<AgentId, AgentConfig> = new Map();
  private configPath: string;
  private db: Database;

  constructor(configPath: string, db: Database) {
    this.configPath = configPath;
    this.db = db;
  }

  /**
   * Load agent configurations from agents.json
   */
  async loadConfig(): Promise<void> {
    try {
      const content = await readFile(this.configPath, 'utf-8');
      const config: AgentsConfig = JSON.parse(content);

      // Validate structure
      if (!config.agents || typeof config.agents !== 'object') {
        throw new Error('Invalid agents.json: missing or invalid "agents" field');
      }

      // Clear existing data
      this.agents.clear();
      this.configs.clear();

      // Load each agent
      for (const [agentIdStr, agentConfig] of Object.entries(config.agents)) {
        const agentId = createAgentId(agentIdStr);
        const agentName = createAgentName(agentConfig.name);

        // Validate agent config
        if (!agentConfig.name || typeof agentConfig.name !== 'string') {
          throw new Error(`Invalid config for agent ${agentIdStr}: missing or invalid "name"`);
        }
        if (typeof agentConfig.enabled !== 'boolean') {
          throw new Error(`Invalid config for agent ${agentIdStr}: missing or invalid "enabled"`);
        }
        if (!agentConfig.modules || typeof agentConfig.modules !== 'object') {
          throw new Error(`Invalid config for agent ${agentIdStr}: missing or invalid "modules"`);
        }

        // Create metadata
        const metadata: AgentMetadata = {
          agent_id: agentId,
          agent_name: agentName,
          enabled: agentConfig.enabled,
          modules: Object.keys(agentConfig.modules),
          stats: {},
        };

        // Load existing metadata from database if available
        const db = this.db.getRawDB();
        await db.read();
        if (db.data?.agents?.[agentIdStr]) {
          const dbAgent = db.data.agents[agentIdStr];
          if (dbAgent.metadata.last_request_time) {
            metadata.last_request_time = new Date(dbAgent.metadata.last_request_time);
          }
          if (dbAgent.metadata.last_response_time) {
            metadata.last_response_time = new Date(dbAgent.metadata.last_response_time);
          }
          if (dbAgent.metadata.stats) {
            metadata.stats = dbAgent.metadata.stats;
          }
        }

        this.agents.set(agentId, metadata);
        this.configs.set(agentId, agentConfig);
      }

      // Persist to database
      await this.syncToDatabase();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }
      throw error;
    }
  }

  /**
   * Sync agent metadata to database
   */
  private async syncToDatabase(): Promise<void> {
    const db = this.db.getRawDB();
    await db.read();
    
    if (!db.data) {
      db.data = { agents: {}, states: {}, configs: {} };
    }
    
    if (!db.data.agents) {
      db.data.agents = {};
    }

    for (const [agentId, metadata] of this.agents.entries()) {
      db.data.agents[agentId] = {
        name: metadata.agent_name,
        enabled: metadata.enabled,
        modules: metadata.modules,
        metadata: {
          last_request_time: metadata.last_request_time?.toISOString(),
          last_response_time: metadata.last_response_time?.toISOString(),
          ...metadata.stats,
        },
      };
    }

    await db.write();
  }

  /**
   * Get agent metadata by ID
   */
  getAgent(agentId: AgentId): AgentMetadata | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get agent configuration by ID
   */
  getAgentConfig(agentId: AgentId): AgentConfig | undefined {
    return this.configs.get(agentId);
  }

  /**
   * Get all enabled agents
   */
  getEnabledAgents(): AgentMetadata[] {
    return Array.from(this.agents.values()).filter(agent => agent.enabled);
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentMetadata[] {
    return Array.from(this.agents.values());
  }

  /**
   * Check if an agent exists
   */
  hasAgent(agentId: AgentId): boolean {
    return this.agents.has(agentId);
  }

  /**
   * Check if an agent is enabled
   */
  isEnabled(agentId: AgentId): boolean {
    const agent = this.agents.get(agentId);
    return agent?.enabled ?? false;
  }

  /**
   * Update agent's last request time
   */
  async updateLastRequestTime(agentId: AgentId): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.last_request_time = new Date();
      await this.syncToDatabase();
    }
  }

  /**
   * Update agent's last response time
   */
  async updateLastResponseTime(agentId: AgentId): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.last_response_time = new Date();
      await this.syncToDatabase();
    }
  }

  /**
   * Get module configuration for an agent
   */
  getModuleConfig(agentId: AgentId, moduleName: string): Record<string, unknown> | undefined {
    const config = this.configs.get(agentId);
    return config?.modules[moduleName];
  }
}

