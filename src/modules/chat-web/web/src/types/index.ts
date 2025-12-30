/**
 * Shared type definitions for chat-web frontend
 * All types defined here to avoid circular dependencies
 */

// =============================================================================
// Agent Types
// =============================================================================

export interface Agent {
  agent_id: string;
  agent_name: string;
  enabled: boolean;
  modules: string[];
  has_letta: boolean;
  letta_agent_id?: string;
  letta_model?: string;
}

// =============================================================================
// Message Types
// =============================================================================

export interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  imageUrl?: string;
  imageData?: string; // base64
  imageMimeType?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments?: string | object;
  result?: string | object;
  status?: 'executing' | 'executed' | 'error';
  duration?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | MessageContent[]; // Support both string and multi-modal
  tool_calls?: ToolCall[];
  created_at: string;
  agent_id?: string; // For conversation messages, indicates which agent sent it
  agent_name?: string; // For conversation messages, human-readable agent name
}

// =============================================================================
// Memory Types
// =============================================================================

export interface MemoryBlock {
  id: string;
  label: string;
  value: string;
  limit: number;
}

// =============================================================================
// Conversation Types
// =============================================================================

export interface ConversationSettings {
  max_turns: number;
  max_duration_ms: number;
  require_user_approval: boolean;
}

export interface ConversationState {
  current_turn: number;
  started_at: string;
  last_activity: string;
  waiting_for_approval: boolean;
  last_agent_id?: string;
  is_active: boolean;
}

export interface Conversation {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  participants: string[];
  messages: ConversationMessage[];
  settings: ConversationSettings;
  state: ConversationState;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'agent';
  agent_id?: string;
  agent_name?: string;
  content: string;
  created_at: string;
}
