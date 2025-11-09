/**
 * Type declarations for Letta SDK
 */

declare module 'letta' {
  export interface LettaOptions {
    baseURL: string;
    token?: string;
  }

  export interface LLMConfig {
    model: string;
    context_window?: number;
  }

  export interface EmbeddingConfig {
    embedding_model: string;
    embedding_dim?: number;
    embedding_chunk_size?: number;
  }

  export interface MemoryBlockValue {
    value: string;
    limit: number;
  }

  export interface CreateAgentRequest {
    name: string;
    llm_config: LLMConfig;
    embedding_config: EmbeddingConfig;
    system: string;
    memory: Record<string, MemoryBlockValue>;
    tools?: string[];
  }

  export interface Agent {
    id: string;
    name: string;
    llm_config?: LLMConfig;
    embedding_config?: EmbeddingConfig;
    created_at?: string;
    last_updated_at?: string;
    memory?: Record<string, MemoryBlockValue>;
  }

  export interface Message {
    role: string;
    content?: string;
    created_at?: string;
  }

  export interface CreateMessageRequest {
    messages: Array<{
      role: string;
      content: string;
    }>;
  }

  export interface CreateMessageResponse {
    messages?: Message[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  }

  export interface ListAgentsResponse {
    agents?: Agent[];
  }

  export interface ListMessagesResponse {
    messages?: Message[];
  }

  export interface SearchArchivalRequest {
    query: string;
    page?: number;
  }

  export interface SearchArchivalResponse {
    results?: any[];
  }

  export interface InsertArchivalRequest {
    content: string;
  }

  export class Letta {
    constructor(options: LettaOptions);

    agents: {
      get(agentId: string): Promise<Agent>;
      create(request: CreateAgentRequest): Promise<Agent>;
      delete(agentId: string): Promise<void>;
      list(): Promise<ListAgentsResponse>;
      updateMemory(agentId: string, memory: Record<string, string>): Promise<void>;

      messages: {
        create(agentId: string, request: CreateMessageRequest): Promise<CreateMessageResponse>;
        list(agentId: string, options?: { limit?: number }): Promise<ListMessagesResponse>;
      };

      archival: {
        search(agentId: string, request: SearchArchivalRequest): Promise<SearchArchivalResponse>;
        insert(agentId: string, request: InsertArchivalRequest): Promise<void>;
      };
    };
  }
}
