/**
 * Chat Web MCP Tools
 *
 * Tools for the chat-web module, including push notifications.
 */

import type { ToolDefinition, ToolResult } from '../../types/tool.js';
import type ChatWebService from './service.js';
import { createComponentLogger } from '../../core/logger.js';

const log = createComponentLogger('ChatWebTool');

/**
 * Send a push notification to all subscribed users.
 * This tool allows agents to proactively notify users on their devices.
 */
export const sendNotificationTool: ToolDefinition = {
  name: 'send_notification',
  description: `Send a push notification to the user's devices.

Notifications appear on the user's phone/computer even when the app is closed.
Use this to:
- Alert the user about important updates
- Remind them about something
- Get their attention when you have news

**Parameters:**
- title: Notification title (required, keep short - 2-5 words)
- body: Notification body text (required, 1-2 sentences max)
- url: URL to open when clicked (optional, defaults to app home)
- tag: Grouping tag - same tag replaces previous notification (optional)

**Examples:**
- title: "Hey!", body: "I found something interesting for you"
- title: "Reminder", body: "Don't forget about our conversation"
- title: "Check this out", body: "I have an update on your request"`,

  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Notification title (keep short, 2-5 words)',
      },
      body: {
        type: 'string',
        description: 'Notification body text (1-2 sentences)',
      },
      url: {
        type: 'string',
        description: 'URL to open when notification is clicked (optional)',
      },
      tag: {
        type: 'string',
        description: 'Tag for grouping - same tag replaces previous notification (optional)',
      },
    },
    required: ['title', 'body'],
  },

  handler: async (params, context): Promise<ToolResult> => {
    const title = (params.title as string)?.trim();
    const body = (params.body as string)?.trim();
    const url = params.url as string | undefined;
    const tag = params.tag as string | undefined;

    // Validate required params
    if (!title) {
      return {
        content: [{ type: 'text', text: 'Error: Notification title is required' }],
        isError: true,
      };
    }

    if (!body) {
      return {
        content: [{ type: 'text', text: 'Error: Notification body is required' }],
        isError: true,
      };
    }

    // Get the chat-web service
    let service: ChatWebService;
    try {
      service = context.getService<ChatWebService>('chat-web');
    } catch {
      return {
        content: [{ type: 'text', text: 'Error: Chat web service not available' }],
        isError: true,
      };
    }

    // Check if push is enabled
    if (!service.isPushEnabled()) {
      return {
        content: [{
          type: 'text',
          text: 'Push notifications are not enabled. The server needs VAPID keys configured in environment variables.',
        }],
        isError: true,
      };
    }

    // Send the notification
    try {
      const result = await service.sendNotification({
        title,
        body,
        url,
        tag,
      });

      log.info('Agent sent notification', {
        agentId: context.agentId,
        title,
        sent: result.sent,
        failed: result.failed,
      });

      if (result.success) {
        return {
          content: [{ type: 'text', text: result.message }],
        };
      } else {
        return {
          content: [{ type: 'text', text: `Notification failed: ${result.message}` }],
          isError: true,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to send notification', { error: message, agentId: context.agentId });
      return {
        content: [{ type: 'text', text: `Failed to send notification: ${message}` }],
        isError: true,
      };
    }
  },
};

/**
 * Export all tools for this module
 */
export const tools: ToolDefinition[] = [sendNotificationTool];
