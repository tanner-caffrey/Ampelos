/**
 * Agent Registry - Runtime cache for agent metadata
 *
 * Simplified architecture:
 * - Thin cache layer over AgentStore
 * - No JSON loading - all data from database
 * - Read-only access to cached metadata
 */

import type { AgentDefinition } from '../types/config.js';
import type { AgentId, AgentMetadata } from '../types/agent.js';
import { createAgentId, createAgentName } from '../types/agent.js';
import { AgentStore } from './agent-store.js';
import { createComponentLogger } from './logger.js';

const log = createComponentLogger('AgentRegistry');

/**
 * Agent Registry class
 */
export class AgentRegistry {
  private cache: Map<AgentId, AgentMetadata> = new Map();
  private store: AgentStore;

  constructor(store: AgentStore) {
    this.store = store;
  }

  /**
   * Get the underlying AgentStore
   */
  getStore(): AgentStore {
    return this.store;
  }

  /**
   * Load agents from database into cache
   */
  async loadAgents(): Promise<void> {
    const agents = await this.store.getAllAgents();

    this.cache.clear();

    for (const agent of agents) {
      const metadata = this.toMetadata(agent);
      this.cache.set(metadata.agent_id, metadata);
    }

    log.info('Loaded agents from database', { count: this.cache.size });
  }

  /**
   * Reload agent cache from database
   */
  async reload(): Promise<void> {
    await this.loadAgents();
  }

  /**
   * Refresh a single agent in cache
   */
  async refreshAgent(agentId: AgentId): Promise<AgentMetadata | null> {
    const agent = await this.store.getAgent(agentId);

    if (!agent) {
      this.cache.delete(agentId);
      return null;
    }

    const metadata = this.toMetadata(agent);
    this.cache.set(agentId, metadata);
    return metadata;
  }

  /**
   * Add agent to cache (after creation)
   */
  addToCache(agent: AgentDefinition): AgentMetadata {
    const metadata = this.toMetadata(agent);
    this.cache.set(metadata.agent_id, metadata);
    return metadata;
  }

  /**
   * Remove agent from cache
   */
  removeFromCache(agentId: AgentId): void {
    this.cache.delete(agentId);
  }

  /**
   * Get agent metadata by ID
   */
  getAgent(agentId: AgentId): AgentMetadata | undefined {
    return this.cache.get(agentId);
  }

  /**
   * Get all enabled agents
   */
  getEnabledAgents(): AgentMetadata[] {
    return Array.from(this.cache.values()).filter((agent) => agent.enabled);
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentMetadata[] {
    return Array.from(this.cache.values());
  }

  /**
   * Check if an agent exists
   */
  hasAgent(agentId: AgentId): boolean {
    return this.cache.has(agentId);
  }

  /**
   * Check if an agent is enabled
   */
  isEnabled(agentId: AgentId): boolean {
    const agent = this.cache.get(agentId);
    return agent?.enabled ?? false;
  }

  /**
   * Convert AgentDefinition to AgentMetadata.
   * Note: modules field removed - all modules are available to all agents.
   */
  private toMetadata(agent: AgentDefinition): AgentMetadata {
    return {
      agent_id: createAgentId(agent.id),
      agent_name: createAgentName(agent.name),
      enabled: agent.enabled,
    };
  }
}
