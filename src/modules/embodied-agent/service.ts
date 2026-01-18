/**
 * Embodied Agent Service (Singleton)
 *
 * Orchestrates embodied agent architecture:
 * - Soma agent: Processes involuntary responses asynchronously
 * - Body daemon: Manages state decay and autonomy prompts
 * - Reflection agent: Periodic self-reflection (via scheduled-messages pattern)
 *
 * Creates agent groups in the database to track primary + sub-agents.
 */

import { randomUUID } from 'crypto';
import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import type { LettaManager } from '../../core/letta/index.js';
import { getAgentTemplateManager } from '../../core/letta/index.js';
import type { Database } from '../../core/database.js';
import { createComponentLogger } from '../../core/logger.js';
import type { ChatCompleteContext as LettaChatContext } from '../../core/letta/types.js';
import type {
  EmbodiedAgentConfig,
  EmbodiedAgentState,
} from './types.js';

const SERVICE_NAME = 'embodied-agent';
const log = createComponentLogger('EmbodiedAgent');

const DEFAULT_STATE: EmbodiedAgentState = {
  group_id: '',
  primary_agent_id: '',
  body_daemon_active: false,
  initialized: false,
};

const DEFAULT_CONFIG: EmbodiedAgentConfig = {
  soma: {
    enabled: true,
    template: 'soma-agent',
    shared_blocks: ['body_and_inventory', 'somatic_patterns'],
  },
  reflection: {
    enabled: true,
    template: 'reflection-agent',
    interval_minutes: 60,
    shared_blocks: ['persona', 'somatic_patterns', 'awareness'],
  },
  body_daemon: { enabled: false, tick_interval_seconds: 300, idle_threshold_seconds: 3600 },
};

class EmbodiedAgentService implements BaseService {
  private context?: ServiceContext;
  private agentConfigs: Map<AgentId, EmbodiedAgentConfig> = new Map();
  private daemonTimers: Map<AgentId, NodeJS.Timeout> = new Map();
  private reflectionTimers: Map<AgentId, NodeJS.Timeout> = new Map();

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
      throw new Error('EmbodiedAgent service not initialized');
    }

    const typedConfig = this.parseConfig(config);
    this.agentConfigs.set(agentId, typedConfig);

    // Check if already initialized (reconnect scenario)
    const existingState = this.getAgentState(agentId);
    if (existingState.initialized) {
      log.info('Reconnecting to existing embodied agent', {
        agentId,
        groupId: existingState.group_id,
      });

      // Restart body daemon if enabled
      if (typedConfig.body_daemon?.enabled && existingState.body_daemon_active) {
        this.startBodyDaemon(agentId, typedConfig);
      }

      // Restart reflection timer if reflection agent exists
      if (typedConfig.reflection?.enabled && existingState.reflection_letta_id) {
        this.startReflectionTimer(agentId, typedConfig);
      }

      // Re-register chat callback
      this.registerChatCallback(agentId);

      return;
    }

    // Fresh initialization - create agent group and sub-agents
    await this.initializeEmbodiedAgent(agentId, typedConfig);
  }

  /**
   * Check if an agent can reconnect
   */
  canReconnect(_agentId: AgentId, state: Record<string, unknown>): boolean {
    const typedState = state as unknown as EmbodiedAgentState;
    return typedState?.initialized && !!typedState?.group_id;
  }

  /**
   * Cleanup agent resources
   */
  async cleanupAgent(agentId: AgentId): Promise<void> {
    // Stop body daemon
    const daemonTimer = this.daemonTimers.get(agentId);
    if (daemonTimer) {
      clearInterval(daemonTimer);
      this.daemonTimers.delete(agentId);
    }

    // Stop reflection timer
    const reflectionTimer = this.reflectionTimers.get(agentId);
    if (reflectionTimer) {
      clearInterval(reflectionTimer);
      this.reflectionTimers.delete(agentId);
    }

    // Note: We don't delete the agent group or sub-agents here
    // They persist for reconnection. Use explicit delete if needed.

    log.info('Agent resources cleaned up', { agentId });
  }

  async cleanup(): Promise<void> {
    // Stop all daemon timers
    for (const [agentId, timer] of this.daemonTimers) {
      clearInterval(timer);
      log.debug('Stopped daemon timer', { agentId });
    }
    this.daemonTimers.clear();

    // Stop all reflection timers
    for (const [agentId, timer] of this.reflectionTimers) {
      clearInterval(timer);
      log.debug('Stopped reflection timer', { agentId });
    }
    this.reflectionTimers.clear();
  }

  // ============================================
  // Core Initialization
  // ============================================

  private async initializeEmbodiedAgent(agentId: AgentId, config: EmbodiedAgentConfig): Promise<void> {
    const db = this.getDatabase();
    const lettaManager = this.getLettaManager();
    const agentMetadata = this.context?.getAgentMetadata?.(agentId);

    // Create agent group
    const groupId = `embodied-${agentId}-${randomUUID().substring(0, 8)}`;

    db.createAgentGroup({
      id: groupId,
      name: `Embodied: ${agentId}`,
      group_type: 'embodied',
    });

    // Register primary agent in group (visible)
    const lettaAgentId = lettaManager.getLettaAgentId(agentId);
    db.addGroupMember({
      group_id: groupId,
      agent_id: agentId,
      letta_agent_id: lettaAgentId ?? undefined,
      role: 'primary',
      visible: true,
    });

    // Initialize state
    const state: EmbodiedAgentState = {
      group_id: groupId,
      primary_agent_id: agentId,
      body_daemon_active: false,
      initialized: true,
    };

    // Create soma agent if configured
    if (config.soma?.enabled && config.soma.template) {
      try {
        const somaResult = await this.createSubAgent(agentId, config, 'soma');
        state.soma_agent_id = somaResult.ampelosId;
        state.soma_letta_id = somaResult.lettaId;

        // Create stub agent entry (required for foreign key)
        db.createAgent({
          id: somaResult.ampelosId,
          name: `${agentMetadata?.agent_name || agentId}-soma`,
          enabled: false, // Subagents are not independently enabled
        });

        // Register in group (hidden)
        db.addGroupMember({
          group_id: groupId,
          agent_id: somaResult.ampelosId,
          letta_agent_id: somaResult.lettaId,
          role: 'soma',
          template_version: config.soma.template,
          visible: false,
        });

        log.info('Soma agent created', { lettaId: somaResult.lettaId });
      } catch (error: any) {
        log.error('Failed to create soma agent', { error: error.message });
      }
    }

    // Create reflection agent if configured
    if (config.reflection?.enabled && config.reflection.template) {
      try {
        const reflectionResult = await this.createSubAgent(agentId, config, 'reflection');
        state.reflection_agent_id = reflectionResult.ampelosId;
        state.reflection_letta_id = reflectionResult.lettaId;

        // Create stub agent entry (required for foreign key)
        db.createAgent({
          id: reflectionResult.ampelosId,
          name: `${agentMetadata?.agent_name || agentId}-reflection`,
          enabled: false, // Subagents are not independently enabled
        });

        // Register in group (hidden)
        db.addGroupMember({
          group_id: groupId,
          agent_id: reflectionResult.ampelosId,
          letta_agent_id: reflectionResult.lettaId,
          role: 'reflection',
          template_version: config.reflection.template,
          visible: false,
        });

        log.info('Reflection agent created', { lettaId: reflectionResult.lettaId });

        // Start reflection timer
        this.startReflectionTimer(agentId, config);
      } catch (error: any) {
        log.error('Failed to create reflection agent', { error: error.message });
      }
    }

    // Start body daemon if enabled
    if (config.body_daemon?.enabled) {
      this.startBodyDaemon(agentId, config);
      state.body_daemon_active = true;
    }

    // Register chat callback to trigger soma processing
    this.registerChatCallback(agentId);

    // Save state
    this.saveAgentState(agentId, state);

    log.info('Embodied agent initialized', {
      agentId,
      groupId,
      hasSoma: !!state.soma_letta_id,
      hasReflection: !!state.reflection_letta_id,
      daemonActive: state.body_daemon_active,
    });
  }

  // ============================================
  // Sub-Agent Creation
  // ============================================

  private async createSubAgent(
    primaryAgentId: AgentId,
    config: EmbodiedAgentConfig,
    role: 'soma' | 'reflection'
  ): Promise<{ ampelosId: string; lettaId: string }> {
    const lettaManager = this.getLettaManager();
    const backend = lettaManager.getAgentBackend(primaryAgentId);
    const client = lettaManager.getClientForBackend(backend);

    if (!client) {
      throw new Error(`Letta backend '${backend}' not configured`);
    }

    const roleConfig = role === 'soma' ? config.soma : config.reflection;

    if (!roleConfig?.template) {
      throw new Error(`No template configured for ${role} agent`);
    }

    // Get primary agent's name for template variables
    const agentMetadata = this.context?.getAgentMetadata?.(primaryAgentId);
    const primaryName = agentMetadata?.agent_name || primaryAgentId;

    // Prepare template variables
    const variables: Record<string, string> = {
      primary_agent_id: primaryAgentId,
      primary_name: primaryName,
      ...roleConfig.memory_variables,
    };

    // Get the local template manager
    const templateManager = getAgentTemplateManager();
    await templateManager.initialize();

    // Check if template exists locally
    const templateName = roleConfig.template;
    const template = templateManager.getTemplate(templateName);

    if (!template) {
      throw new Error(
        `Template "${templateName}" not found. Available templates: ${templateManager.listTemplates().join(', ') || 'none'}`
      );
    }

    log.info('Creating sub-agent from local template', { role, template: templateName });

    // Get shared block IDs from primary agent (role-specific)
    const sharedBlockIds: string[] = [];
    const primaryLettaId = lettaManager.getLettaAgentId(primaryAgentId);
    const blocksToShare = roleConfig.shared_blocks || [];

    if (primaryLettaId && blocksToShare.length > 0) {
      const blocks = await client.getMemoryBlocksDetailed(primaryLettaId);
      log.debug('Primary agent blocks', { blocks: blocks.map(b => b.label) });

      for (const label of blocksToShare) {
        const block = blocks.find(b => b.label === label);
        if (block) {
          sharedBlockIds.push(block.id);
          log.debug('Will attach shared block', { role, label, blockId: block.id });
        } else {
          log.warn('Shared block not found on primary', { role, label });
        }
      }
    }

    // Get tool IDs from primary agent that match template requirements
    const toolIdsToAttach: string[] = [];
    if (primaryLettaId && template.tools && template.tools.length > 0) {
      try {
        const primaryTools = await client.listAgentTools(primaryLettaId);
        log.debug('Primary agent tools', { tools: primaryTools.map(t => t.name) });

        for (const toolName of template.tools) {
          const matchingTool = primaryTools.find(t => t.name === toolName);
          if (matchingTool) {
            toolIdsToAttach.push(matchingTool.id);
            log.debug('Will attach tool from primary', { role, toolName, toolId: matchingTool.id });
          } else {
            log.warn('Required tool not found on primary agent', { role, toolName });
          }
        }
      } catch (error: any) {
        log.warn('Failed to get primary agent tools', { error: error.message });
      }
    }

    // Instantiate from local template
    const result = await templateManager.instantiate(templateName, client, {
      variables,
      llm: roleConfig.model,  // Override template's default model if specified
      attachBlocks: sharedBlockIds,
      attachToolIds: toolIdsToAttach,
      skipInitialMessages: true,
    });

    // Generate Ampelos ID for the sub-agent
    const ampelosId = `${role}-${primaryAgentId}-${randomUUID().substring(0, 8)}`;

    log.info('Sub-agent created', {
      role,
      ampelosId,
      lettaId: result.lettaAgentId,
      template: templateName,
    });

    return { ampelosId, lettaId: result.lettaAgentId };
  }

  // ============================================
  // Chat Callback (Soma Processing)
  // ============================================

  private registerChatCallback(agentId: AgentId): void {
    const lettaManager = this.getLettaManager();

    // Register callback for when primary agent responds (with full context)
    lettaManager.registerOnChatCompleteWithContext(agentId, async (_agentId, context) => {
      await this.processSomaResponse(agentId, context);
    });

    log.debug('Registered chat callback with context', { agentId });
  }

  /**
   * Process soma response after primary chat completes
   * This runs asynchronously - the user gets the response immediately
   */
  private async processSomaResponse(agentId: AgentId, context: LettaChatContext): Promise<void> {
    const state = this.getAgentState(agentId);
    const config = this.agentConfigs.get(agentId);

    if (!state.soma_letta_id || !config?.soma?.enabled) {
      return;
    }

    // Update last activity
    state.last_activity_at = context.timestamp;
    this.saveAgentState(agentId, state);

    try {
      const lettaManager = this.getLettaManager();
      const backend = lettaManager.getAgentBackend(agentId);
      const client = lettaManager.getClientForBackend(backend);

      if (!client) {
        log.warn('No Letta client for soma processing', { agentId });
        return;
      }

      // Send the interaction context to soma agent for processing
      // The soma agent has access to manage_body tool and shared memory blocks
      const somaPrompt = `Process this interaction as the autonomic nervous system:

Human said: "${context.stimulus}"

Agent responded: "${context.response}"

Your task:
1. BODY STATES: If this interaction triggers involuntary physical responses (racing heart, tension, warmth, etc.), use the manage_body tool to update the body state.

2. SOMATIC PATTERNS: If you notice a recurring physical response pattern worth remembering (e.g., "conversations about X always cause tension"), use the memory tool to update the somatic_patterns block.

Only act if there's something meaningful to update. Not every interaction requires changes.`;

      log.debug('Sending soma prompt', { agentId, somaLettaId: state.soma_letta_id });

      // Fire and forget - don't wait for response
      client.sendMessage(state.soma_letta_id, somaPrompt).catch((error: any) => {
        log.warn('Soma processing failed', { agentId, error: error.message });
      });
    } catch (error: any) {
      log.warn('Error in soma processing', { agentId, error: error.message });
    }
  }

  // ============================================
  // Body Daemon
  // ============================================

  private startBodyDaemon(agentId: AgentId, config: EmbodiedAgentConfig): void {
    const intervalMs = (config.body_daemon?.tick_interval_seconds ?? 300) * 1000;

    // Clear existing timer if any
    const existingTimer = this.daemonTimers.get(agentId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    let tickNumber = 0;

    const timer = setInterval(async () => {
      tickNumber++;
      await this.onBodyDaemonTick(agentId, tickNumber, config);
    }, intervalMs);

    this.daemonTimers.set(agentId, timer);
    log.info('Body daemon started', { agentId, intervalMs });
  }

  private async onBodyDaemonTick(agentId: AgentId, tickNumber: number, config: EmbodiedAgentConfig): Promise<void> {
    const state = this.getAgentState(agentId);

    // Calculate idle duration
    const lastActivity = state.last_activity_at ? new Date(state.last_activity_at).getTime() : 0;
    const now = Date.now();
    const idleSeconds = lastActivity ? (now - lastActivity) / 1000 : Infinity;

    log.debug('Body daemon tick', { agentId, tickNumber, idleSeconds });

    // Check if idle threshold exceeded
    const idleThreshold = config.body_daemon?.idle_threshold_seconds ?? 3600;

    if (idleSeconds > idleThreshold) {
      // Agent is idle - could trigger autonomy prompts
      log.debug('Agent idle, could trigger autonomy', { agentId, idleSeconds });
      // TODO: Implement autonomy prompts
    }

    // Decay body states
    // This is generic - specific decay rules would be configured per-agent
    await this.processStateDecay(agentId);
  }

  private async processStateDecay(agentId: AgentId): Promise<void> {
    // Get body_and_inventory service to clear states
    // This is a simple implementation - more sophisticated decay
    // could be based on configurable rules
    try {
      const bodyService = this.context?.getService?.('body_and_inventory');
      if (bodyService && typeof (bodyService as any).clearExpiredStates === 'function') {
        await (bodyService as any).clearExpiredStates(agentId);
      }
    } catch (error: any) {
      log.debug('State decay check failed', { agentId, error: error.message });
    }
  }

  // ============================================
  // Reflection Timer
  // ============================================

  private startReflectionTimer(agentId: AgentId, config: EmbodiedAgentConfig): void {
    if (!config.reflection?.enabled) return;

    const intervalMs = (config.reflection.interval_minutes ?? 60) * 60 * 1000;

    // Clear existing timer if any
    const existingTimer = this.reflectionTimers.get(agentId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    // Run reflection on interval
    const timer = setInterval(async () => {
      log.debug('Reflection timer triggered', { agentId });
      await this.triggerReflection(agentId);
    }, intervalMs);

    this.reflectionTimers.set(agentId, timer);
    log.info('Reflection timer started', {
      agentId,
      intervalMinutes: config.reflection.interval_minutes ?? 60,
    });
  }

  // ============================================
  // State Management
  // ============================================

  private getAgentState(agentId: AgentId): EmbodiedAgentState {
    if (!this.context) {
      return { ...DEFAULT_STATE };
    }
    const state = this.context.getState<EmbodiedAgentState>(agentId, SERVICE_NAME);
    return state.get() || { ...DEFAULT_STATE };
  }

  private saveAgentState(agentId: AgentId, newState: EmbodiedAgentState): void {
    if (!this.context) return;
    const state = this.context.getState<EmbodiedAgentState>(agentId, SERVICE_NAME);
    state.set(newState);
  }

  private parseConfig(config: Record<string, unknown>): EmbodiedAgentConfig {
    return {
      soma: {
        enabled: (config.soma as any)?.enabled ?? DEFAULT_CONFIG.soma?.enabled,
        template: (config.soma as any)?.template ?? DEFAULT_CONFIG.soma?.template ?? '',
        memory_variables: (config.soma as any)?.memory_variables,
        shared_blocks: (config.soma as any)?.shared_blocks ?? DEFAULT_CONFIG.soma?.shared_blocks,
      },
      reflection: {
        enabled: (config.reflection as any)?.enabled ?? DEFAULT_CONFIG.reflection?.enabled,
        template: (config.reflection as any)?.template ?? DEFAULT_CONFIG.reflection?.template ?? '',
        memory_variables: (config.reflection as any)?.memory_variables,
        interval_minutes: (config.reflection as any)?.interval_minutes ?? DEFAULT_CONFIG.reflection?.interval_minutes ?? 60,
        shared_blocks: (config.reflection as any)?.shared_blocks ?? DEFAULT_CONFIG.reflection?.shared_blocks,
      },
      body_daemon: {
        enabled: (config.body_daemon as any)?.enabled ?? DEFAULT_CONFIG.body_daemon?.enabled ?? true,
        tick_interval_seconds: (config.body_daemon as any)?.tick_interval_seconds ?? DEFAULT_CONFIG.body_daemon?.tick_interval_seconds ?? 300,
        idle_threshold_seconds: (config.body_daemon as any)?.idle_threshold_seconds ?? DEFAULT_CONFIG.body_daemon?.idle_threshold_seconds ?? 3600,
      },
    };
  }

  // ============================================
  // Core Access
  // ============================================

  private getLettaManager(): LettaManager {
    if (!this.context) {
      throw new Error('EmbodiedAgent service not initialized');
    }
    const lettaManager = this.context.getLettaManager?.();
    if (!lettaManager) {
      throw new Error('LettaManager not available - embodied-agent module requires Letta core');
    }
    return lettaManager;
  }

  private getDatabase(): Database {
    if (!this.context) {
      throw new Error('EmbodiedAgent service not initialized');
    }
    return this.context.getDatabase();
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Get the state of an embodied agent
   */
  getState(agentId: AgentId): EmbodiedAgentState {
    return this.getAgentState(agentId);
  }

  /**
   * Trigger a manual soma processing (without specific interaction context)
   */
  async triggerSomaProcessing(agentId: AgentId, stimulus?: string): Promise<void> {
    // Create a minimal context for manual triggering
    const context: LettaChatContext = {
      stimulus: stimulus ?? '[Manual soma trigger]',
      response: '',
      fullResponse: { messages: [] },
      role: 'system',
      timestamp: new Date().toISOString(),
    };
    await this.processSomaResponse(agentId, context);
  }

  /**
   * Trigger a reflection session
   */
  async triggerReflection(agentId: AgentId): Promise<string | null> {
    const state = this.getAgentState(agentId);

    if (!state.reflection_letta_id) {
      return null;
    }

    try {
      const lettaManager = this.getLettaManager();
      const backend = lettaManager.getAgentBackend(agentId);
      const client = lettaManager.getClientForBackend(backend);

      if (!client) {
        return null;
      }

      const reflectionPrompt = `Time for reflection. Review recent experiences and update your understanding of yourself and your patterns. Consider:
- What patterns have you noticed in recent interactions?
- What have you learned about yourself?
- Are there any insights to record in memory?`;

      const response = await client.sendMessage(state.reflection_letta_id, reflectionPrompt);

      // Update reflection timestamp
      state.last_reflection_at = new Date().toISOString();
      this.saveAgentState(agentId, state);

      // Extract response text
      for (const msg of response.messages) {
        if ((msg as any).message_type === 'assistant_message' && (msg as any).content) {
          return (msg as any).content;
        }
      }

      return '[Reflection completed]';
    } catch (error: any) {
      log.error('Reflection failed', { agentId, error: error.message });
      return null;
    }
  }
}

export default EmbodiedAgentService;
