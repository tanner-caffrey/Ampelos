/**
 * Multi-Agent Chat Module
 *
 * Exports the service for multi-agent conversation management using Letta Groups
 */

export { default as MultiAgentChatService } from './service.js';
export type {
  Conversation,
  ConversationMessage,
  CreateConversationRequest,
  SendConversationMessageRequest,
  AddParticipantRequest
} from './types.js';
