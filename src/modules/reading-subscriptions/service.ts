/**
 * Reading Subscriptions Service
 *
 * Singleton service managing per-agent blog/author subscriptions.
 * Polls feeds and notifies agents when new posts are published.
 */

import type { BaseService, ServiceContext } from '../../types/service.js';
import type { AgentId } from '../../types/agent.js';
import { createComponentLogger } from '../../core/logger.js';
import type {
  ReadingSubscriptionsConfig,
  ReadingSubscriptionsState,
  Subscription,
  AddSubscriptionOptions,
  DiscoveredPost,
  CheckResult,
  ParsedFeed,
  DetectedType,
} from './types.js';
import { DEFAULT_STATE, SERVICE_NAME, MAX_CONSECUTIVE_FAILURES } from './types.js';
import { tryParseFeed, detectFeedType } from './feed-parser.js';
import { scrapeHtmlForPosts, scrapeWhitewindBlog } from './html-scraper.js';

/** Default polling interval: 30 minutes */
const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_MAX_SUBSCRIPTIONS = 20;
const DEFAULT_MAX_SEEN_POSTS = 100;

const log = createComponentLogger('ReadingSubscriptions');

export default class ReadingSubscriptionsService implements BaseService {
  private context: ServiceContext | null = null;
  private agentConfigs: Map<AgentId, ReadingSubscriptionsConfig> = new Map();
  private pollTimers: Map<AgentId, NodeJS.Timeout> = new Map();

  /**
   * Initialize the service (global, once at startup)
   */
  async init(context: ServiceContext): Promise<void> {
    this.context = context;
    log.info('Service initialized');
  }

  /**
   * Initialize for a specific agent
   */
  async initAgent(agentId: AgentId, config: Record<string, unknown>): Promise<void> {
    if (!this.context) {
      throw new Error('Service not initialized');
    }

    // Store config
    const typedConfig: ReadingSubscriptionsConfig = {
      default_interval_minutes: (config.default_interval_minutes as number) ?? DEFAULT_INTERVAL_MINUTES,
      max_subscriptions: (config.max_subscriptions as number) ?? DEFAULT_MAX_SUBSCRIPTIONS,
      max_seen_posts: (config.max_seen_posts as number) ?? DEFAULT_MAX_SEEN_POSTS,
      auto_detect: (config.auto_detect as boolean) ?? true,
    };
    this.agentConfigs.set(agentId, typedConfig);

    // Get or initialize state
    const state = this.getAgentState(agentId);
    const subCount = Object.keys(state.subscriptions).length;

    log.info('Initialized for agent', { agentId, subscriptionCount: subCount });

    // Start polling if there are subscriptions
    if (subCount > 0) {
      this.startPolling(agentId);
    }
  }

  /**
   * Check if agent can reconnect from saved state
   */
  canReconnect(_agentId: AgentId, _state: Record<string, unknown>): boolean {
    return true; // State is persisted in DB
  }

  /**
   * Declare dependencies
   */
  dependsOn(): string[] {
    return ['web-reader'];
  }

  /**
   * Clean up resources for a specific agent
   */
  async cleanupAgent(agentId: AgentId): Promise<void> {
    this.stopPolling(agentId);
    this.agentConfigs.delete(agentId);
    log.info('Cleaned up for agent', { agentId });
  }

  /**
   * Clean up on service shutdown
   */
  async cleanup(): Promise<void> {
    // Stop all polling timers
    for (const [agentId] of this.pollTimers) {
      this.stopPolling(agentId);
    }
    log.info('Service cleaned up');
  }

  // ─────────────────────────────────────────────────────────────────
  // State Management
  // ─────────────────────────────────────────────────────────────────

  private getAgentState(agentId: AgentId): ReadingSubscriptionsState {
    if (!this.context) return { subscriptions: {}, seen_posts: {}, total_checks: 0, total_notifications_sent: 0 };
    const state = this.context.getState<ReadingSubscriptionsState>(agentId, SERVICE_NAME);
    // Deep copy to prevent shared references between agents
    // Using { ...DEFAULT_STATE } would share subscriptions/seen_posts objects
    return state.get() || { subscriptions: {}, seen_posts: {}, total_checks: 0, total_notifications_sent: 0 };
  }

  private saveAgentState(agentId: AgentId, newState: ReadingSubscriptionsState): void {
    if (!this.context) return;
    const state = this.context.getState<ReadingSubscriptionsState>(agentId, SERVICE_NAME);
    state.set(newState);
  }

  private async flushAgentState(agentId: AgentId): Promise<void> {
    if (!this.context) return;
    const state = this.context.getState<ReadingSubscriptionsState>(agentId, SERVICE_NAME);
    await state.flush();
  }

  // ─────────────────────────────────────────────────────────────────
  // Subscription Management
  // ─────────────────────────────────────────────────────────────────

  /**
   * Add a new subscription
   */
  async addSubscription(agentId: AgentId, options: AddSubscriptionOptions): Promise<Subscription> {
    const config = this.agentConfigs.get(agentId);
    const state = this.getAgentState(agentId);

    // Check subscription limit
    const subCount = Object.keys(state.subscriptions).length;
    const maxSubs = config?.max_subscriptions ?? DEFAULT_MAX_SUBSCRIPTIONS;
    if (subCount >= maxSubs) {
      throw new Error(`Maximum subscriptions (${maxSubs}) reached`);
    }

    // Normalize URL
    let url = options.url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Check for duplicate
    const existing = Object.values(state.subscriptions).find((s) => s.source_url === url);
    if (existing) {
      throw new Error(`Already subscribed to ${url}`);
    }

    // Detect source type if auto
    let detectedType: DetectedType | undefined;
    if (options.source_type === 'auto' || !options.source_type) {
      detectedType = await this.detectSourceType(url);
    }

    // Generate subscription ID
    const id = `sub-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Create subscription
    const subscription: Subscription = {
      id,
      name: options.name || this.extractDomainName(url),
      source_url: url,
      source_type: options.source_type || 'auto',
      detected_type: detectedType,
      check_interval_minutes: options.interval_minutes ?? config?.default_interval_minutes ?? DEFAULT_INTERVAL_MINUTES,
      enabled: true,
      created_at: new Date().toISOString(),
      check_count: 0,
      new_post_count: 0,
      consecutive_failures: 0,
    };

    // Perform initial fetch to populate seen_posts
    try {
      const feed = await this.fetchPosts(subscription);
      state.seen_posts[id] = feed.posts.slice(0, config?.max_seen_posts ?? DEFAULT_MAX_SEEN_POSTS).map((p) => p.id);
      subscription.last_checked_at = new Date().toISOString();
      subscription.check_count = 1;
      log.info('Initial fetch completed', { subscription: subscription.name, postsFound: feed.posts.length });
    } catch (error) {
      log.warn('Initial fetch failed', { url, error });
      state.seen_posts[id] = [];
    }

    // Save subscription
    state.subscriptions[id] = subscription;
    this.saveAgentState(agentId, state);
    await this.flushAgentState(agentId);

    // Start polling if this is the first subscription
    if (subCount === 0) {
      this.startPolling(agentId);
    }

    return subscription;
  }

  /**
   * Remove a subscription
   */
  async removeSubscription(agentId: AgentId, subscriptionId: string): Promise<boolean> {
    const state = this.getAgentState(agentId);

    if (!state.subscriptions[subscriptionId]) {
      return false;
    }

    delete state.subscriptions[subscriptionId];
    delete state.seen_posts[subscriptionId];
    this.saveAgentState(agentId, state);
    await this.flushAgentState(agentId);

    // Stop polling if no subscriptions left
    if (Object.keys(state.subscriptions).length === 0) {
      this.stopPolling(agentId);
    }

    return true;
  }

  /**
   * Pause a subscription
   */
  async pauseSubscription(agentId: AgentId, subscriptionId: string): Promise<boolean> {
    const state = this.getAgentState(agentId);
    const sub = state.subscriptions[subscriptionId];

    if (!sub) return false;

    sub.enabled = false;
    sub.auto_paused = false; // Clear auto-pause flag if manually pausing
    this.saveAgentState(agentId, state);

    return true;
  }

  /**
   * Resume a subscription
   */
  async resumeSubscription(agentId: AgentId, subscriptionId: string): Promise<boolean> {
    const state = this.getAgentState(agentId);
    const sub = state.subscriptions[subscriptionId];

    if (!sub) return false;

    sub.enabled = true;
    sub.auto_paused = false;
    sub.consecutive_failures = 0;
    sub.last_error = undefined;
    this.saveAgentState(agentId, state);

    return true;
  }

  /**
   * Reset a subscription's seen posts
   * Used to recover from corrupted state (e.g., mixed ID formats)
   * Performs a fresh fetch to repopulate seen_posts with consistent IDs
   */
  async resetSubscription(agentId: AgentId, subscriptionId: string): Promise<{ success: boolean; postsFound?: number; error?: string }> {
    const state = this.getAgentState(agentId);
    const config = this.agentConfigs.get(agentId);
    const sub = state.subscriptions[subscriptionId];

    if (!sub) {
      return { success: false, error: 'Subscription not found' };
    }

    try {
      // Clear existing seen posts and re-fetch to get fresh IDs
      log.info('Resetting subscription seen posts', { subscription: sub.name, subscriptionId });

      const feed = await this.fetchPosts(sub);
      const maxSeen = config?.max_seen_posts ?? DEFAULT_MAX_SEEN_POSTS;

      // Replace seen_posts with fresh IDs from current fetch
      state.seen_posts[subscriptionId] = feed.posts.slice(0, maxSeen).map((p) => p.id);

      // Update subscription metadata
      sub.last_checked_at = new Date().toISOString();
      sub.check_count++;
      sub.consecutive_failures = 0;
      sub.last_error = undefined;

      // Update detected type to match what we actually got
      if (!sub.detected_type) {
        sub.detected_type = feed.type;
      }

      this.saveAgentState(agentId, state);
      await this.flushAgentState(agentId);

      log.info('Subscription reset complete', {
        subscription: sub.name,
        postsFound: feed.posts.length,
        detectedType: sub.detected_type
      });

      return { success: true, postsFound: feed.posts.length };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error('Failed to reset subscription', { subscription: sub.name, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * List all subscriptions for an agent
   */
  listSubscriptions(agentId: AgentId): Subscription[] {
    const state = this.getAgentState(agentId);
    return Object.values(state.subscriptions);
  }

  /**
   * Get a single subscription by ID
   */
  getSubscription(agentId: AgentId, subscriptionId: string): Subscription | null {
    const state = this.getAgentState(agentId);
    return state.subscriptions[subscriptionId] || null;
  }

  // ─────────────────────────────────────────────────────────────────
  // Polling
  // ─────────────────────────────────────────────────────────────────

  /**
   * Start polling for an agent
   */
  private startPolling(agentId: AgentId): void {
    // Don't start if already polling
    if (this.pollTimers.has(agentId)) {
      return;
    }

    const config = this.agentConfigs.get(agentId);
    const intervalMs = (config?.default_interval_minutes ?? DEFAULT_INTERVAL_MINUTES) * 60 * 1000;

    log.info('Starting polling', { agentId, intervalMinutes: intervalMs / 60000 });

    const timer = setInterval(() => {
      this.pollAndNotify(agentId).catch((error) => {
        log.error('Poll error', { agentId, error });
      });
    }, intervalMs);

    this.pollTimers.set(agentId, timer);
  }

  /**
   * Stop polling for an agent
   */
  private stopPolling(agentId: AgentId): void {
    const timer = this.pollTimers.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(agentId);
      log.info('Stopped polling', { agentId });
    }
  }

  /**
   * Poll all subscriptions and notify agent of new posts
   */
  private async pollAndNotify(agentId: AgentId): Promise<void> {
    const state = this.getAgentState(agentId);
    const config = this.agentConfigs.get(agentId);
    const enabledSubs = Object.values(state.subscriptions).filter((s) => s.enabled && !s.auto_paused);

    if (enabledSubs.length === 0) {
      return;
    }

    log.debug('Polling subscriptions', { agentId, count: enabledSubs.length });

    const allNewPosts: Array<{ subscription: Subscription; posts: DiscoveredPost[] }> = [];

    for (const sub of enabledSubs) {
      try {
        const result = await this.checkSubscriptionInternal(agentId, sub, state, config);
        if (result.new_posts.length > 0) {
          allNewPosts.push({ subscription: result.subscription, posts: result.new_posts });
        }
      } catch (error) {
        log.error('Error checking subscription', { subscription: sub.name, error });
      }
    }

    // Notify agent if there are new posts (before saving, so counter update is included)
    if (allNewPosts.length > 0) {
      await this.notifyAgent(agentId, allNewPosts, state);
    }

    // Save updated state (includes seen_posts AND notification count)
    this.saveAgentState(agentId, state);
  }

  /**
   * Force check a specific subscription (or all if no ID provided)
   */
  async checkSubscription(agentId: AgentId, subscriptionId?: string): Promise<CheckResult[]> {
    const state = this.getAgentState(agentId);
    const config = this.agentConfigs.get(agentId);
    const results: CheckResult[] = [];

    const subsToCheck = subscriptionId
      ? [state.subscriptions[subscriptionId]].filter(Boolean)
      : Object.values(state.subscriptions);

    for (const sub of subsToCheck) {
      const result = await this.checkSubscriptionInternal(agentId, sub, state, config);
      results.push(result);
    }

    // Notify agent of new posts (before saving, so counter update is included)
    const newPosts = results.filter((r) => r.new_posts.length > 0).map((r) => ({
      subscription: r.subscription,
      posts: r.new_posts,
    }));

    if (newPosts.length > 0) {
      await this.notifyAgent(agentId, newPosts, state);
    }

    // Save updated state (includes seen_posts AND notification count)
    this.saveAgentState(agentId, state);

    return results;
  }

  /**
   * Internal method to check a single subscription
   */
  private async checkSubscriptionInternal(
    agentId: AgentId,
    sub: Subscription,
    state: ReadingSubscriptionsState,
    config: ReadingSubscriptionsConfig | undefined
  ): Promise<CheckResult> {
    try {
      const feed = await this.fetchPosts(sub);
      const seenPosts = state.seen_posts[sub.id] || [];
      const maxSeen = config?.max_seen_posts ?? DEFAULT_MAX_SEEN_POSTS;

      // Find new posts (not in seen list)
      const newPosts = feed.posts.filter((p) => !seenPosts.includes(p.id));

      // Log for debugging ID consistency issues
      if (newPosts.length > 0 && seenPosts.length > 0) {
        log.debug('Post ID comparison', {
          subscription: sub.name,
          detectedType: sub.detected_type,
          feedType: feed.type,
          totalPosts: feed.posts.length,
          seenPostsCount: seenPosts.length,
          newPostsCount: newPosts.length,
          sampleFeedId: feed.posts[0]?.id,
          sampleSeenId: seenPosts[0],
        });
      }

      // Update seen posts (add new ones, trim to max)
      const updatedSeen = [...newPosts.map((p) => p.id), ...seenPosts].slice(0, maxSeen);
      state.seen_posts[sub.id] = updatedSeen;

      // Update subscription stats
      sub.last_checked_at = new Date().toISOString();
      sub.check_count++;
      sub.consecutive_failures = 0;
      sub.last_error = undefined;
      state.total_checks++;

      if (newPosts.length > 0) {
        sub.last_new_post_at = new Date().toISOString();
        sub.new_post_count += newPosts.length;
      }

      // Update detected type if not set
      if (!sub.detected_type) {
        sub.detected_type = feed.type;
      }

      return { subscription: sub, new_posts: newPosts, success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Update failure tracking
      sub.consecutive_failures++;
      sub.last_error = errorMsg;

      // Auto-pause if too many failures
      if (sub.consecutive_failures >= MAX_CONSECUTIVE_FAILURES) {
        sub.auto_paused = true;
        sub.enabled = false;
        log.warn('Auto-paused subscription due to failures', { subscription: sub.name, failures: sub.consecutive_failures });
      }

      return { subscription: sub, new_posts: [], success: false, error: errorMsg };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Fetching
  // ─────────────────────────────────────────────────────────────────

  /**
   * Fetch posts from a subscription
   *
   * IMPORTANT: Once a feed type is detected, we MUST NOT fall back to a different
   * parsing strategy. RSS/Atom feeds use guid-based IDs while HTML scraping uses
   * URL-based IDs. Mixing strategies would cause all posts to appear "new" on every
   * check because the ID formats are incompatible.
   */
  private async fetchPosts(sub: Subscription): Promise<ParsedFeed> {
    const type = sub.detected_type || sub.source_type;

    // If we have a known feed type (rss/atom), ONLY use feed parsing - no fallback
    // This prevents ID format mismatches that cause "carousel" of old posts
    if (type === 'rss' || type === 'atom') {
      const feed = await tryParseFeed(sub.source_url);
      if (feed && feed.posts.length > 0) {
        return feed;
      }
      // Feed parsing failed - throw instead of falling back to HTML
      // This will increment consecutive_failures and eventually auto-pause
      throw new Error(`Failed to parse ${type.toUpperCase()} feed - feed may be temporarily unavailable`);
    }

    // If we know it's HTML, go straight to scraping
    if (type === 'html') {
      return await this.scrapeHtml(sub);
    }

    // Type is 'auto' - try feed first, then fall back to HTML
    const feed = await tryParseFeed(sub.source_url);
    if (feed && feed.posts.length > 0) {
      return feed;
    }

    // Fall back to HTML scraping for 'auto' type
    return await this.scrapeHtml(sub);
  }

  /**
   * Scrape HTML for posts using web-reader service
   */
  private async scrapeHtml(sub: Subscription): Promise<ParsedFeed> {
    const webReaderService = this.context?.getService('web-reader');
    if (!webReaderService) {
      throw new Error('web-reader service not available');
    }

    // Cast to the interface we need (BaseService doesn't expose fetchPage)
    const webReader = webReaderService as unknown as {
      fetchPage: (url: string, forceRefresh?: boolean) => Promise<{
        page: { url: string; title: string; content: string; fetchedAt: string };
        fromCache: boolean;
      }>;
    };

    // Use specialized scraper for WhiteWind
    if (sub.source_url.includes('whtwnd.com')) {
      return await scrapeWhitewindBlog(sub.source_url, webReader);
    }

    return await scrapeHtmlForPosts(sub.source_url, webReader);
  }

  /**
   * Detect the source type for a URL
   */
  private async detectSourceType(url: string): Promise<DetectedType> {
    // Try to detect RSS/Atom feed
    const feedType = await detectFeedType(url);
    if (feedType) {
      return feedType;
    }

    // Try to parse as feed (might be a direct feed URL)
    const feed = await tryParseFeed(url);
    if (feed && feed.posts.length > 0) {
      return feed.type;
    }

    // Default to HTML scraping
    return 'html';
  }

  // ─────────────────────────────────────────────────────────────────
  // Notifications
  // ─────────────────────────────────────────────────────────────────

  /**
   * Notify agent of new posts
   * @param state - The current state object (to avoid race conditions with debounced saves)
   */
  private async notifyAgent(
    agentId: AgentId,
    newPosts: Array<{ subscription: Subscription; posts: DiscoveredPost[] }>,
    state: ReadingSubscriptionsState
  ): Promise<void> {
    const lettaManager = this.context?.getLettaManager?.();
    if (!lettaManager) {
      log.warn('LettaManager not available', { agentId });
      return;
    }

    const message = this.formatNotificationMessage(newPosts);

    try {
      await lettaManager.chat(agentId, message, { role: 'system' });

      // Update notification count (using passed state to avoid race condition)
      state.total_notifications_sent++;

      const totalPosts = newPosts.reduce((sum, np) => sum + np.posts.length, 0);
      log.info('Notified agent of new posts', { agentId, postCount: totalPosts });
    } catch (error) {
      log.error('Failed to notify agent', { agentId, error });
    }
  }

  /**
   * Format notification message for agent
   */
  private formatNotificationMessage(
    newPosts: Array<{ subscription: Subscription; posts: DiscoveredPost[] }>
  ): string {
    const totalPosts = newPosts.reduce((sum, np) => sum + np.posts.length, 0);
    const lines: string[] = [
      '[NEW POSTS]',
      `Found ${totalPosts} new post${totalPosts > 1 ? 's' : ''} from ${newPosts.length} subscription${newPosts.length > 1 ? 's' : ''}:`,
      '',
    ];

    for (const { subscription, posts } of newPosts) {
      lines.push(`**${subscription.name}**`);

      // Show up to 5 posts per subscription
      const displayPosts = posts.slice(0, 5);
      for (const post of displayPosts) {
        lines.push(`  - "${post.title}"`);
        lines.push(`    ${post.url}`);
        if (post.published_at) {
          const date = new Date(post.published_at);
          lines.push(`    Published: ${date.toLocaleDateString()}`);
        }
      }

      if (posts.length > 5) {
        lines.push(`  ... and ${posts.length - 5} more`);
      }

      lines.push('');
    }

    lines.push('You can use web_read to read any of these posts.');

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────

  /**
   * Extract a display name from a URL
   */
  private extractDomainName(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove www. prefix
      let hostname = parsed.hostname.replace(/^www\./, '');

      // Extract the main domain part
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        hostname = parts.slice(-2).join('.');
      }

      return hostname;
    } catch {
      return url;
    }
  }
}
