/**
 * Bluesky MCP Tool
 *
 * Single consolidated tool for all Bluesky operations.
 * Uses action-based dispatch similar to the letta-filesystem module.
 */

import type { ToolDefinition, ToolContext, ToolResult } from '../../types/tool.js';
import type BlueskyService from './service.js';
import { createComponentLogger } from '../../core/logger.js';

const log = createComponentLogger('Bluesky');
import type {
  BlueskyPost,
  BlueskyNotification,
  BlueskyProfile,
  BlueskyConversation,
  BlueskyMessage,
  BlueskyAction
} from './types.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a post for display (used in feeds/lists)
 */
function formatPost(post: BlueskyPost): string {
  const author = post.author.displayName
    ? `${post.author.displayName} (@${post.author.handle})`
    : `@${post.author.handle}`;

  let output = `---
Author: ${author}
Time: ${post.createdAt}
URI: ${post.uri}

${post.text}`;

  // Add image info if present
  if (post.images && post.images.length > 0) {
    output += `\n\n[${post.images.length} image${post.images.length > 1 ? 's' : ''} attached]`;
    for (const img of post.images) {
      if (img.alt) {
        output += `\n  Alt text: "${img.alt}"`;
      }
    }
  }

  output += `\n\n💬 ${post.replyCount} replies | 🔁 ${post.repostCount} reposts | ❤️ ${post.likeCount} likes
---`;

  return output;
}

/**
 * Format a single post with full details (used when reading a specific post)
 */
function formatPostDetailed(post: BlueskyPost, imageDescriptions?: string[]): string {
  const author = post.author.displayName
    ? `${post.author.displayName} (@${post.author.handle})`
    : `@${post.author.handle}`;

  let output = `Author: ${author}
Time: ${post.createdAt}
URI: ${post.uri}

${post.text}`;

  // Add image info
  if (post.images && post.images.length > 0) {
    output += `\n\n📷 Images (${post.images.length}):`;
    for (let i = 0; i < post.images.length; i++) {
      const img = post.images[i];
      output += `\n\nImage ${i + 1}:`;
      if (img.alt) {
        output += `\n  Alt text: "${img.alt}"`;
      }
      if (imageDescriptions && imageDescriptions[i]) {
        output += `\n  Description: ${imageDescriptions[i]}`;
      }
    }
  }

  output += `\n\n💬 ${post.replyCount} replies | 🔁 ${post.repostCount} reposts | ❤️ ${post.likeCount} likes`;

  return output;
}

/**
 * Format a thread (author's reply chain) for display
 */
function formatThread(posts: BlueskyPost[]): string {
  if (posts.length === 0) {
    return 'Empty thread.';
  }

  const author = posts[0].author.displayName
    ? `${posts[0].author.displayName} (@${posts[0].author.handle})`
    : `@${posts[0].author.handle}`;

  let output = `Thread by ${author} (${posts.length} post${posts.length > 1 ? 's' : ''}):\n`;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const isReply = i > 0;

    output += `\n[${i + 1}/${posts.length}] ${post.createdAt}${isReply ? ' (reply)' : ''}\n`;
    output += post.text;

    // Add image info if present
    if (post.images && post.images.length > 0) {
      output += `\n[${post.images.length} image${post.images.length > 1 ? 's' : ''} attached]`;
    }

    output += '\n';
  }

  return output;
}

/**
 * Format a notification for display
 */
function formatNotification(notif: BlueskyNotification): string {
  const author = notif.author.displayName
    ? `${notif.author.displayName} (@${notif.author.handle})`
    : `@${notif.author.handle}`;

  let description = '';
  switch (notif.reason) {
    case 'like':
      description = `${author} liked your post`;
      break;
    case 'repost':
      description = `${author} reposted your post`;
      break;
    case 'follow':
      description = `${author} followed you`;
      break;
    case 'mention':
      description = `${author} mentioned you`;
      break;
    case 'reply':
      description = `${author} replied to you`;
      break;
    case 'quote':
      description = `${author} quoted your post`;
      break;
  }

  let output = `[${notif.isRead ? 'read' : 'unread'}] ${notif.reason}: ${description}
Time: ${notif.indexedAt}`;

  if (notif.text) {
    output += `\nContent: ${notif.text}`;
  }
  if (notif.subjectUri) {
    output += `\nSubject: ${notif.subjectUri}`;
  }

  return output;
}

/**
 * Format a profile for display
 */
function formatProfile(profile: BlueskyProfile, detailed = false): string {
  const displayName = profile.displayName || profile.handle;
  let output = `${displayName} (@${profile.handle})`;

  if (detailed) {
    output += `\nDID: ${profile.did}`;
  }

  output += `\nFollowers: ${profile.followersCount} | Following: ${profile.followsCount} | Posts: ${profile.postsCount}`;

  if (profile.isFollowing !== undefined || profile.isFollowedBy !== undefined) {
    const relationships: string[] = [];
    if (profile.isFollowing) relationships.push('You follow them');
    if (profile.isFollowedBy) relationships.push('They follow you');
    if (relationships.length > 0) {
      output += `\n${relationships.join(' | ')}`;
    }
  }

  if (profile.description) {
    output += `\n\nBio: ${profile.description}`;
  }

  return output;
}

/**
 * Format a conversation for display
 */
function formatConversation(convo: BlueskyConversation): string {
  const memberNames = convo.members.map(m =>
    m.displayName ? `${m.displayName} (@${m.handle})` : `@${m.handle}`
  ).join(', ');

  let output = `Conversation with: ${memberNames}`;
  output += `\nID: ${convo.id}`;
  output += `\nUnread: ${convo.unreadCount}${convo.muted ? ' (muted)' : ''}`;

  if (convo.lastMessage) {
    output += `\nLast message: "${convo.lastMessage.text}" (${convo.lastMessage.sentAt})`;
  }

  return output;
}

/**
 * Format a DM message for display
 */
function formatMessage(msg: BlueskyMessage): string {
  const senderName = msg.sender.displayName
    ? `${msg.sender.displayName} (@${msg.sender.handle})`
    : `@${msg.sender.handle}`;

  return `[${msg.sentAt}] ${senderName}: ${msg.text}`;
}

/**
 * Helper to create error result
 */
function errorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true
  };
}

/**
 * Helper to create success result
 */
function successResult(text: string): ToolResult {
  return {
    content: [{ type: 'text', text }]
  };
}

/**
 * Get bluesky service from context
 */
function getBlueskyService(context: ToolContext): BlueskyService | null {
  return context.getService('bluesky') as unknown as BlueskyService | null;
}

/**
 * Get vision service from context (optional, for image descriptions)
 */
function getVisionService(context: ToolContext): any | null {
  try {
    return context.getService('vision') as unknown as any | null;
  } catch {
    return null;
  }
}

/**
 * Extract @mentions from text
 * Returns handles without the @ prefix
 */
function extractMentions(text: string): string[] {
  // Match @handle patterns (handles can contain letters, numbers, dots, hyphens)
  const mentionRegex = /@([a-zA-Z0-9.-]+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1].toLowerCase());
  }

  return [...new Set(mentions)]; // Deduplicate
}

/**
 * Convert Bluesky web URL to AT URI
 */
function convertToAtUri(url: string, type: 'post' | 'feed'): string | null {
  if (url.startsWith('at://')) {
    return url;
  }

  if (type === 'feed' && url.startsWith('https://bsky.app/profile/')) {
    // Convert https://bsky.app/profile/{did}/feed/{rkey} to at://{did}/app.bsky.feed.generator/{rkey}
    const match = url.match(/https:\/\/bsky\.app\/profile\/([^/]+)\/feed\/([^/?]+)/);
    if (match) {
      return `at://${match[1]}/app.bsky.feed.generator/${match[2]}`;
    }
  }

  if (type === 'post' && url.startsWith('https://bsky.app/profile/')) {
    // Convert https://bsky.app/profile/{handle}/post/{rkey} to at://{handle}/app.bsky.feed.post/{rkey}
    const match = url.match(/https:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/?]+)/);
    if (match) {
      return `at://${match[1]}/app.bsky.feed.post/${match[2]}`;
    }
  }

  return null;
}

/**
 * Detect what type of input was provided
 */
function detectInputType(input: string): 'post' | 'author' | 'feed' {
  // Check for post URI patterns
  if (input.startsWith('at://') && input.includes('/app.bsky.feed.post/')) {
    return 'post';
  }
  if (input.startsWith('https://bsky.app/profile/') && input.includes('/post/')) {
    return 'post';
  }

  // Check for handle pattern (contains a dot, typical for handles)
  // But exclude URLs
  if (!input.startsWith('http') && !input.startsWith('at://')) {
    if (input.includes('.') || input.startsWith('@')) {
      return 'author';
    }
  }

  // Default to feed name
  return 'feed';
}

// ============================================================================
// Consolidated Bluesky Tool
// ============================================================================

export const blueskyTool: ToolDefinition = {
  name: 'bluesky',
  description: `Interact with Bluesky social network. All operations use names/handles (not IDs).

**Actions:**
- **post**: Create a new post (params: text)
- **reply**: Reply to a post (params: text, post_uri)
- **read**: Read content - auto-detects feed name, author handle, or post URI (params: source, limit?, replies?, thread?)
- **search**: Search for posts (params: query, limit?)
- **notifications**: Get your notifications (params: limit?)
- **list_feeds**: List configured custom feeds
- **profile**: View a profile (params: user? - omit for own)
- **update_profile**: Update your profile (params: display_name?, description?)
- **follow**: Follow/unfollow a user (params: user, unfollow?)
- **followers**: List followers or following (params: type, user?, limit?)
- **dm**: Direct messages (params: dm_action, recipient?, message?, conversation_id?, limit?)
- **account**: Account settings (params: account_action)

**DM Actions:** send, list_conversations, read_conversation
**Account Actions:** status, enable_notifications, disable_notifications`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['post', 'reply', 'read', 'search', 'notifications', 'list_feeds', 'profile', 'update_profile', 'follow', 'followers', 'dm', 'account'],
        description: 'The Bluesky action to perform'
      },
      // Post/Reply params
      text: {
        type: 'string',
        description: 'Text content for post/reply (max 300 characters)'
      },
      post_uri: {
        type: 'string',
        description: 'For reply: URI or URL of the post to reply to'
      },
      // Read params
      source: {
        type: 'string',
        description: 'For read: feed name ("home"), author handle, or post URI/URL'
      },
      source_type: {
        type: 'string',
        enum: ['feed', 'author', 'post'],
        description: 'For read: explicitly specify source type if auto-detection fails'
      },
      replies: {
        type: 'number',
        description: 'For read post: number of replies to include'
      },
      thread: {
        type: 'boolean',
        description: 'For read post: follow the author\'s reply chain to read the full thread'
      },
      // Search params
      query: {
        type: 'string',
        description: 'For search: search query'
      },
      // Common params
      limit: {
        type: 'number',
        description: 'Max results (default: 20, max: 50)'
      },
      // Profile params
      user: {
        type: 'string',
        description: 'Handle or DID (omit for your own profile/followers)'
      },
      display_name: {
        type: 'string',
        description: 'For update_profile: new display name'
      },
      description: {
        type: 'string',
        description: 'For update_profile: new bio'
      },
      // Follow params
      unfollow: {
        type: 'boolean',
        description: 'For follow: set true to unfollow instead of follow'
      },
      // Followers params
      type: {
        type: 'string',
        enum: ['followers', 'following'],
        description: 'For followers: list followers or following'
      },
      // DM params
      dm_action: {
        type: 'string',
        enum: ['send', 'list_conversations', 'read_conversation'],
        description: 'For dm: the DM sub-action'
      },
      recipient: {
        type: 'string',
        description: 'For dm send: recipient handle or DID'
      },
      message: {
        type: 'string',
        description: 'For dm send: message text'
      },
      conversation_id: {
        type: 'string',
        description: 'For dm read_conversation: conversation ID'
      },
      // Account params
      account_action: {
        type: 'string',
        enum: ['status', 'enable_notifications', 'disable_notifications'],
        description: 'For account: the account sub-action'
      }
    },
    required: ['action']
  },
  handler: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
    const service = getBlueskyService(context);
    if (!service) {
      return errorResult('Bluesky service not available');
    }

    if (!service.isAgentInitialized(context.agentId)) {
      return errorResult('Bluesky client not initialized for this agent');
    }

    const action = params.action as BlueskyAction;

    try {
      const client = service.getClient(context.agentId);

      switch (action) {
        // ========================================
        // Post Actions
        // ========================================

        case 'post': {
          const text = (params.text as string)?.trim();
          if (!text) {
            return errorResult('Post text cannot be empty');
          }
          if (text.length > 300) {
            return errorResult('Post text exceeds 300 character limit');
          }

          // Check interaction allowlist for @mentions
          const mentions = extractMentions(text);
          if (mentions.length > 0) {
            const allowlistCheck = service.isInteractionAllowed(context.agentId, mentions, 'mention');
            if (!allowlistCheck.allowed) {
              return errorResult(allowlistCheck.reason || 'Mention not allowed');
            }
          }

          const result = await client.post(text);
          return successResult(`Posted successfully!\nURI: ${result.uri}`);
        }

        case 'reply': {
          const text = (params.text as string)?.trim();
          if (!text) {
            return errorResult('Reply text cannot be empty');
          }
          if (text.length > 300) {
            return errorResult('Reply text exceeds 300 character limit');
          }

          const postInput = params.post_uri as string;
          if (!postInput) {
            return errorResult('post_uri is required for reply action');
          }

          let postUri = convertToAtUri(postInput, 'post');
          if (!postUri) {
            postUri = postInput; // Assume it's already a valid AT URI
          }

          // Fetch the post to get CID and author
          const parentPost = await client.getPost(postUri);

          // Check interaction allowlist: author + any @mentions in reply
          const handlesToCheck = [parentPost.author.handle];
          const mentions = extractMentions(text);
          handlesToCheck.push(...mentions);

          if (handlesToCheck.length > 0) {
            const allowlistCheck = service.isInteractionAllowed(context.agentId, handlesToCheck, 'reply');
            if (!allowlistCheck.allowed) {
              return errorResult(allowlistCheck.reason || 'Reply not allowed to this user');
            }
          }

          const result = await client.reply(text, postUri, parentPost.cid);
          return successResult(`Replied successfully!\nURI: ${result.uri}`);
        }

        // ========================================
        // Read Actions
        // ========================================

        case 'read': {
          const source = (params.source as string)?.trim();
          if (!source) {
            return errorResult('source is required for read action');
          }

          // Detect or use explicit type
          let sourceType = params.source_type as 'feed' | 'author' | 'post' | undefined;
          if (!sourceType) {
            sourceType = detectInputType(source);
          }

          const limit = Math.min((params.limit as number) || 20, 50);
          const replyCount = (params.replies as number) || 0;
          const readThread = params.thread as boolean;

          // Handle single post
          if (sourceType === 'post') {
            let postUri = convertToAtUri(source, 'post');
            if (!postUri) {
              postUri = source;
            }

            if (!postUri.startsWith('at://')) {
              return errorResult(`Invalid post URI: "${source}". Expected AT URI (at://...) or Bluesky post URL (https://bsky.app/profile/.../post/...)`);
            }

            // Thread mode: traverse the author's reply chain
            if (readThread) {
              const threadPosts = await client.getAuthorThread(postUri, limit);
              return successResult(formatThread(threadPosts));
            }

            // Get post with optional replies
            const { post, replies } = replyCount > 0
              ? await client.getPostThread(postUri, replyCount)
              : { post: await client.getPost(postUri), replies: [] };

            // Try to get image descriptions using vision
            let imageDescriptions: string[] | undefined;
            if (post.images && post.images.length > 0) {
              const visionService = getVisionService(context);
              if (visionService && typeof visionService.describeImage === 'function') {
                imageDescriptions = [];
                for (const img of post.images) {
                  try {
                    const description = await visionService.describeImage(
                      context.agentId,
                      img.fullsize,
                      'Describe this image briefly and objectively.'
                    );
                    imageDescriptions.push(description);
                  } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    log.error('Failed to describe image', { error: errorMsg });
                    imageDescriptions.push(`(Vision analysis failed: ${errorMsg})`);
                  }
                }
              }
            }

            let output = formatPostDetailed(post, imageDescriptions);

            // Add replies if requested
            if (replies.length > 0) {
              output += `\n\n--- Replies (${replies.length}) ---\n`;
              output += replies.slice(0, replyCount).map(formatPost).join('\n');
            }

            return successResult(output);
          }

          // Handle author feed
          if (sourceType === 'author') {
            const handle = source.startsWith('@') ? source.slice(1) : source;
            const posts = await client.getAuthorFeed(handle, limit);

            if (posts.length === 0) {
              return successResult(`No posts found from @${handle}.`);
            }

            const formatted = posts.map(formatPost).join('\n\n');
            return successResult(`${posts.length} posts from @${handle}:\n\n${formatted}`);
          }

          // Handle feed (named feed or home)
          if (source.toLowerCase() === 'home') {
            const posts = await client.getTimeline(limit);

            if (posts.length === 0) {
              return successResult('No posts found in home timeline.');
            }

            const formatted = posts.map(formatPost).join('\n\n');
            return successResult(`${posts.length} posts from home timeline:\n\n${formatted}`);
          }

          // Look up named feed
          const namedFeed = service.getFeedByName(context.agentId, source);
          if (!namedFeed) {
            const availableFeeds = service.getFeeds(context.agentId);
            if (availableFeeds.length === 0) {
              return errorResult(`Feed "${source}" not found. No custom feeds are configured. Use "home" for your timeline or provide an author handle.`);
            }
            return errorResult(`Feed "${source}" not found. Available feeds: ${availableFeeds.map(f => f.name).join(', ')}. Or use "home" for your timeline.`);
          }

          // Convert web URL to AT URI if needed
          let feedUri = convertToAtUri(namedFeed.uri, 'feed');
          if (!feedUri) {
            feedUri = namedFeed.uri;
          }

          if (!feedUri.startsWith('at://')) {
            return errorResult(`Feed "${namedFeed.name}" has invalid URI. Expected AT URI or Bluesky web URL.`);
          }

          const posts = await client.getFeed(feedUri, limit);

          if (posts.length === 0) {
            return successResult(`No posts found in "${namedFeed.name}" feed.`);
          }

          const formatted = posts.map(formatPost).join('\n\n');
          return successResult(`${posts.length} posts from "${namedFeed.name}" feed:\n\n${formatted}`);
        }

        case 'search': {
          const query = (params.query as string)?.trim();
          if (!query) {
            return errorResult('query is required for search action');
          }

          const limit = (params.limit as number) || 20;
          const posts = await client.searchPosts(query, limit);

          if (posts.length === 0) {
            return successResult(`No posts found for query: "${query}"`);
          }

          const formatted = posts.map(formatPost).join('\n\n');
          return successResult(`Found ${posts.length} posts for "${query}":\n\n${formatted}`);
        }

        case 'notifications': {
          const limit = (params.limit as number) || 20;
          const notifications = await client.getNotifications(limit);

          if (notifications.length === 0) {
            return successResult('No notifications.');
          }

          const formatted = notifications.map(formatNotification).join('\n\n');
          return successResult(`${notifications.length} notifications:\n\n${formatted}`);
        }

        case 'list_feeds': {
          const feeds = service.getFeeds(context.agentId);

          if (feeds.length === 0) {
            return successResult('No custom feeds are configured. You can still use:\n- "home" for your home timeline\n- An author handle (e.g., "user.bsky.social") for a specific user\'s posts');
          }

          const formatted = feeds.map(feed => {
            let line = `- **${feed.name}**`;
            if (feed.description) {
              line += `: ${feed.description}`;
            }
            return line;
          }).join('\n');

          return successResult(`Available feeds (${feeds.length}):\n\n${formatted}\n\nUse action "read" with the feed name to read posts.`);
        }

        // ========================================
        // Profile Actions
        // ========================================

        case 'profile': {
          const user = params.user as string | undefined;
          const profile = await client.getProfile(user);

          const output = formatProfile(profile, true);
          return successResult(user ? output : `Your profile:\n\n${output}`);
        }

        case 'update_profile': {
          const displayName = params.display_name as string | undefined;
          const description = params.description as string | undefined;

          if (!displayName && !description) {
            return errorResult('At least one of display_name or description must be provided');
          }

          await client.updateProfile({
            displayName,
            description
          });

          const updates: string[] = [];
          if (displayName) updates.push(`display name to "${displayName}"`);
          if (description) updates.push(`bio to "${description.slice(0, 50)}${description.length > 50 ? '...' : ''}"`);

          return successResult(`Profile updated! Changed ${updates.join(' and ')}.`);
        }

        // ========================================
        // Follow Actions
        // ========================================

        case 'follow': {
          const user = (params.user as string)?.trim();
          if (!user) {
            return errorResult('user is required for follow action');
          }

          const unfollow = params.unfollow as boolean;

          if (unfollow) {
            // For unfollow, we need to get the follow URI from the profile
            const profile = await client.getProfile(user);

            if (!profile.followUri) {
              return errorResult(`You are not following ${user}`);
            }

            await client.unfollow(profile.followUri);
            return successResult(`Unfollowed ${user}.`);
          } else {
            // Resolve handle to DID if needed
            let did = user;
            if (!user.startsWith('did:')) {
              const handle = user.startsWith('@') ? user.slice(1) : user;
              did = await client.resolveHandle(handle);
            }

            await client.follow(did);
            return successResult(`Now following ${user}!`);
          }
        }

        case 'followers': {
          const type = params.type as 'followers' | 'following';
          if (!type) {
            return errorResult('type is required for followers action (followers or following)');
          }

          const user = params.user as string | undefined;
          const limit = Math.min((params.limit as number) || 20, 50);

          const profiles = type === 'followers'
            ? await client.getFollowers(user, limit)
            : await client.getFollowing(user, limit);

          if (profiles.length === 0) {
            const target = user ? `@${user}` : 'You';
            return successResult(type === 'followers'
              ? `${target} has no followers.`
              : `${target} ${user ? 'follows' : 'follow'} no one.`
            );
          }

          const formatted = profiles.map(p => `• ${formatProfile(p)}`).join('\n\n');
          const target = user ? `@${user}'s` : 'Your';

          return successResult(`${target} ${type} (${profiles.length}):\n\n${formatted}`);
        }

        // ========================================
        // DM Actions
        // ========================================

        case 'dm': {
          const dmAction = params.dm_action as 'send' | 'list_conversations' | 'read_conversation';
          if (!dmAction) {
            return errorResult('dm_action is required for dm action (send, list_conversations, read_conversation)');
          }

          const limit = (params.limit as number) || 20;

          switch (dmAction) {
            case 'send': {
              const recipient = (params.recipient as string)?.trim();
              const message = (params.message as string)?.trim();

              if (!recipient) {
                return errorResult('recipient is required for sending a DM');
              }
              if (!message) {
                return errorResult('message is required for sending a DM');
              }

              // Check interaction allowlist before sending DM
              const allowlistCheck = service.isInteractionAllowed(context.agentId, [recipient], 'dm');
              if (!allowlistCheck.allowed) {
                return errorResult(allowlistCheck.reason || 'DM not allowed to this recipient');
              }

              // Resolve handle to DID if needed
              let did = recipient;
              if (!recipient.startsWith('did:')) {
                const handle = recipient.startsWith('@') ? recipient.slice(1) : recipient;
                did = await client.resolveHandle(handle);
              }

              const result = await client.sendMessageToUser(did, message);
              return successResult(`DM sent to ${recipient}!\nMessage ID: ${result.id}`);
            }

            case 'list_conversations': {
              const conversations = await client.listConversations(limit);

              if (conversations.length === 0) {
                return successResult('No DM conversations found.');
              }

              const formatted = conversations.map(c => formatConversation(c)).join('\n\n---\n\n');
              return successResult(`${conversations.length} DM conversation(s):\n\n${formatted}`);
            }

            case 'read_conversation': {
              const convoId = params.conversation_id as string;

              if (!convoId) {
                return errorResult('conversation_id is required to read a conversation');
              }

              const messages = await client.getMessages(convoId, limit);

              if (messages.length === 0) {
                return successResult('No messages in this conversation.');
              }

              // Reverse to show oldest first
              const formatted = messages.reverse().map(m => formatMessage(m)).join('\n');
              return successResult(`${messages.length} message(s):\n\n${formatted}`);
            }

            default:
              return errorResult(`Unknown dm_action: ${dmAction}`);
          }
        }

        // ========================================
        // Account Actions
        // ========================================

        case 'account': {
          const accountAction = params.account_action as 'status' | 'enable_notifications' | 'disable_notifications';
          if (!accountAction) {
            return errorResult('account_action is required for account action (status, enable_notifications, disable_notifications)');
          }

          const session = client.getSession();

          switch (accountAction) {
            case 'status': {
              const notifStatus = service.getNotificationListenerStatus(context.agentId);
              const allowlist = service.getInteractionAllowlist(context.agentId);
              const allowlistEnabled = service.isInteractionAllowlistEnabled(context.agentId);

              let output = `Bluesky Account Status\n`;
              output += `───────────────────────\n`;
              output += `Handle: @${session?.handle || 'unknown'}\n`;
              output += `DID: ${session?.did || 'unknown'}\n`;
              output += `\nNotification Listener:\n`;
              output += `  Status: ${notifStatus.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
              output += `  Poll interval: ${notifStatus.pollIntervalMs / 1000}s\n`;
              if (notifStatus.lastChecked) {
                output += `  Last checked: ${notifStatus.lastChecked}\n`;
              }
              output += `\nInteraction Allowlist:\n`;
              if (allowlistEnabled && allowlist.length > 0) {
                output += `  Status: ✅ Enabled (${allowlist.length} handle${allowlist.length > 1 ? 's' : ''})\n`;
                output += `  Applies to: DMs, replies, @mentions\n`;
                output += `  Allowed: ${allowlist.map(h => `@${h}`).join(', ')}\n`;
              } else {
                output += `  Status: ❌ Disabled (can interact with anyone)\n`;
              }

              return successResult(output);
            }

            case 'enable_notifications': {
              await service.enableNotificationListener(context.agentId);
              return successResult('Notification listener enabled. You will receive system messages when you get new Bluesky notifications.');
            }

            case 'disable_notifications': {
              await service.disableNotificationListener(context.agentId);
              return successResult('Notification listener disabled. You will no longer receive automatic notification updates.');
            }

            default:
              return errorResult(`Unknown account_action: ${accountAction}`);
          }
        }

        default:
          return errorResult(`Unknown action: ${action}. Valid actions: post, reply, read, search, notifications, list_feeds, profile, update_profile, follow, followers, dm, account`);
      }
    } catch (error) {
      return errorResult(`Bluesky operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

// Export as array for module loader
export const tools: ToolDefinition[] = [blueskyTool];
