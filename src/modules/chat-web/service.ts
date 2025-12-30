/**
 * Chat Web Service (Singleton)
 *
 * Provides web-based chat interface endpoints.
 * This is a simple service that just tracks initialization state per agent.
 */

import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import { createComponentLogger } from '../../core/logger.js';

const log = createComponentLogger('ChatWeb');

const SERVICE_NAME = 'chat-web';

interface ChatWebState {
  initialized: boolean;
}

export default class ChatWebService implements BaseService {
  private context?: ServiceContext;
  private initializedAgents: Set<AgentId> = new Set();

  /**
   * Initialize the service (global, once at startup)
   */
  async init(context: ServiceContext): Promise<void> {
    this.context = context;
    log.info('Service initialized');
  }

  /**
   * Check if an agent can reconnect without config
   */
  canReconnect(_agentId: AgentId, _state: Record<string, unknown>): boolean {
    // Chat web can always reconnect - no special state needed
    return true;
  }

  /**
   * Initialize chat-web for a specific agent
   */
  async initAgent(agentId: AgentId, _config: Record<string, unknown>): Promise<void> {
    if (!this.context) {
      throw new Error('ChatWeb service not initialized');
    }

    const state = this.context.getState<ChatWebState>(agentId, SERVICE_NAME);
    state.set({ initialized: true });

    this.initializedAgents.add(agentId);
    log.info(`Initialized for agent ${agentId}`);
  }

  /**
   * Check if an agent is initialized
   */
  isAgentInitialized(agentId: AgentId): boolean {
    return this.initializedAgents.has(agentId);
  }

  /**
   * Clean up agent-specific resources
   */
  async cleanupAgent(agentId: AgentId): Promise<void> {
    this.initializedAgents.delete(agentId);
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup(): Promise<void> {
    this.initializedAgents.clear();
  }
}
