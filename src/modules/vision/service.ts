/**
 * Vision Service (Singleton)
 *
 * Provides image description capabilities via a shared Letta vision agent.
 * This is a global singleton - the vision agent is shared across all Ampelos agents.
 *
 * When an image needs to be described:
 * 1. Copy the calling agent's memory blocks to the vision agent for context
 * 2. Send the image to the vision agent
 * 3. Return the description
 */

import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import type { LettaClientWrapper, ChatResponse } from '../../core/letta/letta-client.js';
import type { LettaManager } from '../../core/letta/index.js';
import type { LettaBackendType } from '../../core/letta/types.js';
import type { VisionConfig } from './types.js';
import { createComponentLogger } from '../../core/logger.js';

const SERVICE_NAME = 'vision';
const log = createComponentLogger('Vision');

const VISION_SYSTEM_PROMPT = `You are a vision description module. Your role is to describe images accurately and objectively.

When you receive an image:
1. Describe what you see in detail - objects, people, text, colors, composition
2. Note any relevant context from the memory blocks provided
3. Write in third person, factual style
4. Do NOT respond conversationally - output only the description
5. Do NOT use phrases like "I see" or "This image shows"
6. Be concise but thorough

Example output format:
"A red sports car parked on a city street. The vehicle appears to be a Ferrari, with sleek curves and visible logo on the hood. Background shows urban buildings and pedestrians."`;

interface VisionState {
  /** @deprecated Use visionAgentIds instead */
  visionAgentId?: string;
  /** Vision agent IDs per backend */
  visionAgentIds?: {
    'self-hosted'?: string;
    'cloud'?: string;
  };
}

class VisionService implements BaseService {
  private context?: ServiceContext;
  private config: VisionConfig = {};

  /**
   * Initialize the service (global, once at startup)
   */
  async init(context: ServiceContext): Promise<void> {
    this.context = context;
    log.info('Service initialized (global singleton)');
  }

  /**
   * Initialize for a specific agent
   */
  async initAgent(agentId: AgentId, config: Record<string, unknown>): Promise<void> {
    this.config = config as VisionConfig;

    const state = this.getGlobalState();
    log.info('Initialized for agent', { agentId, visionAgentId: state.visionAgentId });
  }

  /**
   * Check if an agent can reconnect
   */
  canReconnect(_agentId: AgentId, _state: Record<string, unknown>): boolean {
    return true; // No per-agent state needed
  }

  async cleanup(): Promise<void> {
    // State is auto-persisted
  }

  /**
   * Get global state (shared vision agent ID)
   */
  private getGlobalState(): VisionState {
    if (!this.context) {
      return {};
    }
    const state = this.context.getGlobalState<VisionState>(SERVICE_NAME);
    return state.get() || {};
  }

  /**
   * Save global state
   */
  private saveGlobalState(newState: VisionState): void {
    if (!this.context) return;
    const state = this.context.getGlobalState<VisionState>(SERVICE_NAME);
    state.set(newState);
  }

  /**
   * Get LettaManager
   */
  private getLettaManager(): LettaManager {
    if (!this.context) {
      throw new Error('Vision service not initialized');
    }
    const lettaManager = this.context.getLettaManager?.();
    if (!lettaManager) {
      throw new Error('LettaManager not available - vision module requires Letta core');
    }
    return lettaManager;
  }

  /**
   * Get the Letta client wrapper for a specific backend
   */
  private getWrapper(backend: LettaBackendType): LettaClientWrapper {
    const lettaManager = this.getLettaManager();
    const client = lettaManager.getClientForBackend(backend);
    if (!client) {
      throw new Error(`Letta backend '${backend}' not configured`);
    }
    return client;
  }

  /**
   * Get the calling agent's backend type
   */
  private getCallerBackend(agentId: AgentId): LettaBackendType {
    return this.getLettaManager().getAgentBackend(agentId);
  }

  /**
   * Get the calling agent's Letta agent ID
   */
  private getCallerLettaAgentId(agentId: AgentId): string {
    const lettaManager = this.getLettaManager();
    const id = lettaManager.getLettaAgentId(agentId);
    if (!id) {
      throw new Error(`Agent ${agentId} has no Letta agent ID`);
    }
    return id;
  }

  /**
   * Get the vision agent ID for a specific backend, creating if needed
   */
  private async getVisionAgentIdForBackend(backend: LettaBackendType): Promise<string> {
    const state = this.getGlobalState();

    // Check for existing vision agent on this backend
    let visionAgentId = state.visionAgentIds?.[backend];

    // Migration: check legacy visionAgentId (assume it was self-hosted)
    if (!visionAgentId && backend === 'self-hosted' && state.visionAgentId) {
      visionAgentId = state.visionAgentId;
      // Migrate to new structure
      this.saveGlobalState({
        ...state,
        visionAgentIds: {
          ...state.visionAgentIds,
          'self-hosted': visionAgentId
        }
      });
    }

    if (!visionAgentId) {
      await this.createVisionAgent(backend);
      visionAgentId = this.getGlobalState().visionAgentIds?.[backend];
    }

    if (!visionAgentId) {
      throw new Error(`Failed to create or retrieve vision agent for ${backend} backend`);
    }

    return visionAgentId;
  }

  /**
   * Describe an image using the vision agent
   *
   * @param agentId - The agent requesting the description (for context)
   * @param imageUrl - URL of the image to describe
   * @param prompt - Optional custom prompt (defaults to "Describe this image in detail.")
   * @returns The image description
   */
  async describeImage(agentId: AgentId, imageUrl: string, prompt?: string): Promise<string> {
    // Use the same backend as the calling agent
    const backend = this.getCallerBackend(agentId);
    const wrapper = this.getWrapper(backend);

    // Ensure vision agent exists for this backend
    const visionAgentId = await this.getVisionAgentIdForBackend(backend);

    // Get calling agent's memory blocks for context
    const callerLettaId = this.getCallerLettaAgentId(agentId);
    const callerBlocks = await wrapper.getMemoryBlocks(callerLettaId);

    // Format caller's context for the vision agent
    // Truncate to fit within the context block limit (10000 chars)
    const CONTEXT_BLOCK_LIMIT = 9500; // Leave some buffer
    let contextContent = Object.entries(callerBlocks)
      .map(([label, value]) => `[${label}]\n${value}`)
      .join('\n\n');

    if (contextContent.length > CONTEXT_BLOCK_LIMIT) {
      log.debug('Truncating context', { from: contextContent.length, to: CONTEXT_BLOCK_LIMIT });
      contextContent = contextContent.substring(0, CONTEXT_BLOCK_LIMIT) + '\n\n[...truncated]';
    }

    // Update vision agent's context block with caller's memory
    await wrapper.updateMemoryBlock(visionAgentId, 'context', contextContent);

    log.info('Describing image', { agentId, imageUrl: imageUrl.substring(0, 80) });

    // Send image to vision agent
    const response = await wrapper.sendMessage(visionAgentId, [
      { type: 'text', text: prompt || 'Describe this image in detail.' },
      { type: 'image', source: { type: 'url', url: imageUrl } }
    ]);

    // Extract description from response
    const description = this.extractDescription(response);
    log.debug('Got description', { length: description.length });

    // Clear message history to keep the vision agent stateless
    await wrapper.clearMessages(visionAgentId);

    return description;
  }

  /**
   * Create the vision agent for a specific backend if it doesn't exist
   */
  private async createVisionAgent(backend: LettaBackendType): Promise<void> {
    const wrapper = this.getWrapper(backend);

    // Check if vision agent already exists on this backend
    const agents = await wrapper.listAgents();
    const existing = agents.find(a => a.name === 'ampelos-vision-agent');
    if (existing) {
      const state = this.getGlobalState();
      this.saveGlobalState({
        ...state,
        visionAgentIds: {
          ...state.visionAgentIds,
          [backend]: existing.id
        }
      });
      log.info('Found existing vision agent', { backend, visionAgentId: existing.id });
      return;
    }

    // Create new vision agent
    log.info('Creating vision agent', { backend, model: this.config.model || 'anthropic/claude-sonnet-4-20250514' });

    const visionAgentId = await wrapper.createAgent({
      name: 'ampelos-vision-agent',
      model: this.config.model || 'anthropic/claude-sonnet-4-20250514',
      modelEndpointType: 'openai',
      contextWindow: 200000,
      embedding: 'text-embedding-ada-002',
      embeddingEndpointType: 'openai',
      embeddingDim: 1536,
      memoryBlocks: [
        { label: 'system', value: VISION_SYSTEM_PROMPT, limit: 2000 },
        { label: 'context', value: '', limit: 10000 }
      ]
    });

    const state = this.getGlobalState();
    this.saveGlobalState({
      ...state,
      visionAgentIds: {
        ...state.visionAgentIds,
        [backend]: visionAgentId
      }
    });
    log.info('Created vision agent', { backend, visionAgentId });
  }

  /**
   * Extract the description text from a Letta response
   */
  private extractDescription(response: ChatResponse): string {
    // Debug: log full response structure
    log.debug('Response messages', { messages: response.messages });

    // Find assistant message with actual text content
    for (const msg of response.messages) {
      // Check for send_message tool call (how Letta responds)
      if (
        (msg as any).message_type === 'tool_call_message' &&
        (msg as any).tool_call?.name === 'send_message'
      ) {
        try {
          const args = JSON.parse((msg as any).tool_call.arguments || '{}');
          if (args.message) return args.message;
        } catch {
          // Continue to next message
        }
      }
      // Fallback: check for direct content
      if ((msg as any).content && typeof (msg as any).content === 'string') {
        return (msg as any).content;
      }
    }
    log.warn('Could not extract description from response');
    return '[No description available]';
  }
}

export default VisionService;
