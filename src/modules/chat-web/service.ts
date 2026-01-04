/**
 * Chat Web Service (Singleton)
 *
 * Provides web-based chat interface endpoints and push notification support.
 */

import webpush from 'web-push';
import { randomUUID } from 'crypto';
import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import { createComponentLogger } from '../../core/logger.js';
import type {
  PushSubscriptionData,
  PushSubscriptionsState,
  SendNotificationOptions,
  SendNotificationResult,
  SubscribeRequest,
} from './push/types.js';

const log = createComponentLogger('ChatWeb');

const SERVICE_NAME = 'chat-web';
const PUSH_STATE_NAMESPACE = 'push-subscriptions';

interface ChatWebState {
  initialized: boolean;
}

export default class ChatWebService implements BaseService {
  private context?: ServiceContext;
  private initializedAgents: Set<AgentId> = new Set();
  private pushEnabled = false;
  private vapidPublicKey?: string;

  /**
   * Initialize the service (global, once at startup)
   */
  async init(context: ServiceContext): Promise<void> {
    this.context = context;

    // Configure web-push if VAPID keys are available
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT;

    if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
      try {
        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
        this.pushEnabled = true;
        this.vapidPublicKey = vapidPublicKey;
        log.info('Push notifications enabled');
      } catch (error) {
        log.error('Failed to configure push notifications', { error });
      }
    } else {
      log.info('Push notifications disabled (VAPID keys not configured)');
    }

    log.info('Service initialized');
  }

  /**
   * Check if an agent can reconnect without config
   */
  canReconnect(_agentId: AgentId, _state: Record<string, unknown>): boolean {
    // Chat web can always reconnect - no special state needed
    return true;
  }

  /**
   * Initialize chat-web for a specific agent
   */
  async initAgent(agentId: AgentId, _config: Record<string, unknown>): Promise<void> {
    if (!this.context) {
      throw new Error('ChatWeb service not initialized');
    }

    const state = this.context.getState<ChatWebState>(agentId, SERVICE_NAME);
    state.set({ initialized: true });

    this.initializedAgents.add(agentId);
    log.info(`Initialized for agent ${agentId}`);
  }

  /**
   * Check if an agent is initialized
   */
  isAgentInitialized(agentId: AgentId): boolean {
    return this.initializedAgents.has(agentId);
  }

  /**
   * Clean up agent-specific resources
   */
  async cleanupAgent(agentId: AgentId): Promise<void> {
    this.initializedAgents.delete(agentId);
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup(): Promise<void> {
    this.initializedAgents.clear();
  }

  // ==========================================================================
  // Push Notification Methods
  // ==========================================================================

  /**
   * Check if push notifications are enabled
   */
  isPushEnabled(): boolean {
    return this.pushEnabled;
  }

  /**
   * Get the VAPID public key for frontend subscription
   */
  getVapidPublicKey(): string | undefined {
    return this.vapidPublicKey;
  }

  /**
   * Get the global push subscriptions state
   */
  private getPushState(): PushSubscriptionsState {
    if (!this.context) {
      return { subscriptions: {} };
    }
    const state = this.context.getGlobalState<PushSubscriptionsState>(PUSH_STATE_NAMESPACE);
    const current = state.get();
    if (!current || !current.subscriptions) {
      state.set({ subscriptions: {} });
      return { subscriptions: {} };
    }
    return current;
  }

  /**
   * Save the push subscriptions state
   */
  private savePushState(pushState: PushSubscriptionsState): void {
    if (!this.context) return;
    const state = this.context.getGlobalState<PushSubscriptionsState>(PUSH_STATE_NAMESPACE);
    state.set(pushState);
  }

  /**
   * Add a push subscription
   */
  addSubscription(request: SubscribeRequest): PushSubscriptionData {
    const pushState = this.getPushState();

    // Check if subscription already exists by endpoint
    const existing = Object.values(pushState.subscriptions).find(
      (sub) => sub.endpoint === request.endpoint
    );
    if (existing) {
      // Update existing subscription
      existing.keys = request.keys;
      existing.userAgent = request.userAgent;
      existing.lastUsedAt = new Date().toISOString();
      this.savePushState(pushState);
      log.info('Updated existing push subscription', { id: existing.id });
      return existing;
    }

    // Create new subscription
    const subscription: PushSubscriptionData = {
      id: randomUUID(),
      endpoint: request.endpoint,
      keys: request.keys,
      userAgent: request.userAgent,
      createdAt: new Date().toISOString(),
    };

    pushState.subscriptions[subscription.id] = subscription;
    this.savePushState(pushState);
    log.info('Added push subscription', { id: subscription.id });
    return subscription;
  }

  /**
   * Remove a push subscription by endpoint
   */
  removeSubscription(endpoint: string): boolean {
    const pushState = this.getPushState();

    const subscriptionId = Object.keys(pushState.subscriptions).find(
      (id) => pushState.subscriptions[id].endpoint === endpoint
    );

    if (!subscriptionId) {
      return false;
    }

    delete pushState.subscriptions[subscriptionId];
    this.savePushState(pushState);
    log.info('Removed push subscription', { id: subscriptionId });
    return true;
  }

  /**
   * Check if an endpoint is subscribed
   */
  isSubscribed(endpoint: string): boolean {
    const pushState = this.getPushState();
    return Object.values(pushState.subscriptions).some(
      (sub) => sub.endpoint === endpoint
    );
  }

  /**
   * Get all subscriptions (for admin/debugging)
   */
  getSubscriptions(): PushSubscriptionData[] {
    const pushState = this.getPushState();
    return Object.values(pushState.subscriptions);
  }

  /**
   * Send a push notification to all subscribers
   */
  async sendNotification(options: SendNotificationOptions): Promise<SendNotificationResult> {
    if (!this.pushEnabled) {
      return {
        success: false,
        message: 'Push notifications not enabled (VAPID keys not configured)',
        sent: 0,
        failed: 0,
      };
    }

    const pushState = this.getPushState();
    const subscriptions = Object.values(pushState.subscriptions);

    if (subscriptions.length === 0) {
      return {
        success: true,
        message: 'No subscribers to notify',
        sent: 0,
        failed: 0,
      };
    }

    const payload = JSON.stringify({
      title: options.title,
      body: options.body,
      url: options.url || '/',
      icon: options.icon || '/icons/icon-192.png',
      tag: options.tag,
      data: options.data,
    });

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    const expiredEndpoints: string[] = [];

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          payload
        );
        sent++;

        // Update last used time
        subscription.lastUsedAt = new Date().toISOString();
      } catch (error: unknown) {
        failed++;
        const webPushError = error as { statusCode?: number; message?: string };

        // If subscription is expired/invalid, mark for removal
        if (webPushError.statusCode === 404 || webPushError.statusCode === 410) {
          expiredEndpoints.push(subscription.endpoint);
          log.warn('Push subscription expired', { id: subscription.id });
        } else {
          const errorMsg = webPushError.message || 'Unknown error';
          errors.push(`${subscription.id}: ${errorMsg}`);
          log.error('Failed to send push notification', {
            subscriptionId: subscription.id,
            error: errorMsg,
            statusCode: webPushError.statusCode,
          });
        }
      }
    }

    // Remove expired subscriptions
    for (const endpoint of expiredEndpoints) {
      this.removeSubscription(endpoint);
    }

    // Save updated lastUsedAt times
    if (sent > 0) {
      this.savePushState(pushState);
    }

    const success = sent > 0 || subscriptions.length === 0;
    const message = sent > 0
      ? `Sent notification to ${sent} subscriber${sent !== 1 ? 's' : ''}`
      : failed > 0
        ? `Failed to send notifications (${failed} error${failed !== 1 ? 's' : ''})`
        : 'No subscribers to notify';

    log.info('Push notification result', { sent, failed, expired: expiredEndpoints.length });

    return {
      success,
      message,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
