/**
 * Letta Client Wrapper
 *
 * Handles connection to Letta server and provides
 * methods for agent lifecycle management using the official Letta Node SDK.
 * Supports both self-hosted and cloud deployments.
 */

import { Letta } from '@letta-ai/letta-client';
import type { LettaBackendType } from './types.js';
import { createComponentLogger } from '../logger.js';

const log = createComponentLogger('LettaClient');

export interface LettaConfig {
  /** The backend type: 'cloud' or 'self-hosted' */
  backend: LettaBackendType;
  /** Base URL for self-hosted deployments (default: http://localhost:8283) */
  baseUrl?: string;
  /** API token/key - for self-hosted auth or cloud API key */
  token?: string;
  /** Project ID for Letta Cloud */
  projectId?: string;
}

export interface MemoryBlock {
  label: string;
  value: string;
  limit?: number;
}

export interface MemoryBlockDetailed {
  id: string;
  label: string;
  value: string;
  limit: number;
}

export interface CreateAgentOptions {
  name: string;
  model: string;
  embedding: string;
  modelEndpointType: string;
  contextWindow: number;
  embeddingEndpointType: string;
  embeddingDim: number;
  memoryBlocks: MemoryBlock[];
  tools?: string[];
  enableSleeptime?: boolean;
}

export interface AgentInfo {
  id: string;
  name: string;
  model: string;
  embedding: string;
  created_at: string;
}

export type GroupManagerType = 'round_robin' | 'supervisor' | 'dynamic' | 'sleeptime';

export interface GroupInfo {
  id: string;
  name: string;
  description?: string;
  agent_ids: string[];
  manager_type: GroupManagerType;
  created_at: string;
}

export interface CreateGroupOptions {
  name: string;
  description?: string;
  agent_ids: string[];
  manager_type?: GroupManagerType;
}

export interface ChatResponse {
  messages: any[]; // LettaMessageUnion from SDK
  usage?: {
    step_count: number;
    total_tokens?: number;
  };
}

// ============================================
// Folder and File Types
// ============================================

export interface FolderInfo {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at?: string;
}

export interface FolderUpdate {
  name?: string;
  description?: string;
}

export interface FileInfo {
  id: string;
  file_name: string;
  original_file_name?: string;
  file_size?: number;
  file_type?: string;
  processing_status?: 'pending' | 'parsing' | 'embedding' | 'completed' | 'error';
  content?: string;
  created_at: string;
  updated_at?: string;
  error_message?: string;
}

export type DuplicateHandling = 'replace' | 'skip' | 'error' | 'suffix';

/**
 * Letta Client wrapper for managing agents
 */
export class LettaClientWrapper {
  private client: Letta;
  private config: LettaConfig;

  constructor(config: LettaConfig) {
    this.config = config;

    // Build SDK options based on backend type
    const sdkOptions: {
      baseURL?: string;
      apiKey?: string;
      projectID?: string;
    } = {};

    if (config.backend === 'cloud') {
      // For Letta Cloud:
      // - Use default cloud URL (https://api.letta.com) unless overridden
      // - Requires API key
      // - Use native projectID option for project scoping
      if (config.baseUrl) {
        sdkOptions.baseURL = config.baseUrl;
      }
      sdkOptions.apiKey = config.token;

      // Use SDK's native projectID option
      if (config.projectId) {
        sdkOptions.projectID = config.projectId;
      }
    } else {
      // For self-hosted:
      // - Requires base URL (defaults to localhost)
      // - Token is optional (for authenticated deployments)
      sdkOptions.baseURL = config.baseUrl || 'http://localhost:8283';
      if (config.token) {
        sdkOptions.apiKey = config.token;
      }
    }

    this.client = new Letta(sdkOptions);
  }

  /**
   * Get the backend type this client is configured for
   */
  getBackendType(): LettaBackendType {
    return this.config.backend;
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
        model: agent.llm_config?.model || 'unknown',
        embedding: agent.embedding_config?.embedding_model || 'unknown',
        created_at: agent.created_at?.toString() || ''
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
      const createParams: any = {
        name: options.name,
        agent_type: 'letta_v1_agent',
        llm_config: {
          model: options.model,
          model_endpoint_type: options.modelEndpointType,
          context_window: options.contextWindow
        },
        embedding_config: {
          embedding_model: options.embedding,
          embedding_endpoint_type: options.embeddingEndpointType,
          embedding_dim: options.embeddingDim
        },
        memory_blocks: options.memoryBlocks.map(block => ({
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

      // Enable sleeptime agent if specified
      if (options.enableSleeptime !== undefined) {
        createParams.enable_sleeptime = options.enableSleeptime;
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
      // First, get all blocks for the agent to find the block ID by label
      const response = await this.client.agents.blocks.list(agentId);
      const blocks = (response as any).items || response;

      // Find the block with matching label
      const block = blocks.find((b: any) => b.label === blockLabel);
      if (!block || !block.id) {
        throw new Error(`Block with label "${blockLabel}" not found for agent ${agentId}`);
      }

      // Update the block using blocks.update() with block ID
      await this.client.blocks.update(block.id, { value });
    } catch (error: any) {
      throw new Error(`Failed to update memory block ${blockLabel} for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Get all memory blocks for an agent
   */
  async getMemoryBlocks(agentId: string): Promise<Record<string, string>> {
    try {
      const response = await this.client.agents.blocks.list(agentId);
      // Handle pagination - response may have .items property in v1.0
      const blocks = (response as any).items || response;
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
   * Get all memory blocks for an agent with full details (id, label, value, limit)
   */
  async getMemoryBlocksDetailed(agentId: string): Promise<MemoryBlockDetailed[]> {
    try {
      const response = await this.client.agents.blocks.list(agentId);
      const blocks = (response as any).items || response;

      return blocks.map((block: any) => ({
        id: block.id,
        label: block.label,
        value: block.value || '',
        limit: block.limit || 5000
      }));
    } catch (error: any) {
      throw new Error(`Failed to get memory blocks for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Create a standalone memory block (not yet attached to any agent)
   * @returns The block ID
   */
  async createBlock(label: string, value: string, limit?: number): Promise<string> {
    try {
      const block = await this.client.blocks.create({
        label,
        value,
        limit: limit || 5000
      });
      return block.id;
    } catch (error: any) {
      throw new Error(`Failed to create block: ${error.message}`);
    }
  }

  /**
   * Attach an existing block to an agent
   */
  async attachBlockToAgent(agentId: string, blockId: string): Promise<void> {
    try {
      await this.client.agents.blocks.attach(blockId, { agent_id: agentId });
    } catch (error: any) {
      throw new Error(`Failed to attach block ${blockId} to agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Detach a block from an agent
   */
  async detachBlockFromAgent(agentId: string, blockId: string): Promise<void> {
    try {
      await this.client.agents.blocks.detach(blockId, { agent_id: agentId });
    } catch (error: any) {
      throw new Error(`Failed to detach block ${blockId} from agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Create a new memory block and attach it to an agent (convenience method)
   * @returns The block ID
   */
  async addMemoryBlockToAgent(
    agentId: string,
    label: string,
    value: string,
    limit?: number
  ): Promise<string> {
    const blockId = await this.createBlock(label, value, limit);
    await this.attachBlockToAgent(agentId, blockId);
    return blockId;
  }

  /**
   * Send a message to an agent
   * Supports both string messages and multi-modal content (text + images)
   * @param agentId - The agent to send to
   * @param message - Text or multi-modal content
   * @param options - Optional settings including message role ('user' or 'system')
   */
  async sendMessage(
    agentId: string,
    message: string | Array<{ type: 'text' | 'image'; text?: string; source?: { type: 'url' | 'base64'; url?: string; media_type?: string; data?: string } }>,
    options?: { role?: 'user' | 'system' }
  ): Promise<ChatResponse> {
    // Note: Letta SDK uses media_type (snake_case) for base64 images
    try {
      let content: any;

      // Handle multi-modal content array
      if (Array.isArray(message)) {
        content = message;
      } else {
        // Handle string message (backward compatible)
        content = message;
      }

      // Build request according to Letta SDK format
      // For multi-modal content, content should be an array
      // For simple text, content can be a string
      const role = options?.role ?? 'user';
      const request: any = {
        messages: [
          {
            role: role,
            content: content
          }
        ]
      };

      // Log full request structure for debugging (truncate base64)
      const debugRequest = JSON.parse(JSON.stringify(request));
      if (Array.isArray(debugRequest.messages[0].content)) {
        debugRequest.messages[0].content = debugRequest.messages[0].content.map((item: any) => {
          if (item.type === 'image' && item.source?.data) {
            return {
              ...item,
              source: {
                ...item.source,
                data: item.source.data.substring(0, 50) + '... (truncated)'
              }
            };
          }
          return item;
        });
      }
      log.debug('Full request structure', { request: debugRequest });

      // Debug: log the request being sent to Letta (truncate base64 data for readability)
      if (Array.isArray(content)) {
        const debugContent = content.map((item: any) => {
          if (item.type === 'image' && item.source?.data) {
            return {
              type: item.type,
              source: {
                ...item.source,
                data: item.source.data.substring(0, 50) + '... (truncated)'
              }
            };
          }
          return item;
        });
        log.debug('Sending request with content', { content: debugContent });
      } else {
        log.debug('Sending request with content', { content: typeof content === 'string' ? content.substring(0, 200) : content });
      }

      const response = await this.client.agents.messages.create(agentId, request);

      // Debug: log response structure to understand tool call format
      log.debug('Response from agents.messages.create', {
        messages_count: response.messages?.length || 0,
        message_types: response.messages?.map((m: any) => m.message_type || m.role || 'unknown'),
        has_tool_calls: response.messages?.some((m: any) => m.tool_call || m.tool_calls || m.message_type === 'tool_call_message')
      });

      return {
        messages: response.messages || [],
        usage: response.usage ? {
          step_count: response.usage.step_count || 0,
          total_tokens: response.usage.completion_tokens ?
            (response.usage.completion_tokens + (response.usage.prompt_tokens || 0)) :
            undefined
        } : undefined
      };
    } catch (error: any) {
      throw new Error(`Failed to send message to agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Send a message to an agent with streaming response
   * Returns an async iterator that yields streaming response chunks
   * @param agentId - The agent to send to
   * @param message - Text or multi-modal content
   * @param options - Optional settings including message role ('user' or 'system')
   */
  async *sendMessageStream(
    agentId: string,
    message: string | Array<{ type: 'text' | 'image'; text?: string; source?: { type: 'url' | 'base64'; url?: string; media_type?: string; data?: string } }>,
    options?: { role?: 'user' | 'system' }
  ): AsyncGenerator<any, void, unknown> {
    try {
      let content: any;

      // Handle multi-modal content array
      if (Array.isArray(message)) {
        content = message;
      } else {
        content = message;
      }

      const role = options?.role ?? 'user';
      log.debug('Starting streaming request', { agentId, role });

      const stream = await this.client.agents.messages.stream(agentId, {
        messages: [
          {
            role: role,
            content: content
          }
        ],
        stream_tokens: true,
        include_pings: true
      });

      for await (const chunk of stream) {
        log.debug('Stream chunk', {
          message_type: (chunk as any).message_type,
          has_content: !!(chunk as any).content
        });
        yield chunk;
      }

      log.debug('Stream completed', { agentId });
    } catch (error: any) {
      throw new Error(`Failed to stream message to agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Get conversation messages
   *
   * Note: Agents can search their own conversation history using
   * the built-in conversation_search tool
   */
  async getMessages(agentId: string, limit: number = 50): Promise<any[]> {
    try {
      const response = await this.client.agents.messages.list(agentId, {
        limit
      });

      // Handle pagination - response may have .items property in v1.0
      return (response as any).items || response;
    } catch (error: any) {
      throw new Error(`Failed to get messages for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Clear all messages for an agent
   */
  async clearMessages(agentId: string, addDefaultMessages: boolean = false): Promise<void> {
    try {
      // Use direct API call to reset-messages endpoint
      // The Letta API requires PATCH to /v1/agents/{agentId}/reset-messages with a body
      const baseURL = (this.client as any).baseURL || (this.client as any).baseUrl || (this.client as any)._options?.baseURL;
      const apiKey = (this.client as any).apiKey || (this.client as any)._options?.token;

      const response = await fetch(`${baseURL}/v1/agents/${agentId}/reset-messages`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ add_default_initial_messages: addDefaultMessages })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
    } catch (error: any) {
      throw new Error(`Failed to clear messages for agent ${agentId}: ${error.message}`);
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
      // Handle pagination - response may have .items property in v1.0
      const agents = (response as any).items || response;

      return agents.map((agent: any) => ({
        id: agent.id,
        name: agent.name,
        model: agent.llm_config?.model || 'unknown',
        embedding: agent.embedding_config?.embedding_model || 'unknown',
        created_at: agent.created_at?.toString() || ''
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
      await this.client.agents.tools.attach(toolId, { agent_id: agentId });
    } catch (error: any) {
      throw new Error(`Failed to attach tool ${toolId} to agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Create a custom tool from Python source code
   * Uses upsert to avoid duplicates - if a tool with the same name exists, it updates it
   * @returns Object with tool ID and name
   */
  async createTool(sourceCode: string, description?: string): Promise<{ id: string; name: string }> {
    try {
      const tool = await this.client.tools.upsert({
        source_code: sourceCode,
        description
      });
      if (!tool.id) {
        throw new Error('Tool created but no ID returned');
      }
      return { id: tool.id, name: tool.name || 'unknown' };
    } catch (error: any) {
      throw new Error(`Failed to create tool: ${error.message}`);
    }
  }

  /**
   * List all tools on the Letta server
   */
  async listTools(): Promise<Array<{ id: string; name: string; description?: string }>> {
    try {
      const response = await this.client.tools.list();
      const tools = (response as any).items || response;
      return tools.map((tool: any) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description
      }));
    } catch (error: any) {
      throw new Error(`Failed to list tools: ${error.message}`);
    }
  }

  /**
   * Get tool by name
   */
  async getToolByName(name: string): Promise<{ id: string; name: string; description?: string } | null> {
    const tools = await this.listTools();
    return tools.find(t => t.name === name) || null;
  }

  /**
   * List tools attached to an agent
   */
  async listAgentTools(agentId: string): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await this.client.agents.tools.list(agentId);
      const tools = (response as any).items || response;
      return tools.map((tool: any) => ({
        id: tool.id,
        name: tool.name
      }));
    } catch (error: any) {
      throw new Error(`Failed to list agent tools: ${error.message}`);
    }
  }

  /**
   * Detach a tool from an agent
   */
  async detachTool(agentId: string, toolId: string): Promise<void> {
    try {
      await this.client.agents.tools.detach(toolId, { agent_id: agentId });
    } catch (error: any) {
      throw new Error(`Failed to detach tool ${toolId} from agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * List available LLM models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.models.list();
      // Handle pagination - response may have .items property
      const models = (response as any).items || response;

      // Filter for LLM models only (not embeddings) and extract handles
      return models
        .filter((model: any) => {
          // Only include LLM models (not embeddings)
          return !model.model_type || model.model_type !== 'embedding';
        })
        .map((model: any) => {
          // Model might have a 'handle' field (format: provider/model-name)
          // or we can construct it from provider_type/name or endpoint_type/model
          if (model.handle) {
            return model.handle;
          }
          if (model.provider_type && model.name) {
            return `${model.provider_type}/${model.name}`;
          }
          if (model.model && model.endpoint_type) {
            return `${model.endpoint_type}/${model.model}`;
          }
          return model.model || model.name || 'unknown';
        })
        .filter((model: string) => model && model !== 'unknown');
    } catch (error: any) {
      throw new Error(`Failed to list models: ${error.message}`);
    }
  }

  /**
   * Update agent's LLM model
   */
  async updateAgentModel(agentId: string, model: string): Promise<void> {
    try {
      log.debug('Updating agent model', { model });

      // Handle openai-proxy (OpenRouter) models
      // Format: openai-proxy/anthropic/claude-opus-4.5 -> openai/anthropic/claude-opus-4.5
      // OpenRouter uses OpenAI-compatible API, so we convert the provider to 'openai'
      let modelToSet = model;
      if (model.startsWith('openai-proxy/')) {
        // Strip 'openai-proxy/' and prepend 'openai/' so SDK knows to use OpenAI endpoint
        const modelPath = model.slice('openai-proxy/'.length);
        modelToSet = `openai/${modelPath}`;
        log.debug('Converted openai-proxy model', { modelToSet });
      }

      // Use the SDK's model parameter directly
      await this.client.agents.update(agentId, {
        model: modelToSet
      });

      log.debug('Model updated successfully');
    } catch (error: any) {
      throw new Error(`Failed to update agent model: ${error.message}`);
    }
  }

  /**
   * Get full LLM configuration for an agent
   */
  async getAgentLLMConfig(agentId: string): Promise<{
    model: string;
    model_endpoint_type: string;
    embedding: string;
    embedding_endpoint_type: string;
    embedding_dim: number;
    context_window: number;
    enable_sleeptime: boolean;
    system: string;
  }> {
    try {
      const agent = await this.client.agents.retrieve(agentId) as any;
      return {
        model: agent.llm_config?.model || '',
        model_endpoint_type: agent.llm_config?.model_endpoint_type || 'openai',
        embedding: agent.embedding_config?.embedding_model || '',
        embedding_endpoint_type: agent.embedding_config?.embedding_endpoint_type || 'openai',
        embedding_dim: agent.embedding_config?.embedding_dim || 1536,
        context_window: agent.llm_config?.context_window || 8192,
        enable_sleeptime: agent.enable_sleeptime || false,
        system: agent.system || '',
      };
    } catch (error: any) {
      throw new Error(`Failed to get agent LLM config: ${error.message}`);
    }
  }

  /**
   * Update LLM configuration for an agent
   * All parameters are optional - only provided values will be updated
   */
  async updateAgentLLMConfig(agentId: string, config: {
    model?: string;
    embedding?: string;
    context_window_limit?: number;
    enable_sleeptime?: boolean;
    system?: string;
  }): Promise<void> {
    try {
      log.debug('Updating agent LLM config', { config });

      // Validate agentId
      if (!agentId) {
        throw new Error('Agent ID is required');
      }

      // Validate config object
      if (!config || typeof config !== 'object') {
        throw new Error('Config object is required');
      }

      const updateParams: Record<string, unknown> = {};

      if (config.model !== undefined) {
        // Validate model is a non-empty string
        if (typeof config.model !== 'string' || !config.model.trim()) {
          throw new Error('Model must be a non-empty string');
        }
        // Handle openai-proxy conversion
        let modelToSet = config.model;
        if (config.model.startsWith('openai-proxy/')) {
          const modelPath = config.model.slice('openai-proxy/'.length);
          modelToSet = `openai/${modelPath}`;
        }
        updateParams.model = modelToSet;
      }

      if (config.embedding !== undefined) {
        updateParams.embedding = config.embedding;
      }

      if (config.context_window_limit !== undefined) {
        updateParams.context_window_limit = config.context_window_limit;
      }

      if (config.enable_sleeptime !== undefined) {
        updateParams.enable_sleeptime = config.enable_sleeptime;
      }

      if (config.system !== undefined) {
        updateParams.system = config.system;
      }

      if (Object.keys(updateParams).length > 0) {
        log.debug('Calling agents.update', { params: updateParams });
        await this.client.agents.update(agentId, updateParams);
        log.debug('LLM config updated successfully');
      }
    } catch (error: any) {
      // Handle various error formats from the SDK
      const errorMessage = error?.message
        || error?.body?.message
        || error?.body?.detail
        || (typeof error === 'string' ? error : JSON.stringify(error));
      log.error('Failed to update LLM config', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to update agent LLM config: ${errorMessage}`);
    }
  }

  /**
   * Get the raw Letta SDK client for direct SDK access.
   * Use this when you need SDK methods not wrapped by LettaClientWrapper.
   */
  get sdk(): Letta {
    return this.client;
  }

  /**
   * Get the raw client for advanced operations
   * @deprecated Use the `sdk` property instead
   */
  getRawClient(): Letta {
    return this.client;
  }

  // ============================================
  // Group Methods (Multi-Agent Conversations)
  // ============================================

  /**
   * Create a new group for multi-agent conversations
   */
  async createGroup(options: CreateGroupOptions): Promise<GroupInfo> {
    try {
      const createParams: any = {
        name: options.name,
        agent_ids: options.agent_ids,
      };

      if (options.description) {
        createParams.description = options.description;
      }

      if (options.manager_type) {
        createParams.manager_config = {
          manager_type: options.manager_type
        };
      }

      const group = await this.client.groups.create(createParams) as any;
      return {
        id: group.id,
        name: group.name || options.name,
        description: group.description,
        agent_ids: group.agent_ids || options.agent_ids,
        manager_type: group.manager_config?.manager_type || options.manager_type || 'round_robin',
        created_at: group.created_at?.toString() || new Date().toISOString()
      };
    } catch (error: any) {
      throw new Error(`Failed to create group: ${error.message}`);
    }
  }

  /**
   * Get a group by ID
   */
  async getGroup(groupId: string): Promise<GroupInfo | null> {
    try {
      const group = await this.client.groups.retrieve(groupId) as any;
      return {
        id: group.id,
        name: group.name || '',
        description: group.description,
        agent_ids: group.agent_ids || [],
        manager_type: group.manager_config?.manager_type || 'round_robin',
        created_at: group.created_at?.toString() || ''
      };
    } catch (error: any) {
      if (error.status === 404 || error.statusCode === 404) {
        return null;
      }
      throw new Error(`Failed to get group ${groupId}: ${error.message}`);
    }
  }

  /**
   * List all groups
   */
  async listGroups(): Promise<GroupInfo[]> {
    try {
      const response = await this.client.groups.list();
      const groups = (response as any).items || response;
      return groups.map((group: any) => ({
        id: group.id,
        name: group.name || '',
        description: group.description,
        agent_ids: group.agent_ids || [],
        manager_type: group.manager_config?.manager_type || 'round_robin',
        created_at: group.created_at?.toString() || ''
      }));
    } catch (error: any) {
      throw new Error(`Failed to list groups: ${error.message}`);
    }
  }

  /**
   * Update a group
   */
  async updateGroup(groupId: string, updates: { name?: string; description?: string; agent_ids?: string[] }): Promise<GroupInfo> {
    try {
      const updateParams: any = {};
      if (updates.name !== undefined) updateParams.name = updates.name;
      if (updates.description !== undefined) updateParams.description = updates.description;
      if (updates.agent_ids !== undefined) updateParams.agent_ids = updates.agent_ids;

      const group = await this.client.groups.update(groupId, updateParams) as any;
      return {
        id: group.id,
        name: group.name || '',
        description: group.description,
        agent_ids: group.agent_ids || [],
        manager_type: group.manager_config?.manager_type || 'round_robin',
        created_at: group.created_at?.toString() || ''
      };
    } catch (error: any) {
      throw new Error(`Failed to update group ${groupId}: ${error.message}`);
    }
  }

  /**
   * Delete a group
   */
  async deleteGroup(groupId: string): Promise<void> {
    try {
      await this.client.groups.delete(groupId);
    } catch (error: any) {
      throw new Error(`Failed to delete group ${groupId}: ${error.message}`);
    }
  }

  /**
   * Send a message to a group
   * The group manager will route the message to appropriate agents
   */
  async sendGroupMessage(groupId: string, message: string, options?: { role?: 'user' | 'system' }): Promise<ChatResponse> {
    try {
      const role = options?.role ?? 'user';

      // Groups use the same messaging API pattern as agents
      // Access via client.groups.messages or similar
      const response = await (this.client.groups as any).messages.create(groupId, {
        messages: [
          {
            role: role,
            content: message
          }
        ]
      });

      return {
        messages: response.messages || [],
        usage: response.usage ? {
          step_count: response.usage.step_count || 0,
          total_tokens: response.usage.completion_tokens ?
            (response.usage.completion_tokens + (response.usage.prompt_tokens || 0)) :
            undefined
        } : undefined
      };
    } catch (error: any) {
      throw new Error(`Failed to send message to group ${groupId}: ${error.message}`);
    }
  }

  /**
   * Get messages from a group
   */
  async getGroupMessages(groupId: string, limit: number = 50): Promise<any[]> {
    try {
      const response = await (this.client.groups as any).messages.list(groupId, { limit });
      return (response as any).items || response;
    } catch (error: any) {
      throw new Error(`Failed to get group messages ${groupId}: ${error.message}`);
    }
  }

  // ============================================
  // Folder Methods
  // ============================================

  /**
   * Create a new folder
   */
  async createFolder(name: string, description?: string): Promise<FolderInfo> {
    try {
      const params: { name: string; description?: string } = { name };
      if (description) {
        params.description = description;
      }
      const folder = await (this.client as any).folders.create(params);
      return {
        id: folder.id,
        name: folder.name,
        description: folder.description,
        created_at: folder.created_at?.toString() || new Date().toISOString(),
        updated_at: folder.updated_at?.toString()
      };
    } catch (error: any) {
      throw new Error(`Failed to create folder: ${error.message}`);
    }
  }

  /**
   * Delete a folder
   */
  async deleteFolder(folderId: string): Promise<void> {
    try {
      await (this.client as any).folders.delete(folderId);
    } catch (error: any) {
      throw new Error(`Failed to delete folder ${folderId}: ${error.message}`);
    }
  }

  /**
   * List all folders
   */
  async listFolders(): Promise<FolderInfo[]> {
    try {
      const response = await (this.client as any).folders.list();
      const folders = (response as any).items || response;
      return folders.map((folder: any) => ({
        id: folder.id,
        name: folder.name,
        description: folder.description,
        created_at: folder.created_at?.toString() || '',
        updated_at: folder.updated_at?.toString()
      }));
    } catch (error: any) {
      throw new Error(`Failed to list folders: ${error.message}`);
    }
  }

  /**
   * Get a folder by ID
   */
  async getFolder(folderId: string): Promise<FolderInfo> {
    try {
      const folder = await (this.client as any).folders.retrieve(folderId);
      return {
        id: folder.id,
        name: folder.name,
        description: folder.description,
        created_at: folder.created_at?.toString() || '',
        updated_at: folder.updated_at?.toString()
      };
    } catch (error: any) {
      throw new Error(`Failed to get folder ${folderId}: ${error.message}`);
    }
  }

  /**
   * Update a folder
   */
  async updateFolder(folderId: string, updates: FolderUpdate): Promise<FolderInfo> {
    try {
      const folder = await (this.client as any).folders.update(folderId, updates);
      return {
        id: folder.id,
        name: folder.name,
        description: folder.description,
        created_at: folder.created_at?.toString() || '',
        updated_at: folder.updated_at?.toString()
      };
    } catch (error: any) {
      throw new Error(`Failed to update folder ${folderId}: ${error.message}`);
    }
  }

  // ============================================
  // File Methods (Folder Files)
  // ============================================

  /**
   * Upload a file to a folder
   * @param folderId - The folder to upload to
   * @param content - The file content as a string
   * @param filename - The filename to use
   * @param options - Upload options including duplicate handling
   */
  async uploadFileToFolder(
    folderId: string,
    content: string,
    filename: string,
    options?: { duplicateHandling?: DuplicateHandling }
  ): Promise<FileInfo> {
    try {
      // Create a File object from the content (Node.js 20+ has native File support)
      // For the Letta SDK, we need to provide a proper file-like object
      const { Buffer } = await import('buffer');

      // Create buffer from the content
      const buffer = Buffer.from(content, 'utf-8');

      // Use the File API if available (Node.js 20+), otherwise use a Blob-like object
      let fileObj: any;
      if (typeof File !== 'undefined') {
        fileObj = new File([buffer], filename, { type: 'text/plain' });
      } else {
        // Fallback: create a Blob-like object with name property
        const blob = new Blob([buffer], { type: 'text/plain' });
        fileObj = Object.assign(blob, { name: filename });
      }

      const uploadParams: any = {
        file: fileObj,
        name: filename
      };
      if (options?.duplicateHandling) {
        uploadParams.duplicate_handling = options.duplicateHandling;
      }

      const file = await (this.client as any).folders.files.upload(folderId, uploadParams);

      return {
        id: file.id,
        file_name: file.file_name || filename,
        original_file_name: file.original_file_name,
        file_size: file.file_size,
        file_type: file.file_type,
        processing_status: file.processing_status,
        content: file.content,
        created_at: file.created_at?.toString() || new Date().toISOString(),
        updated_at: file.updated_at?.toString(),
        error_message: file.error_message
      };
    } catch (error: any) {
      throw new Error(`Failed to upload file to folder ${folderId}: ${error.message}`);
    }
  }

  /**
   * Delete a file from a folder
   */
  async deleteFileFromFolder(folderId: string, fileId: string): Promise<void> {
    try {
      // SDK signature: delete(fileId, { folder_id })
      await (this.client as any).folders.files.delete(fileId, { folder_id: folderId });
    } catch (error: any) {
      throw new Error(`Failed to delete file ${fileId} from folder ${folderId}: ${error.message}`);
    }
  }

  /**
   * List files in a folder
   */
  async listFilesInFolder(folderId: string): Promise<FileInfo[]> {
    try {
      const response = await (this.client as any).folders.files.list(folderId);
      const files = (response as any).items || response;

      return files.map((file: any) => ({
        id: file.id,
        file_name: file.file_name,
        original_file_name: file.original_file_name,
        file_size: file.file_size,
        file_type: file.file_type,
        processing_status: file.processing_status,
        content: file.content,
        created_at: file.created_at?.toString() || '',
        updated_at: file.updated_at?.toString(),
        error_message: file.error_message
      }));
    } catch (error: any) {
      throw new Error(`Failed to list files in folder ${folderId}: ${error.message}`);
    }
  }

  /**
   * Get file content from a folder (internal use for patching)
   * Note: Not exposed to agents - they use open_file tool instead
   *
   * Since the SDK doesn't have a retrieve method, we use direct REST API
   */
  async getFileContent(folderId: string, fileId: string): Promise<string> {
    try {
      // Get base URL and API key from the client for direct REST call
      const baseURL = (this.client as any).baseURL
        || (this.client as any).baseUrl
        || (this.client as any)._options?.baseURL
        || 'http://localhost:8283';
      const apiKey = (this.client as any).apiKey
        || (this.client as any)._options?.token
        || (this.client as any)._options?.apiKey;

      // Try the folders/files endpoint to get file with content
      const response = await fetch(`${baseURL}/v1/folders/${folderId}/files/${fileId}`, {
        method: 'GET',
        headers: {
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        // If the direct file endpoint doesn't work, try getting from list
        // and hope content is included
        const files = await this.listFilesInFolder(folderId);
        const file = files.find(f => f.id === fileId);
        if (file?.content !== undefined) {
          return file.content;
        }
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const file = await response.json() as { content?: string | null };
      if (file.content) {
        return file.content;
      }

      // If content not in response, it might need to be requested separately
      // Try with include_content query param
      const responseWithContent = await fetch(
        `${baseURL}/v1/folders/${folderId}/files/${fileId}?include_content=true`,
        {
          method: 'GET',
          headers: {
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
            'Content-Type': 'application/json'
          }
        }
      );

      if (responseWithContent.ok) {
        const fileWithContent = await responseWithContent.json() as { content?: string | null };
        if (fileWithContent.content) {
          return fileWithContent.content;
        }
      }

      // Content not available - this could mean:
      // 1. File is still processing (check processing_status)
      // 2. File content is not exposed via API
      // 3. File is binary/not text
      throw new Error(
        `File content not available. The file may still be processing, or content retrieval ` +
        `may not be supported for this file type. Try waiting and retrying.`
      );
    } catch (error: any) {
      throw new Error(`Failed to get file content for ${fileId}: ${error.message}`);
    }
  }

  // ============================================
  // Folder-Agent Attachment Methods
  // ============================================

  /**
   * Attach a folder to an agent (gives agent access to files via open_file tool)
   */
  async attachFolderToAgent(folderId: string, agentId: string): Promise<void> {
    try {
      await (this.client as any).agents.folders.attach(folderId, { agent_id: agentId });
    } catch (error: any) {
      throw new Error(`Failed to attach folder ${folderId} to agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Detach a folder from an agent
   */
  async detachFolderFromAgent(folderId: string, agentId: string): Promise<void> {
    try {
      await (this.client as any).agents.folders.detach(folderId, { agent_id: agentId });
    } catch (error: any) {
      throw new Error(`Failed to detach folder ${folderId} from agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * List folders attached to an agent
   */
  async listAgentFolders(agentId: string): Promise<FolderInfo[]> {
    try {
      const response = await (this.client as any).agents.folders.list(agentId);
      const folders = (response as any).items || response;

      return folders.map((folder: any) => ({
        id: folder.id,
        name: folder.name,
        description: folder.description,
        created_at: folder.created_at?.toString() || '',
        updated_at: folder.updated_at?.toString()
      }));
    } catch (error: any) {
      throw new Error(`Failed to list folders for agent ${agentId}: ${error.message}`);
    }
  }

  // ============================================
  // Agent File Methods
  // ============================================

  /**
   * Open a file for an agent, making its content available in the agent's context
   * Note: The folder containing the file must already be attached to the agent
   * @returns Array of closed file names (due to LRU eviction) if any
   */
  async openFileForAgent(agentId: string, fileId: string): Promise<string[]> {
    try {
      const result = await (this.client as any).agents.files.open(fileId, {
        agent_id: agentId
      });
      return result || [];
    } catch (error: any) {
      throw new Error(`Failed to open file ${fileId} for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Close a file for an agent, removing it from the agent's context
   */
  async closeFileForAgent(agentId: string, fileId: string): Promise<void> {
    try {
      await (this.client as any).agents.files.close(fileId, {
        agent_id: agentId
      });
    } catch (error: any) {
      throw new Error(`Failed to close file ${fileId} for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * List files accessible to an agent (from attached folders)
   * Shows which files are currently open in the agent's context
   */
  async listAgentFiles(agentId: string): Promise<Array<{
    id: string;
    file_id: string;
    file_name: string;
    folder_id: string;
    folder_name: string;
    is_open: boolean;
    visible_content?: string;
  }>> {
    try {
      const response = await (this.client as any).agents.files.list(agentId);

      // Handle various response formats
      let files: any[];
      if (Array.isArray(response)) {
        files = response;
      } else if (response?.items && Array.isArray(response.items)) {
        files = response.items;
      } else if (response?.data && Array.isArray(response.data)) {
        files = response.data;
      } else {
        // Debug: log unexpected response format
        log.debug('Unexpected agents.files.list response', { response });
        files = [];
      }

      return files.map((f: any) => ({
        id: f.id || f.file_id,
        file_id: f.file_id || f.id,
        file_name: f.file_name || f.filename || f.name,
        folder_id: f.folder_id || f.source_id,
        folder_name: f.folder_name || f.source_name || 'unknown',
        is_open: f.is_open ?? false,
        visible_content: f.visible_content
      }));
    } catch (error: any) {
      throw new Error(`Failed to list files for agent ${agentId}: ${error.message}`);
    }
  }

  // ============================================
  // Name Resolution Helpers
  // ============================================

  /**
   * Find a folder by name
   * @returns The folder info or null if not found
   */
  async getFolderByName(name: string): Promise<FolderInfo | null> {
    const folders = await this.listFolders();
    return folders.find(f => f.name === name) || null;
  }

  /**
   * Find a file in a folder by filename
   * @returns The file info or null if not found
   */
  async getFileByName(folderId: string, filename: string): Promise<FileInfo | null> {
    const files = await this.listFilesInFolder(folderId);
    return files.find(f => f.file_name === filename) || null;
  }

  /**
   * Find a file accessible to an agent by filename
   * Searches across all attached folders
   * @returns Object with file_id and folder_id, or null if not found
   */
  async getAgentFileByName(agentId: string, filename: string): Promise<{
    file_id: string;
    folder_id: string;
    folder_name: string;
  } | null> {
    const files = await this.listAgentFiles(agentId);
    const file = files.find(f => f.file_name === filename);
    if (!file) return null;
    return {
      file_id: file.file_id,
      folder_id: file.folder_id,
      folder_name: file.folder_name
    };
  }

}
