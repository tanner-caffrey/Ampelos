/**
 * Bluesky Module Types
 *
 * TypeScript interfaces for the Bluesky/ATProto integration.
 */

/**
 * Named feed configuration
 */
export interface NamedFeed {
  /** Display name for the feed (used by agents to reference it) */
  name: string;
  /** AT URI of the feed generator (e.g., 'at://did:plc:.../app.bsky.feed.generator/whats-hot') */
  uri: string;
  /** Optional description */
  description?: string;
}

/**
 * Configuration for the notification listener
 */
export interface NotificationListenerConfig {
  /** Whether the notification listener is enabled (default: true) */
  enabled?: boolean;
  /** Polling interval in milliseconds (default: 60000 = 1 minute) */
  pollIntervalMs?: number;
  /** Which notification types to send to the agent */
  notifyTypes?: ('like' | 'repost' | 'follow' | 'mention' | 'reply' | 'quote')[];
}

/**
 * Configuration for the DM listener
 */
export interface DmListenerConfig {
  /** Whether the DM listener is enabled (default: true) */
  enabled?: boolean;
  /** Polling interval in milliseconds (default: 10000 = 10 seconds) */
  pollIntervalMs?: number;
}

/**
 * Configuration for DM allowlist
 * @deprecated Use interaction_allowlist instead for unified control
 */
export interface DmAllowlistConfig {
  /** If true, DMs can only be sent to handles in the allowlist */
  enabled: boolean;
  /** List of handles that can be DMed (without @ prefix) */
  handles: string[];
}

/**
 * Unified interaction allowlist configuration
 * Controls who the agent can DM, reply to, and mention
 */
export interface InteractionAllowlistConfig {
  /** If true, interactions are restricted to handles in the allowlist */
  enabled: boolean;
  /** List of handles the agent can interact with (without @ prefix) */
  handles: string[];
}

/**
 * Configuration for the Bluesky module (from agents.json)
 */
export interface BlueskyConfig {
  /** Bluesky handle (e.g., 'user.bsky.social') */
  handle: string;
  /** PDS service URL (default: 'https://bsky.social') */
  service?: string;
  /** Named feeds the agent can access */
  feeds?: NamedFeed[];
  /** Notification listener configuration */
  notification_listener?: NotificationListenerConfig;
  /** DM listener configuration */
  dm_listener?: DmListenerConfig;
  /**
   * Unified interaction allowlist - restrict who the agent can DM, reply to, and mention
   * This is the recommended way to control agent interactions
   */
  interaction_allowlist?: InteractionAllowlistConfig;
  /**
   * DM allowlist - restrict who the agent can DM
   * @deprecated Use interaction_allowlist instead
   */
  dm_allowlist?: DmAllowlistConfig;
}

/**
 * State persisted for each agent
 */
export interface BlueskyState {
  initialized: boolean;
  handle?: string;
  did?: string;
  session_created_at?: string;
  /** Whether the notification listener is currently enabled */
  notification_listener_enabled?: boolean;
  /** Timestamp of the last notification we've seen (for deduplication) */
  last_notification_seen?: string;
  /** Whether the DM listener is currently enabled */
  dm_listener_enabled?: boolean;
  /** Timestamp of the last DM we've seen (for deduplication) */
  last_dm_seen?: string;
}

/**
 * Image attachment on a post
 */
export interface BlueskyImage {
  /** Alt text for the image */
  alt: string;
  /** Full-size image URL */
  fullsize: string;
  /** Thumbnail URL */
  thumb: string;
}

/**
 * Bluesky post representation
 */
export interface BlueskyPost {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
  };
  text: string;
  createdAt: string;
  replyCount: number;
  repostCount: number;
  likeCount: number;
  /** If this is a reply, the parent post info */
  replyTo?: {
    uri: string;
    cid: string;
  };
  /** Image attachments */
  images?: BlueskyImage[];
}

/**
 * Bluesky notification
 */
export interface BlueskyNotification {
  uri: string;
  reason: 'like' | 'repost' | 'follow' | 'mention' | 'reply' | 'quote';
  author: {
    did: string;
    handle: string;
    displayName?: string;
  };
  indexedAt: string;
  isRead: boolean;
  /** For reply/quote notifications, the text content */
  text?: string;
  /** The post this notification is about (for likes, reposts, replies) */
  subjectUri?: string;
}

/**
 * Result of creating a post
 */
export interface PostResult {
  uri: string;
  cid: string;
}

/**
 * Options for reading a feed
 */
export interface FeedOptions {
  /** Feed type: 'home' for timeline, 'author' for specific user */
  type: 'home' | 'author';
  /** Handle for author feed (required if type is 'author') */
  author?: string;
  /** Number of posts to fetch (default: 20, max: 50) */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
}

/**
 * Options for searching posts
 */
export interface SearchOptions {
  /** Search query */
  query: string;
  /** Max results (default: 20) */
  limit?: number;
  /** Sort order */
  sort?: 'top' | 'latest';
  /** Pagination cursor */
  cursor?: string;
}

/**
 * Options for getting notifications
 */
export interface NotificationOptions {
  /** Max notifications (default: 20) */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
}

// ============================================================================
// Profile Types
// ============================================================================

/**
 * Bluesky user profile
 */
export interface BlueskyProfile {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  banner?: string;
  followersCount: number;
  followsCount: number;
  postsCount: number;
  /** Whether the authenticated user follows this profile */
  isFollowing?: boolean;
  /** Whether this profile follows the authenticated user */
  isFollowedBy?: boolean;
  /** The follow record URI if following (needed for unfollowing) */
  followUri?: string;
}

/**
 * Data for updating a profile
 */
export interface ProfileUpdateData {
  displayName?: string;
  description?: string;
}

// ============================================================================
// DM (Direct Message) Types
// ============================================================================

/**
 * A DM conversation member
 */
export interface ConversationMember {
  did: string;
  handle: string;
  displayName?: string;
}

/**
 * A DM conversation
 */
export interface BlueskyConversation {
  id: string;
  members: ConversationMember[];
  lastMessage?: {
    text: string;
    sentAt: string;
    senderDid: string;
  };
  unreadCount: number;
  muted: boolean;
}

/**
 * A single DM message
 */
export interface BlueskyMessage {
  id: string;
  text: string;
  sender: ConversationMember;
  sentAt: string;
  conversationId: string;
}

/**
 * Result of sending a DM
 */
export interface SendMessageResult {
  id: string;
  conversationId: string;
}

// ============================================================================
// Tool Action Types
// ============================================================================

/**
 * All available actions for the consolidated bluesky tool
 */
export type BlueskyAction =
  | 'post'
  | 'reply'
  | 'read'
  | 'search'
  | 'notifications'
  | 'list_feeds'
  | 'profile'
  | 'update_profile'
  | 'follow'
  | 'followers'
  | 'dm'
  | 'account';

/**
 * Sub-actions for DM operations
 */
export type DmAction = 'send' | 'list_conversations' | 'read_conversation';

/**
 * Sub-actions for account operations
 */
export type AccountAction = 'status' | 'enable_notifications' | 'disable_notifications';
