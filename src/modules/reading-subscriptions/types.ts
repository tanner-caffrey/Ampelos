/**
 * Reading Subscriptions Module Types
 *
 * Defines interfaces for subscription management, post discovery,
 * and state persistence.
 */

/** Supported source types for subscription detection */
export type SourceType = 'rss' | 'atom' | 'html' | 'auto';

/** Detected source type after auto-detection */
export type DetectedType = 'rss' | 'atom' | 'html';

/**
 * A subscription to an author/blog
 */
export interface Subscription {
  /** Unique subscription ID */
  id: string;
  /** Display name for the author/blog */
  name: string;
  /** Feed URL or page URL to check */
  source_url: string;
  /** Configured source type (auto = detect automatically) */
  source_type: SourceType;
  /** Actual detected type after first fetch */
  detected_type?: DetectedType;
  /** Check interval in minutes */
  check_interval_minutes: number;
  /** Whether subscription is active */
  enabled: boolean;
  /** ISO timestamp when subscription was created */
  created_at: string;
  /** ISO timestamp of last successful check */
  last_checked_at?: string;
  /** ISO timestamp when we last found a new post */
  last_new_post_at?: string;
  /** Number of times we've checked this subscription */
  check_count: number;
  /** Number of new posts found since subscription created */
  new_post_count: number;
  /** Consecutive failures (for auto-pause) */
  consecutive_failures: number;
  /** Last error message if any */
  last_error?: string;
  /** Whether auto-paused due to errors */
  auto_paused?: boolean;
}

/**
 * A discovered post from a feed or scraped page
 */
export interface DiscoveredPost {
  /** Unique identifier (usually URL or guid) */
  id: string;
  /** Post title */
  title: string;
  /** Full URL to the post */
  url: string;
  /** ISO timestamp when published (if available) */
  published_at?: string;
  /** Author name (if available) */
  author?: string;
  /** Brief excerpt or summary */
  summary?: string;
}

/**
 * Result from parsing a feed or scraping a page
 */
export interface ParsedFeed {
  /** Feed/site title */
  title: string;
  /** Feed/site URL */
  url: string;
  /** Discovered posts */
  posts: DiscoveredPost[];
  /** Detected type */
  type: DetectedType;
}

/**
 * Per-agent state persisted to database
 */
export interface ReadingSubscriptionsState {
  /** Map of subscription ID to subscription */
  subscriptions: Record<string, Subscription>;
  /** Map of subscription ID to array of seen post IDs */
  seen_posts: Record<string, string[]>;
  /** Total number of checks performed */
  total_checks: number;
  /** Total notifications sent to agent */
  total_notifications_sent: number;
}

/**
 * Module configuration from agent config
 */
export interface ReadingSubscriptionsConfig {
  /** Default check interval in minutes (default: 30) */
  default_interval_minutes?: number;
  /** Maximum subscriptions per agent (default: 20) */
  max_subscriptions?: number;
  /** Maximum seen posts to store per subscription (default: 100) */
  max_seen_posts?: number;
  /** Enable auto-detection of source type (default: true) */
  auto_detect?: boolean;
}

/**
 * Options for adding a new subscription
 */
export interface AddSubscriptionOptions {
  /** URL of feed or blog */
  url: string;
  /** Display name for the author/blog */
  name?: string;
  /** Source type (default: auto) */
  source_type?: SourceType;
  /** Check interval in minutes (uses config default if not specified) */
  interval_minutes?: number;
}

/**
 * Result from checking subscriptions
 */
export interface CheckResult {
  /** Subscription that was checked */
  subscription: Subscription;
  /** New posts found (empty if none) */
  new_posts: DiscoveredPost[];
  /** Whether check was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/** Default state for new agents */
export const DEFAULT_STATE: ReadingSubscriptionsState = {
  subscriptions: {},
  seen_posts: {},
  total_checks: 0,
  total_notifications_sent: 0,
};

/** Maximum consecutive failures before auto-pause */
export const MAX_CONSECUTIVE_FAILURES = 5;

/** Service name for state namespacing */
export const SERVICE_NAME = 'reading-subscriptions';
