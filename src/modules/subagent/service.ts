/**
 * Sub-Agent Service (Singleton)
 *
 * Enables agents to spawn and manage sub-agents from Letta templates.
 * Supports shared memory blocks, bidirectional communication, and
 * configurable lifecycles (ephemeral vs persistent).
 */

import { randomUUID } from 'crypto';
import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import type { LettaManager } from '../../core/letta/index.js';
import type { LettaClientWrapper } from '../../core/letta/letta-client.js';
import type { LettaBackendType } from '../../core/letta/types.js';
import { createComponentLogger } from '../../core/logger.js';
import type {
  SubagentServiceState,
  SubagentInfo,
  SubagentModuleConfig,
  SpawnSubagentOptions,
  SpawnSubagentResult,
  MessageSubagentOptions,
  MessageSubagentResult,
  SubagentLifecycle,
  SubagentStatus,
} from './types.js';

const SERVICE_NAME = 'subagent';
const log = createComponentLogger('Subagent');

const DEFAULT_STATE: SubagentServiceState = {
  subagents: {},
};

const DEFAULT_CONFIG: SubagentModuleConfig = {
  max_subagents: 10,
  default_lifecycle: 'ephemeral',
  sync_timeout_seconds: 300,
  abandoned_timeout_hours: 24,
};

class SubagentService implements BaseService {
  private context?: ServiceContext;
  private agentConfigs: Map<AgentId, SubagentModuleConfig> = new Map();

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
    if (!this.context) {
      throw new Error('Subagent service not initialized');
    }

    // Store agent config
    const typedConfig = config as SubagentModuleConfig;
    this.agentConfigs.set(agentId, {
      max_subagents: typedConfig.max_subagents ?? DEFAULT_CONFIG.max_subagents,
      default_lifecycle: typedConfig.default_lifecycle ?? DEFAULT_CONFIG.default_lifecycle,
      sync_timeout_seconds: typedConfig.sync_timeout_seconds ?? DEFAULT_CONFIG.sync_timeout_seconds,
      abandoned_timeout_hours: typedConfig.abandoned_timeout_hours ?? DEFAULT_CONFIG.abandoned_timeout_hours,
    });

    // Get or create initial state and persist it
    // This ensures the database has a record so eager init works on restart
    const existingState = this.getAgentState(agentId);
    this.saveAgentState(agentId, existingState);

    // Cleanup stale sub-agents on init
    await this.cleanupAbandonedSubagents(agentId);

    const state = this.getAgentState(agentId);
    log.info('Initialized for agent', { agentId, subagentCount: Object.keys(state.subagents).length });
  }

  /**
   * Check if an agent can reconnect
   */
  canReconnect(_agentId: AgentId, _state: Record<string, unknown>): boolean {
    return true;
  }

  async cleanup(): Promise<void> {
    // State is auto-persisted
  }

  // ============================================
  // State Management
  // ============================================

  private getAgentState(agentId: AgentId): SubagentServiceState {
    if (!this.context) {
      return DEFAULT_STATE;
    }
    const state = this.context.getState<SubagentServiceState>(agentId, SERVICE_NAME);
    return state.get() || DEFAULT_STATE;
  }

  private saveAgentState(agentId: AgentId, newState: SubagentServiceState): void {
    if (!this.context) return;
    const state = this.context.getState<SubagentServiceState>(agentId, SERVICE_NAME);
    state.set(newState);
  }

  private getConfig(agentId: AgentId): SubagentModuleConfig {
    return this.agentConfigs.get(agentId) || DEFAULT_CONFIG;
  }

  // ============================================
  // Letta Access
  // ============================================

  private getLettaManager(): LettaManager {
    if (!this.context) {
      throw new Error('Subagent service not initialized');
    }
    const lettaManager = this.context.getLettaManager?.();
    if (!lettaManager) {
      throw new Error('LettaManager not available - subagent module requires Letta core');
    }
    return lettaManager;
  }

  private getWrapper(backend: LettaBackendType): LettaClientWrapper {
    const lettaManager = this.getLettaManager();
    const client = lettaManager.getClientForBackend(backend);
    if (!client) {
      throw new Error(`Letta backend '${backend}' not configured`);
    }
    return client;
  }

  private getParentBackend(agentId: AgentId): LettaBackendType {
    return this.getLettaManager().getAgentBackend(agentId);
  }

  private getParentLettaId(agentId: AgentId): string {
    const lettaManager = this.getLettaManager();
    const id = lettaManager.getLettaAgentId(agentId);
    if (!id) {
      throw new Error(`Agent ${agentId} has no Letta agent ID`);
    }
    return id;
  }

  // ============================================
  // Core Operations
  // ============================================

  /**
   * Spawn a sub-agent from a Letta template
   */
  async spawnSubagent(
    parentAgentId: AgentId,
    options: SpawnSubagentOptions
  ): Promise<SpawnSubagentResult> {
    const config = this.getConfig(parentAgentId);
    const state = this.getAgentState(parentAgentId);

    // Check max subagents limit
    const activeCount = Object.values(state.subagents).filter(s => s.status === 'active').length;
    if (config.max_subagents && activeCount >= config.max_subagents) {
      throw new Error(`Maximum sub-agents limit reached (${config.max_subagents})`);
    }

    const backend = this.getParentBackend(parentAgentId);
    const parentLettaId = this.getParentLettaId(parentAgentId);
    const wrapper = this.getWrapper(backend);
    const sdk = wrapper.sdk;

    // Generate trace ID to detect duplicate calls
    const traceId = randomUUID().substring(0, 8);
    log.info('Spawning sub-agent', {
      traceId,
      parentAgentId,
      template: options.template_version,
      task: options.task.substring(0, 100),
    });

    // Create sub-agent from template
    // Don't include task in memory_variables - we send it directly as a message
    // to avoid duplicate task appearing in template substitution AND message
    const memoryVariables: Record<string, string> = {
      parent_agent_id: parentLettaId,
      ...options.memory_variables,
    };

    let subAgentIds: string[];
    try {
      // Template version format: "project-slug/template-name:version"
      // If no project slug, prepend from environment
      // If no version specified, append :latest
      let templateVersion = options.template_version;

      // Add project slug if not present (no slash in the name)
      if (!templateVersion.includes('/')) {
        const projectSlug = process.env.LETTA_CLOUD_PROJECT_SLUG;
        if (projectSlug) {
          templateVersion = `${projectSlug}/${templateVersion}`;
          log.debug('Prepended project slug to template', { templateVersion });
        }
      }

      // Add :latest if no version specified
      if (!templateVersion.includes(':')) {
        templateVersion = `${templateVersion}:latest`;
        log.debug('Appended :latest to template version', { templateVersion });
      }

      log.info('Creating agent from template', { templateVersion, memoryVariables: Object.keys(memoryVariables) });

      // Use SDK to create agent from template
      // Pass initial_message_sequence: [] to suppress the template's default message sequence
      // This prevents the task from being sent twice (once by template, once by us)
      const result = await (sdk.templates as any).agents.create(templateVersion, {
        memory_variables: memoryVariables,
        initial_message_sequence: [],
      });

      log.info('Template response', { result: JSON.stringify(result).substring(0, 500) });

      // Handle various response formats from the SDK
      if (Array.isArray(result)) {
        // Response is an array of agents
        subAgentIds = result.map((a: any) => a.id || a.agent_id).filter(Boolean);
      } else if (result?.agent_ids) {
        subAgentIds = result.agent_ids;
      } else if (result?.agent_id) {
        subAgentIds = [result.agent_id];
      } else if (result?.id) {
        // Single agent object returned
        subAgentIds = [result.id];
      } else {
        log.warn('Unexpected template response format', { result });
        subAgentIds = [];
      }
    } catch (error: any) {
      // Extract more detailed error info
      const errorDetail = error.body?.detail || error.body?.message || error.message || String(error);
      log.error('Failed to create sub-agent from template', {
        error: errorDetail,
        template: options.template_version,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)).substring(0, 1000)
      });
      throw new Error(`Failed to create sub-agent: ${errorDetail}`);
    }

    if (!subAgentIds || subAgentIds.length === 0) {
      throw new Error('Template did not create any agents');
    }

    const subAgentLettaId = subAgentIds[0];
    log.debug('Created sub-agent', { subAgentLettaId });

    // Attach shared blocks from parent
    const sharedBlockIds: string[] = [];
    if (options.shared_blocks && options.shared_blocks.length > 0) {
      const parentBlocks = await wrapper.getMemoryBlocksDetailed(parentLettaId);

      for (const label of options.shared_blocks) {
        const parentBlock = parentBlocks.find(b => b.label === label);
        if (parentBlock) {
          try {
            await sdk.agents.blocks.attach(parentBlock.id, { agent_id: subAgentLettaId });
            sharedBlockIds.push(parentBlock.id);
            log.debug('Attached shared block', { label, blockId: parentBlock.id });
          } catch (error: any) {
            log.warn('Failed to attach shared block', { label, error: error.message });
          }
        } else {
          log.warn('Parent block not found for sharing', { label });
        }
      }
    }

    // Attach inter-agent messaging tool if not already present
    try {
      const toolsPage = await sdk.tools.list();
      // The SDK returns a page object - access the items array
      const toolItems = Array.isArray(toolsPage) ? toolsPage : (toolsPage as any).items ?? [];
      const messagingTool = toolItems.find(
        (t: any) => t.name === 'send_message_to_agent_async'
      );
      if (messagingTool) {
        await sdk.agents.tools.attach(messagingTool.id, { agent_id: subAgentLettaId });
        log.debug('Attached inter-agent messaging tool');
      }
    } catch (error: any) {
      log.warn('Could not attach messaging tool', { error: error.message });
    }

    // Generate Ampelos sub-agent ID and store info
    const subagentId = randomUUID();
    const lifecycle = options.lifecycle ?? config.default_lifecycle ?? 'ephemeral';
    const now = new Date().toISOString();

    const subagentInfo: SubagentInfo = {
      id: subagentId,
      template_version: options.template_version,
      letta_agent_id: subAgentLettaId,
      parent_letta_id: parentLettaId,
      backend,
      lifecycle,
      status: 'active',
      created_at: now,
      last_activity_at: now,
      task_description: options.task,
      shared_block_ids: sharedBlockIds,
    };

    // Save to state
    const newState = { ...state };
    newState.subagents = { ...state.subagents, [subagentId]: subagentInfo };
    this.saveAgentState(parentAgentId, newState);

    log.info('Sub-agent spawned', { subagentId, subAgentLettaId, lifecycle });

    // Build the task message with parent agent info
    const taskMessage = `${options.task}\n\n[Parent agent ID: ${parentLettaId} - use send_message_to_agent_and_wait_for_reply to communicate results]`;

    log.info('Sending task message to sub-agent', { traceId, subAgentLettaId, syncMode: !!options.wait_for_result });

    // If sync mode, send task and wait for response
    if (options.wait_for_result) {
      try {
        const response = await wrapper.sendMessage(
          subAgentLettaId,
          taskMessage
        );

        const result = this.extractResponseText(response);

        // For ephemeral, cleanup after getting result
        if (lifecycle === 'ephemeral') {
          await this.cleanupSubagent(parentAgentId, subagentId);
        } else {
          // Mark as completed
          subagentInfo.status = 'completed';
          subagentInfo.completed_at = new Date().toISOString();
          subagentInfo.result = result;
          this.saveAgentState(parentAgentId, newState);
        }

        return {
          subagent_id: subagentId,
          letta_agent_id: subAgentLettaId,
          status: lifecycle === 'ephemeral' ? 'completed' : subagentInfo.status,
          result,
        };
      } catch (error: any) {
        log.error('Sync spawn failed', { error: error.message });
        subagentInfo.status = 'failed';
        this.saveAgentState(parentAgentId, newState);
        throw error;
      }
    }

    // Async mode: send the task as the message to start the agent
    wrapper.sendMessage(
      subAgentLettaId,
      taskMessage
    ).then(() => {
      log.info('Task message sent (async)', { traceId, subAgentLettaId });
    }).catch(error => {
      log.error('Failed to send task to sub-agent', { traceId, error: error.message });
    });

    return {
      subagent_id: subagentId,
      letta_agent_id: subAgentLettaId,
      status: 'active',
    };
  }

  /**
   * List sub-agents for a parent agent
   */
  listSubagents(
    parentAgentId: AgentId,
    statusFilter?: SubagentStatus | 'all'
  ): SubagentInfo[] {
    const state = this.getAgentState(parentAgentId);
    let subagents = Object.values(state.subagents);

    if (statusFilter && statusFilter !== 'all') {
      subagents = subagents.filter(s => s.status === statusFilter);
    }

    return subagents.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  /**
   * Send a message to a sub-agent
   */
  async messageSubagent(
    parentAgentId: AgentId,
    options: MessageSubagentOptions
  ): Promise<MessageSubagentResult> {
    const state = this.getAgentState(parentAgentId);
    const subagent = state.subagents[options.subagent_id];

    if (!subagent) {
      throw new Error(`Sub-agent ${options.subagent_id} not found`);
    }

    if (subagent.status !== 'active') {
      throw new Error(`Sub-agent is not active (status: ${subagent.status})`);
    }

    const wrapper = this.getWrapper(subagent.backend);

    // Update last activity
    subagent.last_activity_at = new Date().toISOString();
    this.saveAgentState(parentAgentId, state);

    try {
      const response = await wrapper.sendMessage(subagent.letta_agent_id, options.message);

      if (options.wait_for_reply) {
        const responseText = this.extractResponseText(response);
        return { delivered: true, response: responseText };
      }

      return { delivered: true };
    } catch (error: any) {
      log.error('Failed to message sub-agent', { error: error.message });
      return { delivered: false };
    }
  }

  /**
   * Cleanup a sub-agent (detach shared blocks and delete)
   */
  async cleanupSubagent(parentAgentId: AgentId, subagentId: string): Promise<void> {
    const state = this.getAgentState(parentAgentId);
    const subagent = state.subagents[subagentId];

    if (!subagent) {
      log.warn('Sub-agent not found for cleanup', { subagentId });
      return;
    }

    const wrapper = this.getWrapper(subagent.backend);
    const sdk = wrapper.sdk;

    log.info('Cleaning up sub-agent', { subagentId, lettaAgentId: subagent.letta_agent_id });

    // Detach shared blocks
    for (const blockId of subagent.shared_block_ids) {
      try {
        await sdk.agents.blocks.detach(blockId, { agent_id: subagent.letta_agent_id });
        log.debug('Detached shared block', { blockId });
      } catch (error: any) {
        log.warn('Failed to detach block', { blockId, error: error.message });
      }
    }

    // Delete the Letta agent
    try {
      await sdk.agents.delete(subagent.letta_agent_id);
      log.debug('Deleted Letta agent', { lettaAgentId: subagent.letta_agent_id });
    } catch (error: any) {
      log.warn('Failed to delete Letta agent', { error: error.message });
    }

    // Remove from state
    const newSubagents = { ...state.subagents };
    delete newSubagents[subagentId];
    this.saveAgentState(parentAgentId, { ...state, subagents: newSubagents });

    log.info('Sub-agent cleaned up', { subagentId });
  }

  /**
   * Mark a sub-agent as completed
   */
  async markCompleted(parentAgentId: AgentId, subagentId: string, result?: string): Promise<void> {
    const state = this.getAgentState(parentAgentId);
    const subagent = state.subagents[subagentId];

    if (!subagent) {
      throw new Error(`Sub-agent ${subagentId} not found`);
    }

    subagent.status = 'completed';
    subagent.completed_at = new Date().toISOString();
    if (result) {
      subagent.result = result;
    }

    // For ephemeral sub-agents, cleanup immediately
    if (subagent.lifecycle === 'ephemeral') {
      await this.cleanupSubagent(parentAgentId, subagentId);
    } else {
      this.saveAgentState(parentAgentId, state);
    }
  }

  /**
   * Cleanup abandoned sub-agents (stale detection)
   */
  private async cleanupAbandonedSubagents(parentAgentId: AgentId): Promise<void> {
    const config = this.getConfig(parentAgentId);
    const state = this.getAgentState(parentAgentId);
    const now = Date.now();
    const timeoutMs = (config.abandoned_timeout_hours ?? 24) * 60 * 60 * 1000;

    for (const subagent of Object.values(state.subagents)) {
      if (subagent.status !== 'active') continue;

      const lastActivity = new Date(subagent.last_activity_at).getTime();
      if (now - lastActivity > timeoutMs) {
        log.info('Cleaning up abandoned sub-agent', {
          subagentId: subagent.id,
          lastActivityHoursAgo: Math.round((now - lastActivity) / (1000 * 60 * 60)),
        });
        subagent.status = 'abandoned';
        await this.cleanupSubagent(parentAgentId, subagent.id);
      }
    }
  }

  // ============================================
  // Helpers
  // ============================================

  private extractResponseText(response: { messages: any[] }): string {
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
    return '[No response]';
  }
}

export default SubagentService;
