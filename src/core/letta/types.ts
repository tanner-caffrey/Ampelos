/**
 * Letta Core Types
 *
 * Type definitions for Letta integration in Ampelos core
 */

import type { Letta } from '@letta-ai/letta-client';
import type { AgentId } from '../../types/agent.js';
import type { LettaClientWrapper, AgentInfo, MemoryBlockDetailed, ChatResponse } from './letta-client.js';

/**
 * Letta backend type - cloud or self-hosted
 */
export type LettaBackendType = 'cloud' | 'self-hosted';

/**
 * State stored for each agent's Letta integration
 */
export interface LettaState {
  letta_agent_id?: string;
  /** Which Letta backend this agent uses */
  backend?: LettaBackendType;
  initialized: boolean;
  created_at?: string;
  attached_agent_blocks?: Record<string, AgentBlockInfo>;
}

/**
 * Information about an attached agent context block
 */
export interface AgentBlockInfo {
  block_id: string;
  label: string;
  attached_at: string;
}

/**
 * Callback type for chat completion events (legacy - no context)
 */
export type ChatCompleteCallback = (agentId: AgentId) => void;

/**
 * Context passed to chat completion callbacks
 */
export interface ChatCompleteContext {
  /** The message that triggered the response */
  stimulus: string;
  /** The agent's response (extracted text) */
  response: string;
  /** The full response object with all messages */
  fullResponse: ChatResponse;
  /** Who sent the stimulus */
  role: 'user' | 'system';
  /** When the chat completed */
  timestamp: string;
}

/**
 * Callback type for chat completion events with full context
 */
export type ChatCompleteCallbackWithContext = (agentId: AgentId, context: ChatCompleteContext) => void | Promise<void>;

/**
 * Multi-modal content item (text or image)
 */
export interface LettaContentItem {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'url' | 'base64';
    url?: string;
    media_type?: string;
    data?: string;
  };
}

/**
 * Message content that can be sent to Letta - either a simple string or multi-modal content
 */
export type LettaMessageContent = string | LettaContentItem[];

/**
 * Options for chat operations
 */
export interface ChatOptions {
  role?: 'user' | 'system';
}

/**
 * Agent-bound context for Letta operations
 * Provides a convenient API where methods don't need agentId
 */
export interface ILettaAgentContext {
  /** The Letta agent ID */
  readonly lettaAgentId: string;
  /** The Ampelos agent ID */
  readonly ampelosAgentId: AgentId;
  /** Raw Letta SDK client for this agent's backend */
  readonly sdk: Letta;

  /** Send a message to the agent */
  chat(message: string, options?: ChatOptions): Promise<ChatResponse>;
  /** Get memory blocks as key-value pairs */
  getMemory(): Promise<Record<string, string>>;
  /** Update a specific memory block */
  updateMemory(label: string, value: string): Promise<void>;
  /** Get memory blocks with full details */
  getMemoryBlocks(): Promise<MemoryBlockDetailed[]>;
  /** Add a new memory block */
  addMemoryBlock(label: string, value: string, limit?: number): Promise<string>;
  /** Remove a memory block */
  removeMemoryBlock(blockId: string): Promise<void>;
  /** Get conversation messages */
  getMessages(limit?: number): Promise<any[]>;
  /** Clear all messages */
  clearMessages(): Promise<void>;
  /** Get agent information */
  getInfo(): Promise<AgentInfo | undefined>;
  /**
   * Get the underlying client for advanced operations
   * @deprecated Use the `sdk` property instead for direct SDK access
   */
  getClient(): LettaClientWrapper;
}

// Re-export types from other files for convenience
export type { AgentInfo, MemoryBlockDetailed, ChatResponse } from './letta-client.js';
export type { LettaAgentConfig, MemoryBlockConfig } from './utils/config-validator.js';
