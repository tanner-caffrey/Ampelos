/**
 * Letta Manager
 *
 * Core infrastructure for managing Letta agent lifecycle and state.
 * This is NOT a module service - it's core infrastructure initialized before services.
 *
 * Supports BOTH cloud and self-hosted Letta backends simultaneously.
 * Each agent can be configured to use either backend, allowing mixed deployments.
 *
 * Init scenarios for each agent (in priority order):
 * 1. Reconnect: state has letta_agent_id AND agent exists on Letta server → reconnect
 * 2. Create: config provided (no valid existing agent) → create new
 * 3. Error: no config, no usable state → throw error
 */

import type { AgentId, AgentMetadata } from '../../types/agent.js';
import type { ReactiveState } from '../state-manager.js';
import type { LettaToolDefinition } from '../../types/tool.js';
import { Letta } from '@letta-ai/letta-client';
import { LettaClientWrapper, AgentInfo, MemoryBlockDetailed, ChatResponse, LettaConfig } from './letta-client.js';
import { buildAgentConfig, validateLettaConfig } from './utils/memory-builder.js';
import type { LettaAgentConfig } from './utils/config-validator.js';
import type { LettaState, LettaBackendType, AgentBlockInfo, ChatCompleteCallback, ChatCompleteContext, ChatCompleteCallbackWithContext, ChatOptions, ILettaAgentContext, LettaMessageContent } from './types.js';
import { createComponentLogger } from '../logger.js';

const log = createComponentLogger('Letta');
const STATE_NAMESPACE = 'letta';

/** Default backend when not specified */
const DEFAULT_BACKEND: LettaBackendType = 'self-hosted';

/**
 * Context required for LettaManager initialization
 */
export interface LettaManagerContext {
  getState<T>(agentId: AgentId, serviceName: string): ReactiveState<T>;
  getAgentMetadata(agentId: AgentId): AgentMetadata;
  getEnabledAgentIds(): AgentId[];
  getLettaTools?(agentId: AgentId): LettaToolDefinition[];
}

/**
 * Callback for registering Letta agent mappings with the MCP server
 */
export type RegisterLettaAgentFn = (lettaAgentId: string, ampelosAgentId: AgentId) => void;

/**
 * Agent-bound context for Letta operations
 */
export class LettaAgentContext implements ILettaAgentContext {
  constructor(
    private manager: LettaManager,
    public readonly ampelosAgentId: AgentId,
    public readonly lettaAgentId: string
  ) {}

  async chat(message: string, options?: ChatOptions): Promise<ChatResponse> {
    return this.manager.chat(this.ampelosAgentId, message, options);
  }

  async getMemory(): Promise<Record<string, string>> {
    return this.manager.getMemory(this.ampelosAgentId);
  }

  async updateMemory(label: string, value: string): Promise<void> {
    return this.manager.updateMemory(this.ampelosAgentId, label, value);
  }

  async getMemoryBlocks(): Promise<MemoryBlockDetailed[]> {
    return this.manager.getMemoryBlocksDetailed(this.ampelosAgentId);
  }

  async addMemoryBlock(label: string, value: string, limit?: number): Promise<string> {
    return this.manager.addMemoryBlock(this.ampelosAgentId, label, value, limit);
  }

  async removeMemoryBlock(blockId: string): Promise<void> {
    return this.manager.removeMemoryBlock(this.ampelosAgentId, blockId);
  }

  async getMessages(limit?: number): Promise<any[]> {
    return this.manager.getMessages(this.ampelosAgentId, limit);
  }

  async clearMessages(): Promise<void> {
    return this.manager.clearMessages(this.ampelosAgentId);
  }

  async getInfo(): Promise<AgentInfo | undefined> {
    return this.manager.getAgentInfo(this.ampelosAgentId);
  }

  /**
   * Get the raw Letta SDK client for this agent's backend.
   * Use this for direct SDK access when wrapper methods aren't sufficient.
   */
  get sdk(): Letta {
    const backend = this.manager.getAgentBackend(this.ampelosAgentId);
    const wrapper = this.manager.getClientForBackend(backend);
    if (!wrapper) {
      throw new Error(`No Letta client configured for agent ${this.ampelosAgentId} (backend: ${backend})`);
    }
    return wrapper.sdk;
  }

  /**
   * @deprecated Use the `sdk` property instead for direct SDK access
   */
  getClient(): LettaClientWrapper {
    return this.manager.getClient();
  }
}

/**
 * LettaManager - Core infrastructure for Letta agent management
 *
 * Supports multiple backends simultaneously (cloud + self-hosted)
 */
export class LettaManager {
  /** Map of backend type to client instance */
  private clients: Map<LettaBackendType, LettaClientWrapper> = new Map();
  private context?: LettaManagerContext;
  private registerLettaAgentFn?: RegisterLettaAgentFn;
  private onChatCompleteCallbacks: Map<AgentId, ChatCompleteCallback[]> = new Map();
  private onChatCompleteWithContextCallbacks: Map<AgentId, ChatCompleteCallbackWithContext[]> = new Map();

  /**
   * Initialize the manager (called once at startup)
   * Creates clients for all configured backends (cloud and/or self-hosted)
   */
  async init(context: LettaManagerContext, registerFn?: RegisterLettaAgentFn): Promise<void> {
    this.context = context;
    this.registerLettaAgentFn = registerFn;

    // Self-hosted configuration
    const selfHostedUrl = process.env.LETTA_SERVER_URL;
    const selfHostedToken = process.env.LETTA_TOKEN;

    // Cloud configuration
    const cloudApiKey = process.env.LETTA_CLOUD_API_KEY;
    const cloudProjectId = process.env.LETTA_CLOUD_PROJECT_ID;

    // Initialize self-hosted client if configured
    if (selfHostedUrl) {
      const selfHostedConfig: LettaConfig = {
        backend: 'self-hosted',
        baseUrl: selfHostedUrl,
        token: selfHostedToken,
      };
      this.clients.set('self-hosted', new LettaClientWrapper(selfHostedConfig));
      log.info(`Self-hosted backend initialized: ${selfHostedUrl}`);
    }

    // Initialize cloud client if configured
    if (cloudApiKey) {
      const cloudConfig: LettaConfig = {
        backend: 'cloud',
        token: cloudApiKey,
        projectId: cloudProjectId,
      };
      this.clients.set('cloud', new LettaClientWrapper(cloudConfig));
      log.info(`Cloud backend initialized${cloudProjectId ? ` (project: ${cloudProjectId})` : ''}`);
    }

    // Check that at least one backend is configured
    if (this.clients.size === 0) {
      log.warn('No backends configured. Set LETTA_SERVER_URL for self-hosted or LETTA_CLOUD_API_KEY for cloud.');
    } else {
      log.info(`Manager initialized with ${this.clients.size} backend(s): ${Array.from(this.clients.keys()).join(', ')}`);
    }
  }

  /**
   * Check if a specific backend is available
   */
  hasBackend(backend: LettaBackendType): boolean {
    return this.clients.has(backend);
  }

  /**
   * Get available backends
   */
  getAvailableBackends(): LettaBackendType[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Get client for a specific backend
   */
  getClientForBackend(backend: LettaBackendType): LettaClientWrapper | undefined {
    return this.clients.get(backend);
  }

  /**
   * Get the raw Letta SDK client for a specific backend.
   * Use this for direct SDK access when you need methods not wrapped by LettaClientWrapper.
   */
  getSdk(backend: LettaBackendType): Letta | undefined {
    return this.clients.get(backend)?.sdk;
  }

  /**
   * Get the raw Letta SDK client for a specific agent's backend.
   * Convenience method that resolves the agent's backend and returns the SDK client.
   */
  getSdkForAgent(agentId: AgentId): Letta | undefined {
    const backend = this.getAgentBackend(agentId);
    return this.clients.get(backend)?.sdk;
  }

  /**
   * Get the backend type for an agent (from state)
   */
  getAgentBackend(agentId: AgentId): LettaBackendType {
    if (!this.context) return DEFAULT_BACKEND;
    const state = this.context.getState<LettaState>(agentId, STATE_NAMESPACE);
    return state.get()?.backend || DEFAULT_BACKEND;
  }

  /**
   * Get the client for a specific agent (based on agent's backend)
   */
  private getClientForAgent(agentId: AgentId): LettaClientWrapper | undefined {
    const backend = this.getAgentBackend(agentId);
    return this.clients.get(backend);
  }

  /**
   * Set the registration function (can be set after init)
   */
  setRegisterLettaAgentFn(fn: RegisterLettaAgentFn): void {
    this.registerLettaAgentFn = fn;
  }

  /**
   * Check if an agent can reconnect without config
   */
  canReconnect(agentId: AgentId, state: Record<string, unknown>): boolean {
    const lettaState = state as unknown as LettaState;
    if (!lettaState?.letta_agent_id) return false;

    // Check if we have the required backend configured
    const backend = lettaState.backend || DEFAULT_BACKEND;
    return this.hasBackend(backend);
  }

  /**
   * Initialize Letta for a specific agent
   * @param agentId - The Ampelos agent ID
   * @param config - Optional config for new agent creation
   * @param backend - Backend to use (defaults to self-hosted for new agents, or state's backend for existing)
   */
  async initAgent(agentId: AgentId, config?: LettaAgentConfig, backend?: LettaBackendType): Promise<void> {
    if (!this.context) {
      throw new Error('Letta manager not initialized');
    }

    const state = this.context.getState<LettaState>(agentId, STATE_NAMESPACE);
    const existingState = state.get();

    // Scenario 1: Reconnect (have state with letta_agent_id)
    if (existingState?.letta_agent_id) {
      const agentBackend = existingState.backend || DEFAULT_BACKEND;
      const client = this.clients.get(agentBackend);

      if (!client) {
        throw new Error(`Backend '${agentBackend}' not configured. Configure ${agentBackend === 'cloud' ? 'LETTA_CLOUD_API_KEY' : 'LETTA_SERVER_URL'}.`);
      }

      const exists = await client.agentExists(existingState.letta_agent_id);
      if (exists) {
        state.set({
          ...existingState,
          initialized: true,
        });

        // Ensure module tools are attached (handles adding new modules)
        await this.syncModuleLettaTools(agentId, existingState.letta_agent_id, agentBackend);

        // Register with MCP server
        if (this.registerLettaAgentFn) {
          this.registerLettaAgentFn(existingState.letta_agent_id, agentId);
        }

        log.info(`Reconnected agent ${agentId} to: ${existingState.letta_agent_id} (backend: ${agentBackend})`);
        return;
      }
      log.info(`Stored agent ${existingState.letta_agent_id} not found on ${agentBackend} Letta server`);
    }

    // Scenario 2: Create (have config, no valid existing agent)
    if (config) {
      // Determine backend: use explicit param, config, or default
      const targetBackend = backend || (config as any).backend || DEFAULT_BACKEND;
      await this.createLettaAgent(agentId, config, targetBackend);
      return;
    }

    // Scenario 3: Nothing (no config, no usable state)
    throw new Error(
      'Letta requires configuration for first-time setup. ' +
        'Provide letta config when creating or adding this agent.'
    );
  }

  /**
   * Create a new Letta agent for an Ampelos agent
   */
  private async createLettaAgent(agentId: AgentId, agentConfig: LettaAgentConfig, backend: LettaBackendType): Promise<void> {
    if (!this.context) {
      throw new Error('Letta manager not initialized');
    }

    const client = this.clients.get(backend);
    if (!client) {
      throw new Error(`Backend '${backend}' not configured. Configure ${backend === 'cloud' ? 'LETTA_CLOUD_API_KEY' : 'LETTA_SERVER_URL'}.`);
    }

    // Validate config
    validateLettaConfig(agentConfig);

    const agentMetadata = this.context.getAgentMetadata(agentId);
    const agentName = agentMetadata.agent_name;
    log.info(`Creating new agent for ${agentName} on ${backend} backend`);

    const createConfig = await buildAgentConfig(agentName, agentConfig);
    const lettaAgentId = await client.createAgent(createConfig);

    // Create and attach Letta tools from agent's modules
    await this.attachModuleLettaTools(agentId, lettaAgentId, backend);

    // Save state (including backend)
    const state = this.context.getState<LettaState>(agentId, STATE_NAMESPACE);
    state.set({
      letta_agent_id: lettaAgentId,
      backend,
      initialized: true,
      created_at: new Date().toISOString(),
    });
    await state.flush();

    // Register with MCP server
    if (this.registerLettaAgentFn) {
      this.registerLettaAgentFn(lettaAgentId, agentId);
    }

    log.info(`Created agent for ${agentId}: ${lettaAgentId} (backend: ${backend})`);
  }

  /**
   * Create and attach Letta tools from the agent's modules
   */
  private async attachModuleLettaTools(agentId: AgentId, lettaAgentId: string, backend: LettaBackendType): Promise<void> {
    if (!this.context) return;

    const client = this.clients.get(backend);
    if (!client) return;

    const lettaTools = this.context.getLettaTools?.(agentId) ?? [];
    if (lettaTools.length === 0) return;

    log.info(`Creating and attaching ${lettaTools.length} tools for agent ${agentId}`);

    for (const toolDef of lettaTools) {
      try {
        const { id: toolId, name: toolName } = await client.createTool(
          toolDef.source_code,
          toolDef.description
        );
        await client.attachTool(lettaAgentId, toolId);
        log.debug(`Attached tool "${toolName}" (${toolId})`);
      } catch (error: any) {
        log.error(`Failed to create/attach tool: ${error.message}`);
      }
    }
  }

  /**
   * Sync Letta tools on reconnect - attach any missing tools
   */
  private async syncModuleLettaTools(agentId: AgentId, lettaAgentId: string, backend: LettaBackendType): Promise<void> {
    if (!this.context) return;

    const client = this.clients.get(backend);
    if (!client) return;

    const lettaTools = this.context.getLettaTools?.(agentId) ?? [];
    if (lettaTools.length === 0) return;

    const attachedTools = await client.listAgentTools(lettaAgentId);
    const attachedToolNames = new Set(attachedTools.map(t => t.name));

    const toolsToAttach = lettaTools.filter(toolDef => {
      const funcMatch = toolDef.source_code.match(/def\s+(\w+)\s*\(/g);
      if (!funcMatch) return true;
      const lastFunc = funcMatch[funcMatch.length - 1];
      const funcName = lastFunc.match(/def\s+(\w+)/)?.[1];
      return funcName ? !attachedToolNames.has(funcName) : true;
    });

    if (toolsToAttach.length === 0) return;

    log.info(`Attaching ${toolsToAttach.length} missing tools for agent ${agentId}`);

    for (const toolDef of toolsToAttach) {
      try {
        const { id: toolId, name: toolName } = await client.createTool(
          toolDef.source_code,
          toolDef.description
        );
        await client.attachTool(lettaAgentId, toolId);
        log.debug(`Attached tool "${toolName}" (${toolId})`);
      } catch (error: any) {
        log.error(`Failed to create/attach tool: ${error.message}`);
      }
    }
  }

  // ===== Public Methods =====

  /**
   * Get an agent-bound context for Letta operations
   */
  getAgentContext(agentId: AgentId): LettaAgentContext | undefined {
    const lettaAgentId = this.getLettaAgentId(agentId);
    if (!lettaAgentId) return undefined;
    return new LettaAgentContext(this, agentId, lettaAgentId);
  }

  /**
   * Get the Letta agent ID for an Ampelos agent
   */
  getLettaAgentId(agentId: AgentId): string | undefined {
    if (!this.context) return undefined;
    const state = this.context.getState<LettaState>(agentId, STATE_NAMESPACE);
    return state.get()?.letta_agent_id;
  }

  /**
   * Get agent information from Letta server
   */
  async getAgentInfo(agentId: AgentId): Promise<AgentInfo | undefined> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) return undefined;
    return await client.getAgent(lettaAgentId);
  }

  /**
   * Get a client for a specific agent
   * @deprecated Use getClientForBackend() instead for explicit backend selection
   */
  getClient(): LettaClientWrapper {
    // Return the first available client for backward compatibility
    const client = this.clients.get('self-hosted') || this.clients.get('cloud');
    if (!client) {
      throw new Error('Letta manager not initialized - no backends configured');
    }
    return client;
  }

  /**
   * List available LLM models from a specific backend
   * @param backend - Backend to query (defaults to first available)
   */
  async listModels(backend?: LettaBackendType): Promise<string[]> {
    const client = backend
      ? this.clients.get(backend)
      : (this.clients.get('self-hosted') || this.clients.get('cloud'));
    if (!client) {
      throw new Error('Letta manager not initialized');
    }
    return await client.listModels();
  }

  /**
   * Update agent's LLM model
   */
  async updateAgentModel(agentId: AgentId, model: string): Promise<void> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }
    await client.updateAgentModel(lettaAgentId, model);
  }

  /**
   * Get full LLM configuration for an agent
   */
  async getLLMConfig(agentId: AgentId): Promise<{
    model: string;
    model_endpoint_type: string;
    embedding: string;
    embedding_endpoint_type: string;
    embedding_dim: number;
    context_window: number;
    enable_sleeptime: boolean;
    system: string;
  } | undefined> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) return undefined;
    return await client.getAgentLLMConfig(lettaAgentId);
  }

  /**
   * Update LLM configuration for an agent
   */
  async updateLLMConfig(agentId: AgentId, config: {
    model?: string;
    embedding?: string;
    context_window_limit?: number;
    enable_sleeptime?: boolean;
    system?: string;
  }): Promise<void> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }
    await client.updateAgentLLMConfig(lettaAgentId, config);
  }

  /**
   * List tools attached to a Letta agent
   */
  async listAgentTools(agentId: AgentId): Promise<Array<{ id: string; name: string }>> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      return [];
    }
    return await client.listAgentTools(lettaAgentId);
  }

  /**
   * List all available tools on a Letta server
   * @param backend - Backend to query (defaults to first available)
   */
  async listAllTools(backend?: LettaBackendType): Promise<Array<{ id: string; name: string; description?: string }>> {
    const client = backend
      ? this.clients.get(backend)
      : (this.clients.get('self-hosted') || this.clients.get('cloud'));
    if (!client) {
      return [];
    }
    return await client.listTools();
  }

  /**
   * Attach a tool to a Letta agent
   */
  async attachTool(agentId: AgentId, toolId: string): Promise<void> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }
    await client.attachTool(lettaAgentId, toolId);
  }

  /**
   * Detach a tool from a Letta agent
   */
  async detachTool(agentId: AgentId, toolId: string): Promise<void> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }
    await client.detachTool(lettaAgentId, toolId);
  }

  /**
   * Register a callback to be notified when a chat completes
   */
  registerOnChatComplete(agentId: AgentId, callback: ChatCompleteCallback): void {
    if (!this.onChatCompleteCallbacks.has(agentId)) {
      this.onChatCompleteCallbacks.set(agentId, []);
    }
    this.onChatCompleteCallbacks.get(agentId)!.push(callback);
  }

  /**
   * Unregister a chat completion callback
   */
  unregisterOnChatComplete(agentId: AgentId, callback: ChatCompleteCallback): void {
    const callbacks = this.onChatCompleteCallbacks.get(agentId);
    if (!callbacks) return;
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * Register a callback with full context (stimulus + response)
   */
  registerOnChatCompleteWithContext(agentId: AgentId, callback: ChatCompleteCallbackWithContext): void {
    if (!this.onChatCompleteWithContextCallbacks.has(agentId)) {
      this.onChatCompleteWithContextCallbacks.set(agentId, []);
    }
    this.onChatCompleteWithContextCallbacks.get(agentId)!.push(callback);
  }

  /**
   * Unregister a chat completion callback with context
   */
  unregisterOnChatCompleteWithContext(agentId: AgentId, callback: ChatCompleteCallbackWithContext): void {
    const callbacks = this.onChatCompleteWithContextCallbacks.get(agentId);
    if (!callbacks) return;
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * Manually notify chat completion callbacks (for streaming scenarios)
   * Call this after streaming completes to trigger soma/reflection processing
   */
  notifyChatComplete(
    agentId: AgentId,
    stimulus: string,
    response: string,
    options?: { role?: 'user' | 'system' }
  ): void {
    const context: ChatCompleteContext = {
      stimulus,
      response,
      fullResponse: { messages: [] }, // Streaming doesn't have full response
      role: options?.role ?? 'user',
      timestamp: new Date().toISOString(),
    };

    // Notify legacy listeners (no context)
    const callbacks = this.onChatCompleteCallbacks.get(agentId) ?? [];
    for (const callback of callbacks) {
      try {
        callback(agentId);
      } catch (error) {
        log.error('Error in chat complete callback', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Notify context-aware listeners (async, fire and forget)
    const contextCallbacks = this.onChatCompleteWithContextCallbacks.get(agentId) ?? [];
    for (const callback of contextCallbacks) {
      Promise.resolve(callback(agentId, context)).catch(error => {
        log.error('Error in chat complete callback with context', { error: error instanceof Error ? error.message : String(error) });
      });
    }
  }

  /**
   * Extract response text from a ChatResponse
   */
  private extractResponseText(response: ChatResponse): string {
    for (const msg of response.messages) {
      // Check for send_message tool call
      if (
        (msg as any).message_type === 'tool_call_message' &&
        (msg as any).tool_call?.name === 'send_message'
      ) {
        try {
          const args = JSON.parse((msg as any).tool_call.arguments || '{}');
          if (args.message) return args.message;
        } catch {
          // Continue
        }
      }
      // Check for assistant message
      if ((msg as any).message_type === 'assistant_message' && (msg as any).content) {
        return (msg as any).content;
      }
      // Fallback: direct content
      if ((msg as any).content && typeof (msg as any).content === 'string') {
        return (msg as any).content;
      }
    }
    return '';
  }

  /**
   * Extract stimulus text from multi-modal content
   */
  private extractStimulusText(message: LettaMessageContent): string {
    if (typeof message === 'string') {
      return message;
    }
    // Extract text from multi-modal content
    const textParts = message
      .filter(item => item.type === 'text' && item.text)
      .map(item => item.text!);
    return textParts.join(' ') || '[multi-modal content]';
  }

  /**
   * Send a message to the agent
   * @param message - Text string or multi-modal content array
   */
  async chat(agentId: AgentId, message: LettaMessageContent, options?: ChatOptions): Promise<ChatResponse> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }

    const response = await client.sendMessage(lettaAgentId, message, options);

    // Build context for callbacks
    const context: ChatCompleteContext = {
      stimulus: this.extractStimulusText(message),
      response: this.extractResponseText(response),
      fullResponse: response,
      role: options?.role ?? 'user',
      timestamp: new Date().toISOString(),
    };

    // Notify legacy listeners (no context)
    const callbacks = this.onChatCompleteCallbacks.get(agentId) ?? [];
    for (const callback of callbacks) {
      try {
        callback(agentId);
      } catch (error) {
        log.error('Error in chat complete callback', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Notify context-aware listeners (async, fire and forget)
    const contextCallbacks = this.onChatCompleteWithContextCallbacks.get(agentId) ?? [];
    for (const callback of contextCallbacks) {
      // Run async callbacks without blocking
      Promise.resolve(callback(agentId, context)).catch(error => {
        log.error('Error in chat complete callback with context', { error: error instanceof Error ? error.message : String(error) });
      });
    }

    return response;
  }

  /**
   * Get agent memory blocks
   */
  async getMemory(agentId: AgentId): Promise<Record<string, string>> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }
    return await client.getMemoryBlocks(lettaAgentId);
  }

  /**
   * Update a memory block
   */
  async updateMemory(agentId: AgentId, blockLabel: string, value: string): Promise<void> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }
    await client.updateMemoryBlock(lettaAgentId, blockLabel, value);
  }

  /**
   * Get all memory blocks with full details
   */
  async getMemoryBlocksDetailed(agentId: AgentId): Promise<MemoryBlockDetailed[]> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }
    return await client.getMemoryBlocksDetailed(lettaAgentId);
  }

  /**
   * Add a new memory block to the agent
   */
  async addMemoryBlock(agentId: AgentId, label: string, value: string, limit?: number): Promise<string> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }
    return await client.addMemoryBlockToAgent(lettaAgentId, label, value, limit);
  }

  /**
   * Remove a memory block from the agent
   */
  async removeMemoryBlock(agentId: AgentId, blockId: string): Promise<void> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }
    await client.detachBlockFromAgent(lettaAgentId, blockId);
  }

  /**
   * Get conversation messages
   */
  async getMessages(agentId: AgentId, limit: number = 50): Promise<any[]> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }
    return await client.getMessages(lettaAgentId, limit);
  }

  /**
   * Clear all messages for the agent
   */
  async clearMessages(agentId: AgentId): Promise<void> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }
    return await client.clearMessages(lettaAgentId);
  }

  // ===== Agent-Scoped Memory Block Methods =====

  /**
   * Create a memory block for storing context about another agent.
   * The block is created but NOT attached to any agent.
   * @returns The created block ID
   */
  async createAgentContextBlock(
    sourceAgentId: AgentId,
    targetAgentId: AgentId,
    content: string,
    limit: number = 5000
  ): Promise<string> {
    const lettaAgentId = this.getLettaAgentId(sourceAgentId);
    const client = this.getClientForAgent(sourceAgentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }

    const label = `agent_context_${targetAgentId}`;
    return await client.createBlock(label, content, limit);
  }

  /**
   * Attach an agent context block to an agent.
   * Idempotent - safe to call if already attached with same block.
   */
  async attachAgentContextBlock(
    sourceAgentId: AgentId,
    targetAgentId: AgentId,
    blockId: string
  ): Promise<void> {
    if (!this.context) {
      throw new Error('Letta manager not initialized');
    }

    const lettaAgentId = this.getLettaAgentId(sourceAgentId);
    const client = this.getClientForAgent(sourceAgentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }

    const state = this.context.getState<LettaState>(sourceAgentId, STATE_NAMESPACE);
    const currentState = state.get() || { initialized: true, letta_agent_id: lettaAgentId };
    const attachedBlocks = currentState.attached_agent_blocks || {};

    // Check if already attached with same block
    if (attachedBlocks[targetAgentId]?.block_id === blockId) {
      return; // Already attached, nothing to do
    }

    // Attach the block
    await client.attachBlockToAgent(lettaAgentId, blockId);

    // Update state
    const label = `agent_context_${targetAgentId}`;
    state.set({
      ...currentState,
      attached_agent_blocks: {
        ...attachedBlocks,
        [targetAgentId]: {
          block_id: blockId,
          label,
          attached_at: new Date().toISOString()
        }
      }
    });
  }

  /**
   * Detach an agent context block from an agent.
   * Idempotent - safe to call if not attached.
   */
  async detachAgentContextBlock(
    sourceAgentId: AgentId,
    targetAgentId: AgentId
  ): Promise<void> {
    if (!this.context) {
      throw new Error('Letta manager not initialized');
    }

    const lettaAgentId = this.getLettaAgentId(sourceAgentId);
    const client = this.getClientForAgent(sourceAgentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }

    const state = this.context.getState<LettaState>(sourceAgentId, STATE_NAMESPACE);
    const currentState = state.get();
    if (!currentState) return;

    const attachedBlocks = currentState.attached_agent_blocks || {};
    const blockInfo = attachedBlocks[targetAgentId];

    // Not attached, nothing to do
    if (!blockInfo) return;

    // Detach the block
    await client.detachBlockFromAgent(lettaAgentId, blockInfo.block_id);

    // Update state - remove the block
    const { [targetAgentId]: _, ...remainingBlocks } = attachedBlocks;
    state.set({
      ...currentState,
      attached_agent_blocks: remainingBlocks
    });
  }

  /**
   * Get all attached agent context blocks for an agent.
   */
  getAttachedAgentBlocks(agentId: AgentId): Record<string, AgentBlockInfo> {
    if (!this.context) return {};

    const state = this.context.getState<LettaState>(agentId, STATE_NAMESPACE);
    const currentState = state.get();

    return currentState?.attached_agent_blocks || {};
  }

  /**
   * Update the content of an attached agent context block.
   */
  async updateAgentContextBlock(
    sourceAgentId: AgentId,
    targetAgentId: AgentId,
    content: string
  ): Promise<void> {
    const lettaAgentId = this.getLettaAgentId(sourceAgentId);
    const client = this.getClientForAgent(sourceAgentId);
    if (!client || !lettaAgentId) {
      throw new Error('Letta agent not initialized');
    }

    // Verify block is attached
    const attachedBlocks = this.getAttachedAgentBlocks(sourceAgentId);
    if (!attachedBlocks[targetAgentId]) {
      throw new Error(`No agent context block attached for ${targetAgentId}`);
    }

    const label = `agent_context_${targetAgentId}`;
    await client.updateMemoryBlock(lettaAgentId, label, content);
  }

  /**
   * Convenience method: Create and attach an agent context block in one call.
   * @returns The created block ID
   */
  async addAgentContext(
    sourceAgentId: AgentId,
    targetAgentId: AgentId,
    content: string,
    limit: number = 5000
  ): Promise<string> {
    const blockId = await this.createAgentContextBlock(
      sourceAgentId,
      targetAgentId,
      content,
      limit
    );

    await this.attachAgentContextBlock(sourceAgentId, targetAgentId, blockId);

    return blockId;
  }

  /**
   * Check if an agent context block is attached for a target agent.
   */
  hasAgentContextBlock(sourceAgentId: AgentId, targetAgentId: AgentId): boolean {
    const attachedBlocks = this.getAttachedAgentBlocks(sourceAgentId);
    return !!attachedBlocks[targetAgentId];
  }

  /**
   * Get the block ID of an attached agent context block.
   * @returns The block ID, or undefined if not attached
   */
  getAgentContextBlockId(sourceAgentId: AgentId, targetAgentId: AgentId): string | undefined {
    const attachedBlocks = this.getAttachedAgentBlocks(sourceAgentId);
    return attachedBlocks[targetAgentId]?.block_id;
  }

  /**
   * Delete a Letta agent
   */
  async deleteAgent(agentId: AgentId): Promise<void> {
    const lettaAgentId = this.getLettaAgentId(agentId);
    const client = this.getClientForAgent(agentId);
    if (!client || !lettaAgentId) {
      log.debug(`No Letta agent found for ${agentId}, skipping deletion`);
      return;
    }

    try {
      await client.getRawClient().agents.delete(lettaAgentId);
      log.info(`Deleted Letta agent ${lettaAgentId} for ${agentId}`);
    } catch (error) {
      log.error(`Failed to delete agent ${lettaAgentId}`, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }

    // Cleanup local state
    await this.cleanupAgent(agentId);
  }

  /**
   * Cleanup agent-specific resources
   */
  async cleanupAgent(agentId: AgentId): Promise<void> {
    this.onChatCompleteCallbacks.delete(agentId);
    this.onChatCompleteWithContextCallbacks.delete(agentId);
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup(): Promise<void> {
    this.onChatCompleteCallbacks.clear();
    this.onChatCompleteWithContextCallbacks.clear();
  }
}

// Export singleton instance
export const lettaManager = new LettaManager();
