/**
 * Push Notification Types
 *
 * Types for PWA push notification subscriptions and payloads.
 */

/**
 * Browser push subscription stored in global state
 */
export interface PushSubscriptionData {
  id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: string;
  lastUsedAt?: string;
}

/**
 * Global state for push subscriptions (shared across all agents)
 */
export interface PushSubscriptionsState {
  subscriptions: Record<string, PushSubscriptionData>;
}

/**
 * Options for sending a push notification
 */
export interface SendNotificationOptions {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/**
 * Result from sending notifications
 */
export interface SendNotificationResult {
  success: boolean;
  message: string;
  sent: number;
  failed: number;
  errors?: string[];
}

/**
 * Subscription request from frontend
 */
export interface SubscribeRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
}

/**
 * Unsubscribe request from frontend
 */
export interface UnsubscribeRequest {
  endpoint: string;
}
