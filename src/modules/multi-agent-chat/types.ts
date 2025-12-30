/**
 * Multi-Agent Chat Type Definitions
 *
 * Simplified types that map to Letta Groups
 */

import type { AgentId } from '../../types/agent.js';
import type { GroupManagerType } from '../../core/letta/letta-client.js';

/**
 * Conversation message from user or agent
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  agent_id?: string; // Letta agent ID if from agent
  agent_name?: string; // Human-readable agent name (for display)
  content: string;
  created_at: string;
  message_type?: string; // Letta message type
}

/**
 * Conversation (backed by Letta Group)
 */
export interface Conversation {
  id: string; // Ampelos conversation ID
  group_id: string; // Letta Group ID
  name: string;
  description?: string;
  created_at: string;
  created_by: string; // User identifier
  participants: AgentId[]; // Ampelos agent IDs
  manager_type: GroupManagerType;
}

/**
 * Request to create a conversation
 */
export interface CreateConversationRequest {
  name: string;
  description?: string;
  participants: AgentId[];
  manager_type?: GroupManagerType;
}

/**
 * Request to send a message to a conversation
 */
export interface SendConversationMessageRequest {
  text: string;
}

/**
 * Request to add a participant
 */
export interface AddParticipantRequest {
  agent_id: AgentId;
}
