/**
 * API client for chat-web frontend
 * All fetch calls centralized here
 */

import type { Agent, MemoryBlock, Conversation, ConversationMessage, MessageContent } from '../types';

// =============================================================================
// Agent APIs
// =============================================================================

export interface AgentsResponse {
  agents: Agent[];
}

export interface AgentResponse {
  letta_model?: string;
}

export interface ModelsResponse {
  models: string[];
}

export interface MessagesResponse {
  messages: Array<{
    id: string;
    role: string;
    content: string | MessageContent[];
    tool_calls?: Array<{
      id: string;
      name: string;
      arguments?: string | object;
      result?: string | object;
      status?: 'executing' | 'executed' | 'error';
      duration?: number;
    }>;
    created_at: string;
  }>;
}

export interface MemoryResponse {
  blocks: MemoryBlock[];
}

export async function fetchAgents(): Promise<AgentsResponse> {
  const response = await fetch('/api/agents');
  return response.json();
}

export async function fetchAgent(agentId: string): Promise<AgentResponse> {
  const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}`);
  return response.json();
}

export async function fetchModels(agentId: string): Promise<ModelsResponse> {
  const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/models`);
  return response.json();
}

export async function updateAgentModel(agentId: string, model: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model })
  });
  return response.json();
}

export async function fetchMessages(agentId: string): Promise<MessagesResponse> {
  const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/messages`);
  return response.json();
}

export async function fetchMemoryBlocks(agentId: string): Promise<MemoryResponse> {
  const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/memory`);
  return response.json();
}

export interface StreamMessageBody {
  message?: string;
  images?: Array<{ data: string; mimeType: string }>;
}

/**
 * Stream a message to an agent.
 * Returns the raw Response for SSE stream processing.
 */
export async function streamMessage(agentId: string, body: StreamMessageBody): Promise<Response> {
  const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${response.status}`);
  }

  return response;
}

export async function clearMessages(agentId: string): Promise<Response> {
  const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/messages/clear`, {
    method: 'POST'
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to clear messages');
  }

  return response;
}

// =============================================================================
// Conversation APIs
// =============================================================================

export interface ConversationsResponse {
  conversations: Conversation[];
}

export interface ConversationResponse {
  conversation: Conversation;
}

export interface ConversationMessagesResponse {
  messages: ConversationMessage[];
}

export async function fetchConversations(): Promise<ConversationsResponse> {
  const response = await fetch('/api/conversations');
  if (!response.ok) {
    throw new Error('Failed to load conversations');
  }
  return response.json();
}

export async function fetchConversation(conversationId: string): Promise<ConversationResponse> {
  const response = await fetch(`/api/conversations/${conversationId}`);
  if (!response.ok) {
    throw new Error('Failed to load conversation');
  }
  return response.json();
}

export async function createConversation(name: string, participants: string[]): Promise<ConversationResponse> {
  const response = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, participants })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create conversation');
  }

  return response.json();
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const response = await fetch(`/api/conversations/${conversationId}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('Failed to delete conversation');
  }
}

export async function fetchConversationMessages(conversationId: string): Promise<ConversationMessagesResponse> {
  const response = await fetch(`/api/conversations/${conversationId}/messages`);
  if (!response.ok) {
    throw new Error('Failed to load messages');
  }
  return response.json();
}

export interface SendConversationMessageBody {
  message?: string;
  images?: Array<{ data: string; mimeType: string }>;
}

export interface SendConversationMessageResponse {
  messages: ConversationMessage[];
}

export async function sendConversationMessage(
  conversationId: string,
  body: SendConversationMessageBody
): Promise<SendConversationMessageResponse> {
  const response = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${response.status}`);
  }

  return response.json();
}

export async function approveConversationTurn(conversationId: string): Promise<void> {
  const response = await fetch(`/api/conversations/${conversationId}/approve`, {
    method: 'POST'
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to approve turn');
  }

  await response.json();
}
