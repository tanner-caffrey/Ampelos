/**
 * Custom Service Worker for Ampelos Chat PWA
 *
 * Handles:
 * - Workbox precaching (injected by vite-plugin-pwa)
 * - Push notification events
 * - Notification click handling
 */

/// <reference lib="webworker" />

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// Version for debugging - bump with each release
const SW_VERSION = '1.2.1';
console.log(`[SW] Service Worker v${SW_VERSION} loading`);

// Workbox precaching - manifest is injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Take control immediately
self.skipWaiting();
clientsClaim();

console.log(`[SW] Service Worker v${SW_VERSION} initialized`);

/**
 * Push notification payload structure
 */
interface PushPayload {
  title?: string;
  body?: string;
  icon?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/**
 * Handle incoming push notifications
 */
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) {
    console.warn('[SW] Push event received but no data');
    return;
  }

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    // If not JSON, treat as plain text
    payload = {
      title: 'Ampelos',
      body: event.data.text(),
    };
  }

  const title = payload.title || 'Ampelos';
  const options: NotificationOptions = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'default',
    data: {
      url: payload.url || '/',
      ...payload.data,
    },
    // Vibration pattern: vibrate 100ms, pause 50ms, vibrate 100ms
    vibrate: [100, 50, 100],
    // Don't require user interaction to dismiss
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/**
 * Handle notification clicks
 */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const url = (event.notification.data?.url as string) || '/';

  event.waitUntil(
    // Try to find an existing window and focus it
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }).then((clientList) => {
      // Check if there's already an open window
      for (const client of clientList) {
        if ('focus' in client && 'navigate' in client) {
          // Focus the existing window and navigate to the URL
          return client.focus().then(() => {
            return (client as WindowClient).navigate(url);
          });
        }
      }
      // No existing window, open a new one
      return self.clients.openWindow(url);
    })
  );
});

/**
 * Handle notification close (optional analytics)
 */
self.addEventListener('notificationclose', (_event: NotificationEvent) => {
  // Could log analytics here if needed
});

/**
 * Handle service worker activation
 */
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    // Claim all clients immediately
    self.clients.claim()
  );
});
