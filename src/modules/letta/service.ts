/**
 * Letta Service
 *
 * Manages Letta agent lifecycle and state
 */

import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import { LettaClient, AgentInfo } from './client.js';
import { buildAgentConfig, validateLettaConfig } from './utils/memory-builder.js';
import type { LettaModuleConfig, LettaAgentConfig } from './utils/config-validator.js';

interface LettaServiceState extends Record<string, unknown> {
  letta_agent_id?: string;
  agent_info?: AgentInfo;
  initialized: boolean;
  last_sync: string;
}

export class LettaService implements BaseService {
  private client?: LettaClient;
  private agentId?: AgentId;
  private config?: LettaModuleConfig;
  private context?: ServiceContext;
  private state: LettaServiceState = {
    initialized: false,
    last_sync: new Date().toISOString()
  };

  /**
   * Initialize the Letta service
   */
  async init(
    agentId: AgentId,
    config: Record<string, unknown>,
    context: ServiceContext
  ): Promise<void> {
    this.agentId = agentId;
    this.config = config as LettaModuleConfig;
    this.context = context;

    // Initialize Letta client
    this.client = new LettaClient({
      base_url: this.config.server.base_url,
      token: this.config.server.token
    });

    // Restore state if available
    const savedState = await context.getDB().read<LettaServiceState>();
    if (savedState && savedState.initialized) {
      this.state = savedState;
    }

    // Ensure agent exists in Letta
    if (this.config.letta_agent_config) {
      await this.ensureAgent(this.config.letta_agent_config);
    }

    // Save state
    this.state.initialized = true;
    this.state.last_sync = new Date().toISOString();
    await context.getDB().write(this.state);
  }

  /**
   * Ensure Letta agent exists, create if necessary
   */
  private async ensureAgent(agentConfig: LettaAgentConfig): Promise<void> {
    if (!this.client || !this.agentId || !this.context) {
      throw new Error('Service not initialized');
    }

    // Validate config
    validateLettaConfig(agentConfig);

    // Check if we have a stored Letta agent ID
    if (this.state.letta_agent_id) {
      // Verify agent still exists
      const exists = await this.client.agentExists(this.state.letta_agent_id);
      if (exists) {
        // Update agent info
        this.state.agent_info = await this.client.getAgent(this.state.letta_agent_id);
        console.log(`[Letta] Connected to existing agent: ${this.state.letta_agent_id}`);
        return;
      } else {
        console.log(`[Letta] Stored agent ID ${this.state.letta_agent_id} not found, creating new agent`);
      }
    }

    // Create new agent
    const agentName = this.context.getAgentMetadata().agent_name;
    console.log(`[Letta] Creating new agent for ${agentName}`);

    const createConfig = await buildAgentConfig(agentName, agentConfig);

    this.state.letta_agent_id = await this.client.createAgent(createConfig);
    this.state.agent_info = await this.client.getAgent(this.state.letta_agent_id);

    console.log(`[Letta] Created agent: ${this.state.letta_agent_id}`);
  }

  /**
   * Get the Letta agent ID
   */
  getLettaAgentId(): string | undefined {
    return this.state.letta_agent_id;
  }

  /**
   * Get agent information
   */
  getAgentInfo(): AgentInfo | undefined {
    return this.state.agent_info;
  }

  /**
   * Get the Letta client
   */
  getClient(): LettaClient {
    if (!this.client) {
      throw new Error('Letta service not initialized');
    }
    return this.client;
  }

  /**
   * Send a message to the agent
   */
  async chat(message: string): Promise<any> {
    if (!this.client || !this.state.letta_agent_id) {
      throw new Error('Letta agent not initialized');
    }

    return await this.client.sendMessage(this.state.letta_agent_id, message);
  }

  /**
   * Get agent memory blocks
   */
  async getMemory(): Promise<Record<string, string>> {
    if (!this.client || !this.state.letta_agent_id) {
      throw new Error('Letta agent not initialized');
    }

    return await this.client.getMemory(this.state.letta_agent_id);
  }

  /**
   * Update a memory block
   */
  async updateMemory(blockName: string, value: string): Promise<void> {
    if (!this.client || !this.state.letta_agent_id) {
      throw new Error('Letta agent not initialized');
    }

    await this.client.updateMemory(this.state.letta_agent_id, blockName, value);
  }

  /**
   * Search archival memory
   */
  async searchArchival(query: string, page: number = 0): Promise<any[]> {
    if (!this.client || !this.state.letta_agent_id) {
      throw new Error('Letta agent not initialized');
    }

    return await this.client.searchArchival(this.state.letta_agent_id, query, page);
  }

  /**
   * Insert into archival memory
   */
  async insertArchival(content: string): Promise<void> {
    if (!this.client || !this.state.letta_agent_id) {
      throw new Error('Letta agent not initialized');
    }

    await this.client.insertArchival(this.state.letta_agent_id, content);
  }

  /**
   * Get conversation messages
   */
  async getMessages(limit: number = 50): Promise<any[]> {
    if (!this.client || !this.state.letta_agent_id) {
      throw new Error('Letta agent not initialized');
    }

    return await this.client.getMessages(this.state.letta_agent_id, limit);
  }

  /**
   * Handle configuration changes
   */
  async onConfigChange(
    oldConfig: Record<string, unknown>,
    newConfig: Record<string, unknown>
  ): Promise<void> {
    const old = oldConfig as LettaModuleConfig;
    const neu = newConfig as LettaModuleConfig;

    // Check if server config changed
    if (old.server.base_url !== neu.server.base_url || old.server.token !== neu.server.token) {
      console.log('[Letta] Server config changed, reconnecting...');
      this.client = new LettaClient({
        base_url: neu.server.base_url,
        token: neu.server.token
      });
    }

    // Note: Agent config changes require service restart
    // as we don't support modifying existing agents yet
    if (JSON.stringify(old.letta_agent_config) !== JSON.stringify(neu.letta_agent_config)) {
      console.log('[Letta] Agent config changed - restart required for full effect');
    }

    this.config = neu;
  }

  /**
   * Get current service state
   */
  async getState(): Promise<Record<string, unknown>> {
    return this.state;
  }

  /**
   * Restore service state
   */
  async setState(state: Record<string, unknown>): Promise<void> {
    this.state = {
      letta_agent_id: state.letta_agent_id as string | undefined,
      agent_info: state.agent_info as AgentInfo | undefined,
      initialized: Boolean(state.initialized),
      last_sync: (state.last_sync as string) || new Date().toISOString()
    };
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup(): Promise<void> {
    // Save final state
    if (this.context) {
      await this.context.getDB().write(this.state);
    }
  }
}
