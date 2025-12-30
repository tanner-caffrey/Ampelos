/**
 * Reading Subscriptions Tool
 *
 * MCP tool for managing blog/author subscriptions.
 * Provides actions to subscribe, unsubscribe, list, check, pause, and resume.
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../../types/tool.js';
import type ReadingSubscriptionsService from './service.js';
import type { SourceType, Subscription, CheckResult } from './types.js';

/**
 * Format a subscription for display
 */
function formatSubscription(sub: Subscription): string {
  const lines: string[] = [];

  const status = sub.auto_paused ? '⏸️ AUTO-PAUSED' : sub.enabled ? '✅ Active' : '⏸️ Paused';
  lines.push(`**${sub.name}** (${status})`);
  lines.push(`  ID: ${sub.id}`);
  lines.push(`  URL: ${sub.source_url}`);
  lines.push(`  Type: ${sub.detected_type || sub.source_type}`);
  lines.push(`  Check every: ${sub.check_interval_minutes} minutes`);

  if (sub.last_checked_at) {
    const lastCheck = new Date(sub.last_checked_at);
    lines.push(`  Last checked: ${lastCheck.toLocaleString()}`);
  }

  if (sub.last_new_post_at) {
    const lastNew = new Date(sub.last_new_post_at);
    lines.push(`  Last new post: ${lastNew.toLocaleString()}`);
  }

  lines.push(`  Stats: ${sub.check_count} checks, ${sub.new_post_count} new posts found`);

  if (sub.last_error) {
    lines.push(`  Last error: ${sub.last_error}`);
  }

  return lines.join('\n');
}

/**
 * Format check results for display
 */
function formatCheckResults(results: CheckResult[]): string {
  if (results.length === 0) {
    return 'No subscriptions to check.';
  }

  const lines: string[] = [];
  let totalNew = 0;

  for (const result of results) {
    const sub = result.subscription;
    if (result.success) {
      if (result.new_posts.length > 0) {
        totalNew += result.new_posts.length;
        lines.push(`✅ ${sub.name}: ${result.new_posts.length} new post(s)`);
        for (const post of result.new_posts.slice(0, 3)) {
          lines.push(`   - "${post.title}"`);
          lines.push(`     ${post.url}`);
        }
        if (result.new_posts.length > 3) {
          lines.push(`   ... and ${result.new_posts.length - 3} more`);
        }
      } else {
        lines.push(`✅ ${sub.name}: No new posts`);
      }
    } else {
      lines.push(`❌ ${sub.name}: ${result.error || 'Unknown error'}`);
    }
  }

  if (totalNew > 0) {
    lines.unshift(`Found ${totalNew} new post(s) total:\n`);
  }

  return lines.join('\n');
}

/**
 * Reading subscriptions tool definition
 */
export const readingSubscriptionsTool: ToolDefinition = {
  name: 'reading_subscriptions',
  description: `Manage subscriptions to blogs and authors to receive notifications when new content is published.

**Actions:**
- **subscribe**: Add a new subscription (params: url, name?, source_type?, interval_minutes?)
- **unsubscribe**: Remove a subscription (params: subscription_id)
- **list**: View all subscriptions with stats
- **check**: Force check for new posts (params: subscription_id? - omit to check all)
- **pause**: Temporarily disable a subscription (params: subscription_id)
- **resume**: Re-enable a paused subscription (params: subscription_id)
- **reset**: Clear seen posts history and re-sync (params: subscription_id) - use if getting repeated old post notifications

**Source Types:**
- auto (default): Automatically detect RSS/Atom/HTML
- rss: RSS feed
- atom: Atom feed
- html: HTML page scraping (for sites without feeds)

**Examples:**
- Subscribe to a blog: \`{ "action": "subscribe", "url": "https://example.com/blog", "name": "Example Blog" }\`
- List subscriptions: \`{ "action": "list" }\`
- Force check all: \`{ "action": "check" }\`
- Reset a broken subscription: \`{ "action": "reset", "subscription_id": "sub-12345" }\`
- Unsubscribe: \`{ "action": "unsubscribe", "subscription_id": "sub-12345" }\``,

  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['subscribe', 'unsubscribe', 'list', 'check', 'pause', 'resume', 'reset'],
        description: 'Action to perform',
      },
      url: {
        type: 'string',
        description: 'For subscribe: URL of feed or blog page',
      },
      name: {
        type: 'string',
        description: 'For subscribe: Display name for the author/blog',
      },
      source_type: {
        type: 'string',
        enum: ['auto', 'rss', 'atom', 'html'],
        description: 'For subscribe: Source type (default: auto)',
      },
      interval_minutes: {
        type: 'number',
        description: 'For subscribe: Check interval in minutes (default: 30)',
      },
      subscription_id: {
        type: 'string',
        description: 'For unsubscribe/check/pause/resume: Subscription ID',
      },
    },
    required: ['action'],
  },

  handler: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
    const action = params.action as string;
    const service = context.getService<ReadingSubscriptionsService>('reading-subscriptions');

    try {
      switch (action) {
        case 'subscribe': {
          const url = params.url as string | undefined;
          if (!url) {
            return {
              content: [{ type: 'text', text: 'Error: url is required for subscribe action' }],
              isError: true,
            };
          }

          const subscription = await service.addSubscription(context.agentId, {
            url,
            name: params.name as string | undefined,
            source_type: params.source_type as SourceType | undefined,
            interval_minutes: params.interval_minutes as number | undefined,
          });

          return {
            content: [{
              type: 'text',
              text: `Successfully subscribed to **${subscription.name}**\n\n` +
                `ID: ${subscription.id}\n` +
                `URL: ${subscription.source_url}\n` +
                `Type: ${subscription.detected_type || subscription.source_type}\n` +
                `Check interval: ${subscription.check_interval_minutes} minutes\n\n` +
                `You'll receive notifications when new posts are published.`,
            }],
          };
        }

        case 'unsubscribe': {
          const subscriptionId = params.subscription_id as string | undefined;
          if (!subscriptionId) {
            return {
              content: [{ type: 'text', text: 'Error: subscription_id is required for unsubscribe action' }],
              isError: true,
            };
          }

          const removed = await service.removeSubscription(context.agentId, subscriptionId);
          if (removed) {
            return {
              content: [{ type: 'text', text: `Successfully unsubscribed from ${subscriptionId}` }],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Subscription not found: ${subscriptionId}` }],
              isError: true,
            };
          }
        }

        case 'list': {
          const subscriptions = service.listSubscriptions(context.agentId);
          if (subscriptions.length === 0) {
            return {
              content: [{ type: 'text', text: 'No subscriptions yet. Use the subscribe action to add one!' }],
            };
          }

          const formatted = subscriptions.map(formatSubscription).join('\n\n');
          return {
            content: [{ type: 'text', text: `**Reading Subscriptions** (${subscriptions.length})\n\n${formatted}` }],
          };
        }

        case 'check': {
          const subscriptionId = params.subscription_id as string | undefined;
          const results = await service.checkSubscription(context.agentId, subscriptionId);
          return {
            content: [{ type: 'text', text: formatCheckResults(results) }],
          };
        }

        case 'pause': {
          const subscriptionId = params.subscription_id as string | undefined;
          if (!subscriptionId) {
            return {
              content: [{ type: 'text', text: 'Error: subscription_id is required for pause action' }],
              isError: true,
            };
          }

          const paused = await service.pauseSubscription(context.agentId, subscriptionId);
          if (paused) {
            return {
              content: [{ type: 'text', text: `Subscription ${subscriptionId} has been paused.` }],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Subscription not found: ${subscriptionId}` }],
              isError: true,
            };
          }
        }

        case 'resume': {
          const subscriptionId = params.subscription_id as string | undefined;
          if (!subscriptionId) {
            return {
              content: [{ type: 'text', text: 'Error: subscription_id is required for resume action' }],
              isError: true,
            };
          }

          const resumed = await service.resumeSubscription(context.agentId, subscriptionId);
          if (resumed) {
            return {
              content: [{ type: 'text', text: `Subscription ${subscriptionId} has been resumed.` }],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Subscription not found: ${subscriptionId}` }],
              isError: true,
            };
          }
        }

        case 'reset': {
          const subscriptionId = params.subscription_id as string | undefined;
          if (!subscriptionId) {
            return {
              content: [{ type: 'text', text: 'Error: subscription_id is required for reset action' }],
              isError: true,
            };
          }

          const result = await service.resetSubscription(context.agentId, subscriptionId);
          if (result.success) {
            return {
              content: [{
                type: 'text',
                text: `Subscription ${subscriptionId} has been reset.\n` +
                  `Found ${result.postsFound} posts - these are now marked as "seen".\n` +
                  `Future checks will only notify about genuinely new posts.`
              }],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Failed to reset: ${result.error}` }],
              isError: true,
            };
          }
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown action: ${action}` }],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
};

/**
 * Export tools array for module loader
 */
export const tools: ToolDefinition[] = [readingSubscriptionsTool];
