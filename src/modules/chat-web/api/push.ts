/**
 * Push Notification API Handler
 *
 * Handles push subscription management endpoints.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServiceManager } from '../../../core/service-manager.js';
import { createComponentLogger } from '../../../core/logger.js';
import type ChatWebService from '../service.js';
import type { SubscribeRequest, UnsubscribeRequest } from '../push/types.js';

const log = createComponentLogger('PushAPI');

export class PushAPIHandler {
  constructor(private serviceManager: ServiceManager) {}

  /**
   * Get the ChatWebService instance
   */
  private getChatWebService(): ChatWebService | null {
    try {
      return this.serviceManager.getService('chat-web') as ChatWebService;
    } catch {
      return null;
    }
  }

  /**
   * GET /api/push/vapid-key
   * Returns the VAPID public key for frontend subscription
   */
  async handleGetVapidKey(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const service = this.getChatWebService();

    if (!service) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Chat service not available' }));
      return;
    }

    const enabled = service.isPushEnabled();
    const vapidKey = service.getVapidPublicKey();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled,
      vapidKey: vapidKey || null,
    }));
  }

  /**
   * GET /api/push/status
   * Check if push is enabled and optionally if a specific endpoint is subscribed
   */
  async handleGetStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const service = this.getChatWebService();

    if (!service) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Chat service not available' }));
      return;
    }

    // Check for endpoint query param
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const endpoint = url.searchParams.get('endpoint');

    const enabled = service.isPushEnabled();
    const subscribed = endpoint ? service.isSubscribed(endpoint) : false;
    const subscriberCount = service.getSubscriptions().length;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled,
      subscribed,
      subscriberCount,
    }));
  }

  /**
   * POST /api/push/subscribe
   * Register a new push subscription
   */
  async handleSubscribe(_req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
    const service = this.getChatWebService();

    if (!service) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Chat service not available' }));
      return;
    }

    if (!service.isPushEnabled()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Push notifications not enabled' }));
      return;
    }

    // Validate request body
    const request = body as SubscribeRequest;
    if (!request?.endpoint || !request?.keys?.p256dh || !request?.keys?.auth) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid subscription: missing endpoint or keys' }));
      return;
    }

    try {
      const subscription = service.addSubscription(request);
      log.info('Push subscription added', { id: subscription.id });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        id: subscription.id,
      }));
    } catch (error) {
      log.error('Failed to add subscription', { error });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to register subscription' }));
    }
  }

  /**
   * DELETE /api/push/unsubscribe
   * Remove a push subscription
   */
  async handleUnsubscribe(_req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
    const service = this.getChatWebService();

    if (!service) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Chat service not available' }));
      return;
    }

    // Validate request body
    const request = body as UnsubscribeRequest;
    if (!request?.endpoint) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing endpoint' }));
      return;
    }

    try {
      const removed = service.removeSubscription(request.endpoint);

      if (removed) {
        log.info('Push subscription removed');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Subscription not found' }));
      }
    } catch (error) {
      log.error('Failed to remove subscription', { error });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to remove subscription' }));
    }
  }

  /**
   * POST /api/push/test
   * Send a test notification (for debugging)
   */
  async handleTestNotification(_req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
    const service = this.getChatWebService();

    if (!service) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Chat service not available' }));
      return;
    }

    if (!service.isPushEnabled()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Push notifications not enabled' }));
      return;
    }

    const request = body as { title?: string; body?: string };
    const title = request?.title || 'Test Notification';
    const notificationBody = request?.body || 'This is a test push notification from Ampelos';

    try {
      const result = await service.sendNotification({
        title,
        body: notificationBody,
        tag: 'test',
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      log.error('Failed to send test notification', { error });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to send notification' }));
    }
  }
}
