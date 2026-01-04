/**
 * Push Notifications Hook
 *
 * Manages push notification subscriptions for the PWA.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch';

export interface UsePushNotificationsResult {
  /** Browser supports push notifications */
  isSupported: boolean;
  /** Push notifications are enabled on the server */
  isServerEnabled: boolean;
  /** User is currently subscribed */
  isSubscribed: boolean;
  /** Current notification permission status */
  permission: NotificationPermission;
  /** Operation in progress */
  isLoading: boolean;
  /** Last error message */
  error: string | null;
  /** Subscribe to push notifications */
  subscribe: () => Promise<void>;
  /** Unsubscribe from push notifications */
  unsubscribe: () => Promise<void>;
  /** Toggle subscription state */
  toggle: () => Promise<void>;
}

/**
 * Convert a base64 URL-safe string to Uint8Array
 * Required for the applicationServerKey in push subscription
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export function usePushNotifications(): UsePushNotificationsResult {
  const [isSupported, setIsSupported] = useState(false);
  const [isServerEnabled, setIsServerEnabled] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check browser support and current state on mount
  useEffect(() => {
    const checkSupport = async () => {
      // Check browser APIs
      const supported =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;

      setIsSupported(supported);

      if (!supported) {
        setIsLoading(false);
        return;
      }

      // Get current permission
      setPermission(Notification.permission);

      try {
        // Check server status
        const statusResponse = await apiFetch('/api/push/vapid-key');
        const statusData = await statusResponse.json();
        setIsServerEnabled(statusData.enabled);

        if (!statusData.enabled) {
          setIsLoading(false);
          return;
        }

        // Check if already subscribed
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          // Verify with server
          const checkResponse = await apiFetch(
            `/api/push/status?endpoint=${encodeURIComponent(subscription.endpoint)}`
          );
          const checkData = await checkResponse.json();
          setIsSubscribed(checkData.subscribed);
        }
      } catch (err) {
        console.error('Failed to check push notification status:', err);
      }

      setIsLoading(false);
    };

    checkSupport();
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported || !isServerEnabled) {
      setError('Push notifications not available');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        setError('Notification permission denied');
        setIsLoading(false);
        return;
      }

      // Get VAPID public key from server
      const vapidResponse = await apiFetch('/api/push/vapid-key');
      const vapidData = await vapidResponse.json();

      if (!vapidData.vapidKey) {
        setError('Server not configured for push notifications');
        setIsLoading(false);
        return;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.vapidKey),
      });

      // Send subscription to server
      const subscriptionJson = subscription.toJSON();
      const response = await apiFetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscriptionJson.endpoint,
          keys: subscriptionJson.keys,
          userAgent: navigator.userAgent,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to register subscription');
      }

      setIsSubscribed(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to subscribe';
      setError(message);
      console.error('Push subscription failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isServerEnabled]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from push manager
        await subscription.unsubscribe();

        // Remove from server
        await apiFetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }

      setIsSubscribed(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unsubscribe';
      setError(message);
      console.error('Push unsubscribe failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggle = useCallback(async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  }, [isSubscribed, subscribe, unsubscribe]);

  return {
    isSupported,
    isServerEnabled,
    isSubscribed,
    permission,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    toggle,
  };
}
