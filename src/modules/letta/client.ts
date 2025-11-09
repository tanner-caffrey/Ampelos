/**
 * Letta Client Wrapper
 *
 * Handles connection to Letta server and provides
 * methods for agent lifecycle management using the official Letta Node SDK.
 */

import { LettaClient, Letta } from '@letta-ai/letta-client';

export interface LettaConfig {
  baseUrl: string;
  token?: string;
}

export interface MemoryBlock {
  label: string;
  value: string;
  limit?: number;
}

export interface CreateAgentOptions {
  name: string;
  model: string;
  embedding: string;
  memoryBlocks: MemoryBlock[];
  tools?: string[];
}

export interface AgentInfo {
  id: string;
  name: string;
  model: string;
  embedding: string;
  created_at: string;
}

export interface ChatResponse {
  messages: Letta.LettaMessageUnion[];
  usage?: {
    step_count: number;
    total_tokens?: number;
  };
}

/**
 * Letta Client wrapper for managing agents
 */
export class LettaClientWrapper {
  private client: LettaClient;

  constructor(config: LettaConfig) {
    this.client = new LettaClient({
      baseUrl: config.baseUrl,
      token: config.token
    });
  }

  /**
   * Check if an agent exists by ID
   */
  async agentExists(agentId: string): Promise<boolean> {
    try {
      await this.client.agents.retrieve(agentId);
      return true;
    } catch (error: any) {
      if (error.status === 404 || error.statusCode === 404) {
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
      const agent = await this.client.agents.retrieve(agentId);
      return {
        id: agent.id,
        name: agent.name,
        model: agent.llmConfig?.model || 'unknown',
        embedding: agent.embeddingConfig?.embeddingModel || 'unknown',
        created_at: agent.createdAt?.toString() || ''
      };
    } catch (error: any) {
      throw new Error(`Failed to get agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Create a new agent
   *
   * Note: Agents are created with default tools including:
   * - send_message: Generate messages to user
   * - Core memory tools: Edit memory blocks
   * - archival_memory_search/insert: Long-term memory
   * - conversation_search: Search conversation history
   */
  async createAgent(options: CreateAgentOptions): Promise<string> {
    try {
      const createParams: Letta.CreateAgentRequest = {
        name: options.name,
        model: options.model,
        embedding: options.embedding,
        memoryBlocks: options.memoryBlocks.map(block => ({
          label: block.label,
          value: block.value,
          limit: block.limit
        }))
      };

      // Attach additional tools if specified
      // Note: Built-in memory tools are attached by default
      if (options.tools && options.tools.length > 0) {
        createParams.tools = options.tools;
      }

      const agent = await this.client.agents.create(createParams);
      return agent.id;
    } catch (error: any) {
      throw new Error(`Failed to create agent: ${error.message}`);
    }
  }

  /**
   * Update a memory block
   */
  async updateMemoryBlock(agentId: string, blockLabel: string, value: string): Promise<void> {
    try {
      // Use modify() with blockLabel directly
      await this.client.agents.blocks.modify(agentId, blockLabel, {
        value
      });
    } catch (error: any) {
      throw new Error(`Failed to update memory block ${blockLabel} for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Get all memory blocks for an agent
   */
  async getMemoryBlocks(agentId: string): Promise<Record<string, string>> {
    try {
      const blocks = await this.client.agents.blocks.list(agentId);
      const memory: Record<string, string> = {};

      for (const block of blocks) {
        if (block.label) {
          memory[block.label] = block.value;
        }
      }

      return memory;
    } catch (error: any) {
      throw new Error(`Failed to get memory blocks for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Send a message to an agent
   */
  async sendMessage(agentId: string, message: string): Promise<ChatResponse> {
    try {
      const request: Letta.LettaRequest = {
        messages: [
          {
            role: 'user',
            content: message
          }
        ]
      };

      const response = await this.client.agents.messages.create(agentId, request);

      return {
        messages: response.messages || [],
        usage: response.usage ? {
          step_count: response.usage.stepCount || 0,
          total_tokens: response.usage.completionTokens ?
            (response.usage.completionTokens + (response.usage.promptTokens || 0)) :
            undefined
        } : undefined
      };
    } catch (error: any) {
      throw new Error(`Failed to send message to agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Get conversation messages
   *
   * Note: Agents can search their own conversation history using
   * the built-in conversation_search tool
   */
  async getMessages(agentId: string, limit: number = 50): Promise<Letta.LettaMessageUnion[]> {
    try {
      const response = await this.client.agents.messages.list(agentId, {
        limit
      });

      return response;
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
      const agents = await this.client.agents.list();

      return agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        model: agent.llmConfig?.model || 'unknown',
        embedding: agent.embeddingConfig?.embeddingModel || 'unknown',
        created_at: agent.createdAt?.toString() || ''
      }));
    } catch (error: any) {
      throw new Error(`Failed to list agents: ${error.message}`);
    }
  }

  /**
   * Attach a tool to an agent
   */
  async attachTool(agentId: string, toolId: string): Promise<void> {
    try {
      await this.client.agents.tools.attach(agentId, toolId);
    } catch (error: any) {
      throw new Error(`Failed to attach tool ${toolId} to agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Create a custom tool from Python source code
   */
  async createTool(sourceCode: string, description?: string): Promise<string> {
    try {
      const tool = await this.client.tools.upsert({
        sourceCode,
        description
      });
      if (!tool.id) {
        throw new Error('Tool created but no ID returned');
      }
      return tool.id;
    } catch (error: any) {
      throw new Error(`Failed to create tool: ${error.message}`);
    }
  }

  /**
   * Get the raw client for advanced operations
   */
  getRawClient(): LettaClient {
    return this.client;
  }
}
