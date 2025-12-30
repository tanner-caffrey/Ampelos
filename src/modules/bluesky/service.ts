/**
 * Bluesky Service
 *
 * Singleton service managing per-agent Bluesky client instances.
 * Handles authentication, session management, and notification polling.
 */

import type { ServiceContext } from '../../types/service.js';
import type { AgentId } from '../../types/agent.js';
import type { BlueskyConfig, BlueskyState, NamedFeed, BlueskyNotification } from './types.js';
import { BlueskyClientWrapper } from './client.js';
import { createComponentLogger } from '../../core/logger.js';

const log = createComponentLogger('Bluesky');

/** Default polling interval for notifications: 1 minute */
const DEFAULT_POLL_INTERVAL_MS = 60000;

/** Default polling interval for DMs: 10 seconds */
const DEFAULT_DM_POLL_INTERVAL_MS = 10000;

/** All notification types */
const ALL_NOTIFICATION_TYPES: BlueskyNotification['reason'][] = [
  'like', 'repost', 'follow', 'mention', 'reply', 'quote'
];

export default class BlueskyService {
  private context: ServiceContext | null = null;
  private clients: Map<AgentId, BlueskyClientWrapper> = new Map();
  private configs: Map<AgentId, BlueskyConfig> = new Map();
  private pollIntervals: Map<AgentId, NodeJS.Timeout> = new Map();
  private dmPollIntervals: Map<AgentId, NodeJS.Timeout> = new Map();

  /**
   * Initialize the service with context
   */
  async init(context: ServiceContext): Promise<void> {
    this.context = context;
  }

  /**
   * Initialize for a specific agent
   */
  async initAgent(agentId: AgentId, config: BlueskyConfig): Promise<void> {
    if (!this.context) {
      throw new Error('Service not initialized');
    }

    // Validate config
    if (!config.handle) {
      throw new Error('Bluesky config requires handle');
    }

    // Get agent metadata for password env var
    const metadata = this.context.getAgentMetadata(agentId);
    if (!metadata) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Get password from environment variable
    const envKey = `BLUESKY_${metadata.agent_name.toUpperCase()}_PASSWORD`;
    const password = process.env[envKey];

    if (!password) {
      throw new Error(`Missing password environment variable: ${envKey}`);
    }

    // Create client
    const client = new BlueskyClientWrapper({
      service: config.service || 'https://bsky.social'
    });

    // Login
    const session = await client.login(config.handle, password);

    // Store client and config
    this.clients.set(agentId, client);
    this.configs.set(agentId, config);

    // Get existing state or create new
    const state = this.context.getState<BlueskyState>(agentId, 'bluesky');

    // Determine if notification listener should be enabled
    // Default to true if not explicitly set to false in config
    const listenerEnabled = config.notification_listener?.enabled !== false;

    // Determine if DM listener should be enabled
    // Default to true if not explicitly set to false in config
    const dmListenerEnabled = config.dm_listener?.enabled !== false;

    const existingState = state.get();
    state.set({
      initialized: true,
      handle: config.handle,
      did: session.did,
      session_created_at: new Date().toISOString(),
      notification_listener_enabled: listenerEnabled,
      // Preserve existing last_notification_seen if present
      last_notification_seen: existingState?.last_notification_seen,
      dm_listener_enabled: dmListenerEnabled,
      // Preserve existing last_dm_seen, or set to now to avoid flooding with old DMs
      last_dm_seen: existingState?.last_dm_seen || new Date().toISOString()
    });

    // Start notification listener if enabled
    if (listenerEnabled) {
      this.startNotificationListener(agentId, config);
    }

    // Start DM listener if enabled
    if (dmListenerEnabled) {
      this.startDmListener(agentId, config);
    }
  }

  /**
   * Check if agent can reconnect from saved state
   */
  canReconnect(agentId: AgentId, state: Partial<BlueskyState>): boolean {
    return Boolean(state.initialized && state.handle && state.did);
  }

  /**
   * Get client for an agent
   */
  getClient(agentId: AgentId): BlueskyClientWrapper {
    const client = this.clients.get(agentId);
    if (!client) {
      throw new Error(`Bluesky client not initialized for agent: ${agentId}`);
    }
    return client;
  }

  /**
   * Check if agent is initialized
   */
  isAgentInitialized(agentId: AgentId): boolean {
    return this.clients.has(agentId);
  }

  /**
   * Get configured feeds for an agent
   */
  getFeeds(agentId: AgentId): NamedFeed[] {
    const config = this.configs.get(agentId);
    return config?.feeds || [];
  }

  /**
   * Look up a feed URI by name (case-insensitive)
   */
  getFeedByName(agentId: AgentId, feedName: string): NamedFeed | undefined {
    const feeds = this.getFeeds(agentId);
    const lowerName = feedName.toLowerCase();
    return feeds.find(f => f.name.toLowerCase() === lowerName);
  }

  /**
   * Check if a handle is allowed for DMs based on the allowlist config
   * @returns { allowed: boolean, reason?: string }
   */
  isDmAllowed(agentId: AgentId, handle: string): { allowed: boolean; reason?: string } {
    const config = this.configs.get(agentId);

    // If no allowlist configured or not enabled, allow all DMs
    if (!config?.dm_allowlist?.enabled) {
      return { allowed: true };
    }

    // Normalize handle (remove @ prefix if present)
    const normalizedHandle = handle.startsWith('@') ? handle.slice(1) : handle;
    const allowedHandles = config.dm_allowlist.handles.map(h =>
      h.startsWith('@') ? h.slice(1).toLowerCase() : h.toLowerCase()
    );

    if (allowedHandles.includes(normalizedHandle.toLowerCase())) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `DM not allowed: "${handle}" is not in the allowlist. Allowed handles: ${config.dm_allowlist.handles.join(', ')}`
    };
  }

  /**
   * Get the DM allowlist for an agent
   */
  getDmAllowlist(agentId: AgentId): string[] {
    const config = this.configs.get(agentId);
    if (!config?.dm_allowlist?.enabled) {
      return [];
    }
    return config.dm_allowlist.handles;
  }

  // ============================================================================
  // Unified Interaction Allowlist Methods
  // ============================================================================

  /**
   * Check if interaction with handle(s) is allowed based on the unified allowlist.
   * Falls back to legacy dm_allowlist for DM interactions if interaction_allowlist is not configured.
   *
   * @param agentId - The agent ID
   * @param handles - Handle(s) to check (e.g., reply author, mentioned users)
   * @param interactionType - Type of interaction: 'dm', 'reply', 'mention', or 'post'
   * @returns { allowed: boolean, reason?: string, blockedHandles?: string[] }
   */
  isInteractionAllowed(
    agentId: AgentId,
    handles: string[],
    interactionType: 'dm' | 'reply' | 'mention' | 'post'
  ): { allowed: boolean; reason?: string; blockedHandles?: string[] } {
    const config = this.configs.get(agentId);

    // Check unified interaction_allowlist first
    if (config?.interaction_allowlist?.enabled) {
      const allowedHandles = config.interaction_allowlist.handles.map(h =>
        h.startsWith('@') ? h.slice(1).toLowerCase() : h.toLowerCase()
      );

      const normalizedHandles = handles.map(h =>
        h.startsWith('@') ? h.slice(1).toLowerCase() : h.toLowerCase()
      );

      const blockedHandles = normalizedHandles.filter(h => !allowedHandles.includes(h));

      if (blockedHandles.length > 0) {
        return {
          allowed: false,
          reason: `${interactionType} not allowed: ${blockedHandles.map(h => `"${h}"`).join(', ')} not in interaction allowlist. Allowed handles: ${config.interaction_allowlist.handles.join(', ')}`,
          blockedHandles
        };
      }

      return { allowed: true };
    }

    // Fall back to legacy dm_allowlist for DM interactions only
    if (interactionType === 'dm' && config?.dm_allowlist?.enabled) {
      // Use existing isDmAllowed for single handle
      if (handles.length === 1) {
        return this.isDmAllowed(agentId, handles[0]);
      }

      // Check multiple handles
      const allowedHandles = config.dm_allowlist.handles.map(h =>
        h.startsWith('@') ? h.slice(1).toLowerCase() : h.toLowerCase()
      );

      const normalizedHandles = handles.map(h =>
        h.startsWith('@') ? h.slice(1).toLowerCase() : h.toLowerCase()
      );

      const blockedHandles = normalizedHandles.filter(h => !allowedHandles.includes(h));

      if (blockedHandles.length > 0) {
        return {
          allowed: false,
          reason: `DM not allowed: ${blockedHandles.map(h => `"${h}"`).join(', ')} not in allowlist. Allowed handles: ${config.dm_allowlist.handles.join(', ')}`,
          blockedHandles
        };
      }

      return { allowed: true };
    }

    // No allowlist configured or not enabled for this type - allow all
    return { allowed: true };
  }

  /**
   * Get the interaction allowlist for an agent
   * Returns unified allowlist if configured, otherwise falls back to dm_allowlist
   */
  getInteractionAllowlist(agentId: AgentId): string[] {
    const config = this.configs.get(agentId);

    if (config?.interaction_allowlist?.enabled) {
      return config.interaction_allowlist.handles;
    }

    // Fall back to legacy dm_allowlist
    if (config?.dm_allowlist?.enabled) {
      return config.dm_allowlist.handles;
    }

    return [];
  }

  /**
   * Check if the interaction allowlist is enabled for an agent
   */
  isInteractionAllowlistEnabled(agentId: AgentId): boolean {
    const config = this.configs.get(agentId);
    return Boolean(config?.interaction_allowlist?.enabled || config?.dm_allowlist?.enabled);
  }

  /**
   * Clean up all agents
   */
  async cleanup(): Promise<void> {
    // Stop all notification listeners
    for (const [agentId, interval] of this.pollIntervals) {
      clearInterval(interval);
    }
    this.pollIntervals.clear();

    // Stop all DM listeners
    for (const [agentId, interval] of this.dmPollIntervals) {
      clearInterval(interval);
    }
    this.dmPollIntervals.clear();

    this.clients.clear();
    this.configs.clear();
  }

  /**
   * Clean up specific agent
   */
  async cleanupAgent(agentId: AgentId): Promise<void> {
    // Stop notification listener
    const interval = this.pollIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(agentId);
    }

    // Stop DM listener
    const dmInterval = this.dmPollIntervals.get(agentId);
    if (dmInterval) {
      clearInterval(dmInterval);
      this.dmPollIntervals.delete(agentId);
    }

    this.clients.delete(agentId);
    this.configs.delete(agentId);
  }

  // ============================================================================
  // Notification Listener Methods
  // ============================================================================

  /**
   * Start the notification polling for an agent
   */
  private startNotificationListener(agentId: AgentId, config: BlueskyConfig): void {
    // Don't start if already running
    if (this.pollIntervals.has(agentId)) {
      return;
    }

    const interval = config.notification_listener?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    log.info('Starting notification listener', { agentId, intervalMs: interval });

    const poll = async () => {
      try {
        await this.checkAndNotify(agentId);
      } catch (error) {
        log.error('Error polling notifications', { agentId, error });
      }
    };

    // Initial check after short delay (5 seconds)
    setTimeout(poll, 5000);

    // Set up recurring poll
    const intervalId = setInterval(poll, interval);
    this.pollIntervals.set(agentId, intervalId);
  }

  /**
   * Stop the notification polling for an agent
   */
  private stopNotificationListener(agentId: AgentId): void {
    const interval = this.pollIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(agentId);
      log.info('Stopped notification listener', { agentId });
    }
  }

  /**
   * Check for new notifications and send to agent
   */
  private async checkAndNotify(agentId: AgentId): Promise<void> {
    if (!this.context) return;

    // Get state and check if listener is enabled
    const state = this.context.getState<BlueskyState>(agentId, 'bluesky');
    const currentState = state.get();

    if (!currentState?.notification_listener_enabled) {
      return;
    }

    // Get client
    const client = this.clients.get(agentId);
    if (!client) return;

    // Get config for notification type filtering
    const config = this.configs.get(agentId);
    const allowedTypes = config?.notification_listener?.notifyTypes || ALL_NOTIFICATION_TYPES;

    try {
      // Fetch recent notifications
      const notifications = await client.getNotifications(20);

      // Filter to new notifications since last check
      const lastSeen = currentState.last_notification_seen;
      let newNotifs = notifications.filter(n => {
        // Check if newer than last seen
        if (lastSeen && n.indexedAt <= lastSeen) return false;
        // Check if allowed type
        if (!allowedTypes.includes(n.reason)) return false;
        return true;
      });

      if (newNotifs.length === 0) return;

      // Update last seen timestamp (use the newest notification's timestamp)
      const newestTimestamp = newNotifs.reduce(
        (max, n) => n.indexedAt > max ? n.indexedAt : max,
        newNotifs[0].indexedAt
      );
      state.set({
        ...currentState,
        last_notification_seen: newestTimestamp
      });

      // Get Letta manager to send to agent
      const lettaManager = this.context.getLettaManager?.();
      if (!lettaManager) {
        log.warn('LettaManager not available', { agentId });
        return;
      }

      // Format and send notification message
      const message = this.formatNotificationsMessage(newNotifs);
      await lettaManager.chat(agentId, message, { role: 'system' });

      log.info('Sent notifications to agent', { agentId, count: newNotifs.length });
    } catch (error) {
      // Don't log expected errors during polling
      if (!(error instanceof Error && error.message.includes('Not authenticated'))) {
        log.error('Error checking notifications', { agentId, error });
      }
    }
  }

  /**
   * Format multiple notifications into a system message
   */
  private formatNotificationsMessage(notifications: BlueskyNotification[]): string {
    const lines = [
      '[BLUESKY NOTIFICATIONS]',
      `You have ${notifications.length} new notification${notifications.length > 1 ? 's' : ''}:`,
      ''
    ];

    for (const notif of notifications) {
      lines.push(this.formatSingleNotification(notif));
    }

    return lines.join('\n');
  }

  /**
   * Format a single notification for display
   */
  private formatSingleNotification(notif: BlueskyNotification): string {
    const author = notif.author.displayName
      ? `${notif.author.displayName} (@${notif.author.handle})`
      : `@${notif.author.handle}`;

    switch (notif.reason) {
      case 'like':
        return `• ${author} liked your post`;
      case 'repost':
        return `• ${author} reposted your post`;
      case 'follow':
        return `• ${author} followed you`;
      case 'mention':
        return `• ${author} mentioned you: "${notif.text || '...'}"`;
      case 'reply':
        return `• ${author} replied: "${notif.text || '...'}"`;
      case 'quote':
        return `• ${author} quoted your post: "${notif.text || '...'}"`;
      default:
        return `• ${author}: ${notif.reason}`;
    }
  }

  // ============================================================================
  // Notification Listener Control (for MCP tools)
  // ============================================================================

  /**
   * Enable the notification listener for an agent
   */
  async enableNotificationListener(agentId: AgentId): Promise<void> {
    if (!this.context) throw new Error('Service not initialized');

    const state = this.context.getState<BlueskyState>(agentId, 'bluesky');
    const currentState = state.get();

    if (currentState?.notification_listener_enabled) {
      return; // Already enabled
    }

    state.set({
      initialized: currentState?.initialized ?? false,
      ...currentState,
      notification_listener_enabled: true
    });

    // Start polling if not already running
    const config = this.configs.get(agentId);
    if (config && !this.pollIntervals.has(agentId)) {
      this.startNotificationListener(agentId, config);
    }
  }

  /**
   * Disable the notification listener for an agent
   */
  async disableNotificationListener(agentId: AgentId): Promise<void> {
    if (!this.context) throw new Error('Service not initialized');

    const state = this.context.getState<BlueskyState>(agentId, 'bluesky');
    const currentState = state.get();

    state.set({
      initialized: currentState?.initialized ?? false,
      ...currentState,
      notification_listener_enabled: false
    });

    // Stop polling
    this.stopNotificationListener(agentId);
  }

  /**
   * Check if notification listener is enabled
   */
  isNotificationListenerEnabled(agentId: AgentId): boolean {
    if (!this.context) return false;

    const state = this.context.getState<BlueskyState>(agentId, 'bluesky');
    return state.get()?.notification_listener_enabled ?? false;
  }

  /**
   * Get the current notification listener status for an agent
   */
  getNotificationListenerStatus(agentId: AgentId): {
    enabled: boolean;
    lastChecked?: string;
    pollIntervalMs: number;
  } {
    const config = this.configs.get(agentId);
    const enabled = this.isNotificationListenerEnabled(agentId);

    let lastChecked: string | undefined;
    if (this.context) {
      const state = this.context.getState<BlueskyState>(agentId, 'bluesky');
      lastChecked = state.get()?.last_notification_seen;
    }

    return {
      enabled,
      lastChecked,
      pollIntervalMs: config?.notification_listener?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    };
  }

  // ============================================================================
  // DM Listener Methods
  // ============================================================================

  /**
   * Start the DM polling for an agent
   */
  private startDmListener(agentId: AgentId, config: BlueskyConfig): void {
    // Don't start if already running
    if (this.dmPollIntervals.has(agentId)) {
      return;
    }

    const interval = config.dm_listener?.pollIntervalMs ?? DEFAULT_DM_POLL_INTERVAL_MS;

    log.info('Starting DM listener', { agentId, intervalMs: interval });

    const poll = async () => {
      try {
        await this.checkAndNotifyDms(agentId);
      } catch (error) {
        log.error('Error polling DMs', { agentId, error });
      }
    };

    // Initial check after short delay (3 seconds)
    setTimeout(poll, 3000);

    // Set up recurring poll
    const intervalId = setInterval(poll, interval);
    this.dmPollIntervals.set(agentId, intervalId);
  }

  /**
   * Stop the DM polling for an agent
   */
  private stopDmListener(agentId: AgentId): void {
    const interval = this.dmPollIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.dmPollIntervals.delete(agentId);
      log.info('Stopped DM listener', { agentId });
    }
  }

  /**
   * Check for new DMs and send to agent
   */
  private async checkAndNotifyDms(agentId: AgentId): Promise<void> {
    if (!this.context) return;

    // Get state and check if listener is enabled
    const state = this.context.getState<BlueskyState>(agentId, 'bluesky');
    const currentState = state.get();

    if (!currentState?.dm_listener_enabled) {
      return;
    }

    // Get client
    const client = this.clients.get(agentId);
    if (!client) return;

    try {
      // Fetch new DMs since last check
      const lastSeen = currentState.last_dm_seen;
      const newMessages = await client.getNewMessages(lastSeen);

      if (newMessages.length === 0) return;

      // Filter by allowlist if enabled and has entries
      const allowlist = this.getInteractionAllowlist(agentId);
      const allowlistEnabled = this.isInteractionAllowlistEnabled(agentId);

      let filteredMessages = newMessages;
      if (allowlistEnabled && allowlist.length > 0) {
        filteredMessages = newMessages.filter(msg =>
          allowlist.some(h => h.toLowerCase() === msg.sender.handle.toLowerCase())
        );
      }

      if (filteredMessages.length === 0) {
        // Still update last_dm_seen even if filtered out
        const newestTimestamp = newMessages.reduce(
          (max, m) => m.sentAt > max ? m.sentAt : max,
          newMessages[0].sentAt
        );
        state.set({
          ...currentState,
          last_dm_seen: newestTimestamp
        });
        return;
      }

      // Update last seen timestamp (use the newest message's timestamp)
      const newestTimestamp = newMessages.reduce(
        (max, m) => m.sentAt > max ? m.sentAt : max,
        newMessages[0].sentAt
      );
      state.set({
        ...currentState,
        last_dm_seen: newestTimestamp
      });

      // Get Letta manager to send to agent
      const lettaManager = this.context.getLettaManager?.();
      if (!lettaManager) {
        log.warn('LettaManager not available', { agentId });
        return;
      }

      // Format and send DM notification message
      const message = this.formatDmNotificationsMessage(filteredMessages);
      await lettaManager.chat(agentId, message, { role: 'system' });

      log.info('Sent DM notifications to agent', { agentId, count: filteredMessages.length });
    } catch (error) {
      // Don't log expected errors during polling
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      if (!(
        errorMsg.includes('Not authenticated') ||
        errorMsg.includes('Bad token scope')
      )) {
        log.error('Error checking DMs', { agentId, error: errorMsg, stack: error instanceof Error ? error.stack : undefined });
      }
    }
  }

  /**
   * Format DM notifications into a system message
   */
  private formatDmNotificationsMessage(messages: { text: string; sender: { handle: string; displayName?: string } }[]): string {
    if (messages.length === 1) {
      const msg = messages[0];
      const sender = msg.sender.displayName
        ? `${msg.sender.displayName} (@${msg.sender.handle})`
        : `@${msg.sender.handle}`;
      return `[BLUESKY DM]\nNew message from ${sender}:\n"${msg.text}"`;
    }

    const lines = [
      '[BLUESKY DMS]',
      `You have ${messages.length} new direct messages:`,
      ''
    ];

    for (const msg of messages) {
      const sender = msg.sender.displayName
        ? `${msg.sender.displayName} (@${msg.sender.handle})`
        : `@${msg.sender.handle}`;
      lines.push(`• ${sender}: "${msg.text}"`);
    }

    return lines.join('\n');
  }

  // ============================================================================
  // DM Listener Control (for MCP tools)
  // ============================================================================

  /**
   * Enable the DM listener for an agent
   */
  async enableDmListener(agentId: AgentId): Promise<void> {
    if (!this.context) throw new Error('Service not initialized');

    const state = this.context.getState<BlueskyState>(agentId, 'bluesky');
    const currentState = state.get();

    if (currentState?.dm_listener_enabled) {
      return; // Already enabled
    }

    state.set({
      initialized: currentState?.initialized ?? false,
      ...currentState,
      dm_listener_enabled: true,
      // If no last_dm_seen, set to now to avoid flooding with old DMs
      last_dm_seen: currentState?.last_dm_seen || new Date().toISOString()
    });

    // Start polling if not already running
    const config = this.configs.get(agentId);
    if (config && !this.dmPollIntervals.has(agentId)) {
      this.startDmListener(agentId, config);
    }
  }

  /**
   * Disable the DM listener for an agent
   */
  async disableDmListener(agentId: AgentId): Promise<void> {
    if (!this.context) throw new Error('Service not initialized');

    const state = this.context.getState<BlueskyState>(agentId, 'bluesky');
    const currentState = state.get();

    state.set({
      initialized: currentState?.initialized ?? false,
      ...currentState,
      dm_listener_enabled: false
    });

    // Stop polling
    this.stopDmListener(agentId);
  }

  /**
   * Check if DM listener is enabled
   */
  isDmListenerEnabled(agentId: AgentId): boolean {
    if (!this.context) return false;

    const state = this.context.getState<BlueskyState>(agentId, 'bluesky');
    return state.get()?.dm_listener_enabled ?? false;
  }

  /**
   * Get the current DM listener status for an agent
   */
  getDmListenerStatus(agentId: AgentId): {
    enabled: boolean;
    lastChecked?: string;
    pollIntervalMs: number;
  } {
    const config = this.configs.get(agentId);
    const enabled = this.isDmListenerEnabled(agentId);

    let lastChecked: string | undefined;
    if (this.context) {
      const state = this.context.getState<BlueskyState>(agentId, 'bluesky');
      lastChecked = state.get()?.last_dm_seen;
    }

    return {
      enabled,
      lastChecked,
      pollIntervalMs: config?.dm_listener?.pollIntervalMs ?? DEFAULT_DM_POLL_INTERVAL_MS
    };
  }
}
