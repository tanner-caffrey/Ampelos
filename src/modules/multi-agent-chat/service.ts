/**
 * Multi-Agent Chat Service (Singleton)
 *
 * Manages multi-agent conversations using Letta Groups.
 * This is a global singleton - conversations are shared across all agents
 * since they inherently involve multiple agents.
 */

import { randomUUID } from 'node:crypto';
import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import { createComponentLogger } from '../../core/logger.js';
import type { LettaClientWrapper, GroupManagerType } from '../../core/letta/letta-client.js';
import type { LettaManager } from '../../core/letta/index.js';
import type { LettaBackendType } from '../../core/letta/types.js';
import type {
  Conversation,
  ConversationMessage,
  CreateConversationRequest,
  SendConversationMessageRequest,
  AddParticipantRequest
} from './types.js';

const SERVICE_NAME = 'multi-agent-chat';
const log = createComponentLogger('MultiAgentChat');

interface MultiAgentChatConfig {
  default_manager_type?: GroupManagerType;
}

interface ConversationEntry {
  id: string;
  group_id: string;
  name: string;
  description?: string;
  created_at: string;
  created_by: string;
  participants: AgentId[];
  manager_type: GroupManagerType;
  /** Which Letta backend this conversation's group is on */
  backend: LettaBackendType;
}

interface MultiAgentChatState {
  initialized: boolean;
  conversations: Record<string, ConversationEntry>;
}

const DEFAULT_STATE: MultiAgentChatState = {
  initialized: true,
  conversations: {}
};

class MultiAgentChatService implements BaseService {
  private context?: ServiceContext;
  private config: MultiAgentChatConfig = {};

  /**
   * Initialize the service (global, once at startup)
   */
  async init(context: ServiceContext): Promise<void> {
    this.context = context;
    log.info('Service initialized (global singleton)');
  }

  /**
   * Initialize for a specific agent
   */
  async initAgent(agentId: AgentId, config: Record<string, unknown>): Promise<void> {
    // Update config (last one wins, but should be consistent)
    this.config = (config as MultiAgentChatConfig) || {};

    // Ensure global state is initialized
    const state = this.getGlobalState();
    if (!state.initialized) {
      this.saveGlobalState({
        initialized: true,
        conversations: state.conversations || {}
      });
    }

    log.info('Initialized for agent', { agentId });
  }

  /**
   * Check if an agent can reconnect
   */
  canReconnect(_agentId: AgentId, _state: Record<string, unknown>): boolean {
    return true;
  }

  /**
   * Get global state (shared conversations)
   */
  private getGlobalState(): MultiAgentChatState {
    if (!this.context) {
      return DEFAULT_STATE;
    }
    const state = this.context.getGlobalState<MultiAgentChatState>(SERVICE_NAME);
    return state.get() || DEFAULT_STATE;
  }

  /**
   * Save global state
   */
  private saveGlobalState(newState: MultiAgentChatState): void {
    if (!this.context) return;
    const state = this.context.getGlobalState<MultiAgentChatState>(SERVICE_NAME);
    state.set(newState);
  }

  /**
   * Get LettaManager
   */
  private getLettaManager(): LettaManager {
    if (!this.context) {
      throw new Error('MultiAgentChat service not initialized');
    }
    const lettaManager = this.context.getLettaManager?.();
    if (!lettaManager) {
      throw new Error('LettaManager not available');
    }
    return lettaManager;
  }

  /**
   * Get Letta client for a specific backend
   */
  private getLettaClientForBackend(backend: LettaBackendType): LettaClientWrapper {
    const lettaManager = this.getLettaManager();
    const client = lettaManager.getClientForBackend(backend);
    if (!client) {
      throw new Error(`Letta backend '${backend}' not configured`);
    }
    return client;
  }

  /**
   * Validate that all agents are on the same backend and return that backend
   */
  private validateAndGetBackend(ampelosAgentIds: AgentId[]): LettaBackendType {
    const lettaManager = this.getLettaManager();

    if (ampelosAgentIds.length === 0) {
      throw new Error('At least one participant is required');
    }

    const backends = new Set<LettaBackendType>();
    for (const agentId of ampelosAgentIds) {
      const backend = lettaManager.getAgentBackend(agentId);
      backends.add(backend);
    }

    if (backends.size > 1) {
      throw new Error(
        'All participants must be on the same Letta backend. ' +
        `Found agents on: ${Array.from(backends).join(', ')}`
      );
    }

    return Array.from(backends)[0];
  }

  /**
   * Resolve Ampelos agent IDs to Letta agent IDs
   */
  private resolveLettaAgentIds(ampelosAgentIds: AgentId[]): string[] {
    const lettaManager = this.getLettaManager();
    const lettaAgentIds: string[] = [];

    for (const agentId of ampelosAgentIds) {
      const lettaAgentId = lettaManager.getLettaAgentId(agentId);
      if (!lettaAgentId) {
        throw new Error(`Letta agent not initialized for ${agentId}`);
      }
      lettaAgentIds.push(lettaAgentId);
    }

    return lettaAgentIds;
  }

  /**
   * Create a new conversation using Letta Groups
   */
  async createConversation(
    request: CreateConversationRequest,
    createdBy: string
  ): Promise<Conversation> {
    // Validate all participants are on the same backend
    const backend = this.validateAndGetBackend(request.participants);

    // Resolve Ampelos agent IDs to Letta agent IDs
    const lettaAgentIds = this.resolveLettaAgentIds(request.participants);

    // Get Letta client for this backend
    const client = this.getLettaClientForBackend(backend);

    // Create Letta Group
    const managerType = request.manager_type || this.config.default_manager_type || 'round_robin';
    const group = await client.createGroup({
      name: request.name,
      description: request.description,
      agent_ids: lettaAgentIds,
      manager_type: managerType
    });

    // Create conversation entry
    const conversationId = randomUUID();
    const now = new Date().toISOString();

    const entry: ConversationEntry = {
      id: conversationId,
      group_id: group.id,
      name: request.name,
      description: request.description,
      created_at: now,
      created_by: createdBy,
      participants: [...request.participants],
      manager_type: managerType,
      backend
    };

    // Save to global state
    const state = this.getGlobalState();
    this.saveGlobalState({
      initialized: true,
      conversations: {
        ...state.conversations,
        [conversationId]: entry
      }
    });

    log.info('Created conversation', { conversationId, groupId: group.id });

    return this.entryToConversation(entry);
  }

  /**
   * Get a conversation by ID
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const state = this.getGlobalState();
    const entry = state.conversations[conversationId];

    if (!entry) {
      return null;
    }

    return this.entryToConversation(entry);
  }

  /**
   * List all conversations
   */
  async listConversations(): Promise<Conversation[]> {
    const state = this.getGlobalState();
    return Object.values(state.conversations).map(entry => this.entryToConversation(entry));
  }

  /**
   * Send a message to a conversation
   */
  async sendMessage(
    conversationId: string,
    request: SendConversationMessageRequest
  ): Promise<ConversationMessage[]> {
    const state = this.getGlobalState();
    const entry = state.conversations[conversationId];

    if (!entry) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Get Letta client for this conversation's backend
    const client = this.getLettaClientForBackend(entry.backend);

    // Send message to Letta Group
    const response = await client.sendGroupMessage(entry.group_id, request.text);

    // Convert response messages to our format
    const messages: ConversationMessage[] = [];

    for (const msg of response.messages) {
      if (msg.message_type === 'assistant_message' || msg.role === 'assistant') {
        const content = msg.content || msg.text || '';
        messages.push({
          id: msg.id || randomUUID(),
          role: 'assistant',
          agent_id: msg.agent_id,
          content: typeof content === 'string' ? content : JSON.stringify(content),
          created_at: msg.created_at?.toString() || new Date().toISOString(),
          message_type: msg.message_type
        });
      }
    }

    return messages;
  }

  /**
   * Add a participant to a conversation
   */
  async addParticipant(
    conversationId: string,
    request: AddParticipantRequest
  ): Promise<Conversation> {
    const state = this.getGlobalState();
    const entry = state.conversations[conversationId];

    if (!entry) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Check if already a participant
    if (entry.participants.includes(request.agent_id)) {
      return this.entryToConversation(entry);
    }

    // Validate new participant is on the same backend as the conversation
    const lettaManager = this.getLettaManager();
    const newAgentBackend = lettaManager.getAgentBackend(request.agent_id);
    if (newAgentBackend !== entry.backend) {
      throw new Error(
        `Cannot add agent from '${newAgentBackend}' backend to conversation on '${entry.backend}' backend. ` +
        'All participants must be on the same Letta backend.'
      );
    }

    // Resolve the new agent's Letta ID
    const [newLettaAgentId] = this.resolveLettaAgentIds([request.agent_id]);

    // Get current Letta agent IDs
    const currentLettaIds = this.resolveLettaAgentIds(entry.participants);
    const updatedLettaIds = [...currentLettaIds, newLettaAgentId];

    // Update Letta Group using the conversation's backend
    const client = this.getLettaClientForBackend(entry.backend);
    await client.updateGroup(entry.group_id, { agent_ids: updatedLettaIds });

    // Update local state
    const updatedEntry: ConversationEntry = {
      ...entry,
      participants: [...entry.participants, request.agent_id]
    };

    this.saveGlobalState({
      initialized: true,
      conversations: {
        ...state.conversations,
        [conversationId]: updatedEntry
      }
    });

    return this.entryToConversation(updatedEntry);
  }

  /**
   * Remove a participant from a conversation
   */
  async removeParticipant(
    conversationId: string,
    agentId: AgentId
  ): Promise<Conversation> {
    const state = this.getGlobalState();
    const entry = state.conversations[conversationId];

    if (!entry) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Check if is a participant
    if (!entry.participants.includes(agentId)) {
      return this.entryToConversation(entry);
    }

    // Get remaining participants
    const remainingParticipants = entry.participants.filter(p => p !== agentId);

    if (remainingParticipants.length === 0) {
      throw new Error('Cannot remove last participant');
    }

    // Resolve remaining Letta agent IDs
    const remainingLettaIds = this.resolveLettaAgentIds(remainingParticipants);

    // Update Letta Group using the conversation's backend
    const client = this.getLettaClientForBackend(entry.backend);
    await client.updateGroup(entry.group_id, { agent_ids: remainingLettaIds });

    // Update local state
    const updatedEntry: ConversationEntry = {
      ...entry,
      participants: remainingParticipants
    };

    this.saveGlobalState({
      initialized: true,
      conversations: {
        ...state.conversations,
        [conversationId]: updatedEntry
      }
    });

    return this.entryToConversation(updatedEntry);
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const state = this.getGlobalState();
    const entry = state.conversations[conversationId];

    if (!entry) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Delete Letta Group using the conversation's backend
    try {
      const client = this.getLettaClientForBackend(entry.backend);
      await client.deleteGroup(entry.group_id);
    } catch (error) {
      log.warn('Failed to delete Letta group', { groupId: entry.group_id, error });
      // Continue with local deletion even if Letta deletion fails
    }

    // Remove from local state
    const { [conversationId]: _, ...remainingConversations } = state.conversations;
    this.saveGlobalState({
      initialized: true,
      conversations: remainingConversations
    });

    log.info('Deleted conversation', { conversationId });
  }

  /**
   * Get messages from a conversation
   */
  async getMessages(conversationId: string, limit: number = 50): Promise<ConversationMessage[]> {
    const state = this.getGlobalState();
    const entry = state.conversations[conversationId];

    if (!entry) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Get messages from Letta Group using the conversation's backend
    const client = this.getLettaClientForBackend(entry.backend);
    const rawMessages = await client.getGroupMessages(entry.group_id, limit);

    // Convert to our format
    const messages: ConversationMessage[] = [];

    for (const msg of rawMessages) {
      const role = msg.role === 'user' ? 'user' : 'assistant';
      const content = msg.content || msg.text || '';

      messages.push({
        id: msg.id || randomUUID(),
        role: role as 'user' | 'assistant',
        agent_id: msg.agent_id,
        content: typeof content === 'string' ? content : JSON.stringify(content),
        created_at: msg.created_at?.toString() || new Date().toISOString(),
        message_type: msg.message_type
      });
    }

    return messages;
  }

  /**
   * Convert internal entry to public Conversation type
   */
  private entryToConversation(entry: ConversationEntry): Conversation {
    return {
      id: entry.id,
      group_id: entry.group_id,
      name: entry.name,
      description: entry.description,
      created_at: entry.created_at,
      created_by: entry.created_by,
      participants: entry.participants,
      manager_type: entry.manager_type
    };
  }

  async cleanup(): Promise<void> {
    // State auto-persisted
  }
}

export default MultiAgentChatService;
