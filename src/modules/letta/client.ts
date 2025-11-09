/**
 * Letta Client Wrapper
 *
 * Handles connection to local Letta server and provides
 * methods for agent lifecycle management.
 */

import { Letta } from 'letta';

export interface LettaConfig {
  base_url: string;
  token?: string;
}

export interface MemoryBlock {
  name: string;
  value: string;
  limit: number;
}

export interface CreateAgentOptions {
  name: string;
  model: string;
  embedding_model: string;
  system_prompt: string;
  memory_blocks: MemoryBlock[];
  tools?: string[];
}

export interface AgentInfo {
  id: string;
  name: string;
  model: string;
  embedding_model: string;
  created_at: string;
  last_updated: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface ChatResponse {
  messages: ChatMessage[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Letta Client wrapper for managing agents
 */
export class LettaClient {
  private client: Letta;

  constructor(config: LettaConfig) {
    this.client = new Letta({
      baseURL: config.base_url,
      token: config.token || ''
    });
  }

  /**
   * Check if an agent exists by ID
   */
  async agentExists(agentId: string): Promise<boolean> {
    try {
      await this.client.agents.get(agentId);
      return true;
    } catch (error: any) {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get agent information
   */
  async getAgent(agentId: string): Promise<AgentInfo> {
    try {
      const agent = await this.client.agents.get(agentId);
      return {
        id: agent.id,
        name: agent.name,
        model: agent.llm_config?.model || 'unknown',
        embedding_model: agent.embedding_config?.embedding_model || 'unknown',
        created_at: agent.created_at || '',
        last_updated: agent.last_updated_at || ''
      };
    } catch (error: any) {
      throw new Error(`Failed to get agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Create a new agent
   */
  async createAgent(options: CreateAgentOptions): Promise<string> {
    try {
      // Build memory blocks
      const memory: any = {};
      for (const block of options.memory_blocks) {
        memory[block.name] = {
          value: block.value,
          limit: block.limit
        };
      }

      // Create agent
      const agent = await this.client.agents.create({
        name: options.name,
        llm_config: {
          model: options.model,
          context_window: 128000
        },
        embedding_config: {
          embedding_model: options.embedding_model,
          embedding_dim: 1536,
          embedding_chunk_size: 300
        },
        system: options.system_prompt,
        memory,
        tools: options.tools || []
      });

      return agent.id;
    } catch (error: any) {
      throw new Error(`Failed to create agent: ${error.message}`);
    }
  }

  /**
   * Update agent memory blocks
   */
  async updateMemory(agentId: string, blockName: string, value: string): Promise<void> {
    try {
      await this.client.agents.updateMemory(agentId, {
        [blockName]: value
      });
    } catch (error: any) {
      throw new Error(`Failed to update memory for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Get agent memory blocks
   */
  async getMemory(agentId: string): Promise<Record<string, string>> {
    try {
      const agent = await this.client.agents.get(agentId);
      const memory: Record<string, string> = {};

      if (agent.memory) {
        for (const [key, value] of Object.entries(agent.memory)) {
          if (typeof value === 'object' && value !== null && 'value' in value) {
            memory[key] = (value as any).value;
          }
        }
      }

      return memory;
    } catch (error: any) {
      throw new Error(`Failed to get memory for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Send a message to an agent
   */
  async sendMessage(agentId: string, message: string): Promise<ChatResponse> {
    try {
      const response = await this.client.agents.messages.create(agentId, {
        messages: [
          {
            role: 'user',
            content: message
          }
        ]
      });

      // Parse response messages
      const messages: ChatMessage[] = [];
      if (response.messages) {
        for (const msg of response.messages) {
          messages.push({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content || '',
            timestamp: msg.created_at
          });
        }
      }

      return {
        messages,
        usage: response.usage ? {
          input_tokens: response.usage.prompt_tokens || 0,
          output_tokens: response.usage.completion_tokens || 0
        } : undefined
      };
    } catch (error: any) {
      throw new Error(`Failed to send message to agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Search archival memory
   */
  async searchArchival(agentId: string, query: string, page: number = 0): Promise<any[]> {
    try {
      const response = await this.client.agents.archival.search(agentId, {
        query,
        page
      });

      return response.results || [];
    } catch (error: any) {
      throw new Error(`Failed to search archival memory for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Insert into archival memory
   */
  async insertArchival(agentId: string, content: string): Promise<void> {
    try {
      await this.client.agents.archival.insert(agentId, {
        content
      });
    } catch (error: any) {
      throw new Error(`Failed to insert into archival memory for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Get conversation messages
   */
  async getMessages(agentId: string, limit: number = 50): Promise<ChatMessage[]> {
    try {
      const response = await this.client.agents.messages.list(agentId, {
        limit
      });

      const messages: ChatMessage[] = [];
      if (response.messages) {
        for (const msg of response.messages) {
          messages.push({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content || '',
            timestamp: msg.created_at
          });
        }
      }

      return messages;
    } catch (error: any) {
      throw new Error(`Failed to get messages for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Delete an agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    try {
      await this.client.agents.delete(agentId);
    } catch (error: any) {
      throw new Error(`Failed to delete agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * List all agents
   */
  async listAgents(): Promise<AgentInfo[]> {
    try {
      const response = await this.client.agents.list();
      const agents: AgentInfo[] = [];

      if (response.agents) {
        for (const agent of response.agents) {
          agents.push({
            id: agent.id,
            name: agent.name,
            model: agent.llm_config?.model || 'unknown',
            embedding_model: agent.embedding_config?.embedding_model || 'unknown',
            created_at: agent.created_at || '',
            last_updated: agent.last_updated_at || ''
          });
        }
      }

      return agents;
    } catch (error: any) {
      throw new Error(`Failed to list agents: ${error.message}`);
    }
  }
}
