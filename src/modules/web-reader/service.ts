/**
 * Web Reader Service (Singleton)
 *
 * Fetches and caches web pages for agents.
 * This is a global singleton - the cache is shared across all agents.
 */

import type { BaseService, ServiceContext } from '../../types/service.js';
import type { AgentId } from '../../types/agent.js';
import { createComponentLogger } from '../../core/logger.js';
import type {
  WebReaderConfig,
  CachedPage,
  JinaReaderResponse,
  RedditPost,
  RedditComment,
  RedditListingResponse,
  SubredditResult,
  RedditPostResult,
} from './types.js';

const SERVICE_NAME = 'web-reader';
const log = createComponentLogger('WebReader');

const JINA_READER_BASE = 'https://r.jina.ai/';
const REDDIT_BASE = 'https://www.reddit.com';
const REDDIT_USER_AGENT = 'Ampelos/1.0 (MCP Server)';

interface WebReaderState {
  cache: Record<string, CachedPage>;
}

const DEFAULT_STATE: WebReaderState = {
  cache: {}
};

class WebReaderService implements BaseService {
  private context?: ServiceContext;
  private config: WebReaderConfig = {
    cache_ttl_minutes: 60,
    max_cached_pages: 50
  };

  /**
   * Initialize the service (global, once at startup)
   */
  async init(context: ServiceContext): Promise<void> {
    this.context = context;
    log.info('Service initialized (global singleton)');
  }

  /**
   * Initialize for a specific agent - just sets config
   */
  async initAgent(agentId: AgentId, config: Record<string, unknown>): Promise<void> {
    // Update config from agent config (last one wins, but should be same across agents)
    this.config = {
      cache_ttl_minutes: (config.cache_ttl_minutes as number) ?? 60,
      max_cached_pages: (config.max_cached_pages as number) ?? 50,
    };

    // Clean expired entries on init
    this.cleanExpiredEntries();

    const state = this.getGlobalState();
    log.info('Initialized for agent', { agentId, cachedPages: Object.keys(state.cache).length });
  }

  /**
   * Check if an agent can reconnect
   */
  canReconnect(_agentId: AgentId, _state: Record<string, unknown>): boolean {
    return true; // No per-agent state needed
  }

  async cleanup(): Promise<void> {
    // State is auto-persisted
  }

  /**
   * Get global state (shared cache)
   */
  private getGlobalState(): WebReaderState {
    if (!this.context) {
      return DEFAULT_STATE;
    }
    const state = this.context.getGlobalState<WebReaderState>(SERVICE_NAME);
    return state.get() || DEFAULT_STATE;
  }

  /**
   * Save global state
   */
  private saveGlobalState(newState: WebReaderState): void {
    if (!this.context) return;
    const state = this.context.getGlobalState<WebReaderState>(SERVICE_NAME);
    state.set(newState);
  }

  /**
   * Fetch a web page and return its content as markdown.
   * Uses cache if available and not expired.
   */
  async fetchPage(
    url: string,
    forceRefresh = false
  ): Promise<{ page: CachedPage; fromCache: boolean }> {
    // Normalize URL
    const normalizedUrl = this.normalizeUrl(url);

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.getCachedPage(normalizedUrl);
      if (cached) {
        return { page: cached, fromCache: true };
      }
    }

    // Fetch from Jina Reader API
    const page = await this.fetchFromJina(normalizedUrl);

    // Cache the result
    await this.cachePage(page);

    return { page, fromCache: false };
  }

  /**
   * Get a cached page if it exists and is not expired.
   */
  private getCachedPage(url: string): CachedPage | null {
    const state = this.getGlobalState();
    const cached = state.cache[url];
    if (!cached) {
      return null;
    }

    // Check TTL (0 = never expires)
    if (this.config.cache_ttl_minutes > 0) {
      const fetchedAt = new Date(cached.fetchedAt).getTime();
      const expiresAt = fetchedAt + this.config.cache_ttl_minutes * 60 * 1000;
      if (Date.now() > expiresAt) {
        // Expired, remove from cache
        delete state.cache[url];
        this.saveGlobalState(state);
        return null;
      }
    }

    return cached;
  }

  /**
   * Fetch a page from Jina Reader API.
   */
  private async fetchFromJina(url: string): Promise<CachedPage> {
    const jinaUrl = JINA_READER_BASE + url;

    const response = await fetch(jinaUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Jina Reader allows 20 requests/minute without an API key.');
      }
      throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as JinaReaderResponse;

    if (data.code !== 200) {
      throw new Error(`Jina Reader error: ${data.status}`);
    }

    return {
      url: data.data.url,
      title: data.data.title || 'Untitled',
      content: data.data.content,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Cache a page, evicting oldest if necessary.
   */
  private async cachePage(page: CachedPage): Promise<void> {
    const state = this.getGlobalState();

    // Check if we need to evict (0 = unlimited)
    if (this.config.max_cached_pages > 0) {
      const cacheSize = Object.keys(state.cache).length;
      if (cacheSize >= this.config.max_cached_pages) {
        this.evictOldest(state);
      }
    }

    state.cache[page.url] = page;
    this.saveGlobalState(state);
  }

  /**
   * Evict the oldest cached page.
   */
  private evictOldest(state: WebReaderState): void {
    let oldestUrl: string | null = null;
    let oldestTime = Infinity;

    for (const [url, page] of Object.entries(state.cache)) {
      const fetchedAt = new Date(page.fetchedAt).getTime();
      if (fetchedAt < oldestTime) {
        oldestTime = fetchedAt;
        oldestUrl = url;
      }
    }

    if (oldestUrl) {
      delete state.cache[oldestUrl];
    }
  }

  /**
   * Clean expired entries from cache.
   */
  private cleanExpiredEntries(): void {
    if (this.config.cache_ttl_minutes <= 0) {
      return; // No expiry
    }

    const state = this.getGlobalState();
    const now = Date.now();
    const ttlMs = this.config.cache_ttl_minutes * 60 * 1000;
    let changed = false;

    for (const [url, page] of Object.entries(state.cache)) {
      const fetchedAt = new Date(page.fetchedAt).getTime();
      if (now > fetchedAt + ttlMs) {
        delete state.cache[url];
        changed = true;
      }
    }

    if (changed) {
      this.saveGlobalState(state);
    }
  }

  /**
   * Normalize a URL for consistent caching.
   */
  private normalizeUrl(url: string): string {
    // Add https:// if no protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    return url;
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; urls: string[] } {
    const state = this.getGlobalState();
    return {
      size: Object.keys(state.cache).length,
      urls: Object.keys(state.cache),
    };
  }

  /**
   * Clear the cache.
   */
  async clearCache(): Promise<void> {
    this.saveGlobalState({ cache: {} });
  }

  // ============================================
  // Reddit Methods
  // ============================================

  /**
   * Browse a subreddit and get posts.
   */
  async browseSubreddit(
    subreddit: string,
    options: {
      sort?: 'hot' | 'new' | 'top' | 'rising';
      limit?: number;
      timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    } = {}
  ): Promise<SubredditResult> {
    const { sort = 'hot', limit = 10, timeframe = 'day' } = options;

    // Clean subreddit name (remove r/ prefix if present)
    const cleanSubreddit = subreddit.replace(/^r\//, '').toLowerCase();

    // Build URL
    let url = `${REDDIT_BASE}/r/${cleanSubreddit}/${sort}.json?limit=${Math.min(limit, 25)}`;
    if (sort === 'top') {
      url += `&t=${timeframe}`;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': REDDIT_USER_AGENT,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Reddit rate limit exceeded. Try again in a minute.');
      }
      if (response.status === 404) {
        throw new Error(`Subreddit r/${cleanSubreddit} not found.`);
      }
      if (response.status === 403) {
        throw new Error(`Subreddit r/${cleanSubreddit} is private or quarantined.`);
      }
      throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as RedditListingResponse;

    const posts: RedditPost[] = data.data.children
      .filter((child) => child.kind === 't3') // t3 = post
      .map((child) => child.data);

    return {
      subreddit: cleanSubreddit,
      posts,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Get a specific Reddit post with its comments.
   */
  async getRedditPost(
    subreddit: string,
    postId: string,
    options: {
      commentLimit?: number;
      commentSort?: 'best' | 'top' | 'new' | 'controversial';
    } = {}
  ): Promise<RedditPostResult> {
    const { commentLimit = 20, commentSort = 'best' } = options;

    // Clean inputs
    const cleanSubreddit = subreddit.replace(/^r\//, '').toLowerCase();
    const cleanPostId = postId.replace(/^t3_/, ''); // Remove type prefix if present

    const url = `${REDDIT_BASE}/r/${cleanSubreddit}/comments/${cleanPostId}.json?limit=${commentLimit}&sort=${commentSort}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': REDDIT_USER_AGENT,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Reddit rate limit exceeded. Try again in a minute.');
      }
      if (response.status === 404) {
        throw new Error(`Post not found in r/${cleanSubreddit}.`);
      }
      throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
    }

    // Reddit returns an array: [post listing, comments listing]
    const data = (await response.json()) as [RedditListingResponse, RedditListingResponse];

    const postData = data[0].data.children[0]?.data;
    if (!postData) {
      throw new Error('Post data not found in response.');
    }

    // Parse comments (they can be nested)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comments = this.parseRedditComments(data[1].data.children as any, 0);

    return {
      post: postData,
      comments: comments.slice(0, commentLimit),
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Parse Reddit comments recursively.
   */
  private parseRedditComments(
    children: Array<{ kind: string; data: Record<string, unknown> }>,
    depth: number
  ): RedditComment[] {
    const comments: RedditComment[] = [];

    for (const child of children) {
      // t1 = comment, skip "more" placeholders
      if (child.kind !== 't1') continue;

      const data = child.data;
      const comment: RedditComment = {
        id: data.id as string,
        author: data.author as string,
        body: data.body as string,
        score: data.score as number,
        created_utc: data.created_utc as number,
        depth,
      };

      // Parse nested replies
      const replies = data.replies as { data?: { children?: Array<{ kind: string; data: Record<string, unknown> }> } } | '';
      if (replies && typeof replies === 'object' && replies.data?.children) {
        comment.replies = this.parseRedditComments(replies.data.children, depth + 1);
      }

      comments.push(comment);
    }

    return comments;
  }

  /**
   * Format a Reddit post for display.
   */
  formatRedditPost(post: RedditPost, includeBody = true): string {
    const lines: string[] = [];

    // Title and metadata
    lines.push(`## ${post.title}`);
    lines.push('');
    lines.push(`**Subreddit:** r/${post.subreddit} | **Author:** u/${post.author}`);
    lines.push(`**Score:** ${post.score} (${Math.round(post.upvote_ratio * 100)}% upvoted) | **Comments:** ${post.num_comments}`);
    lines.push(`**Posted:** ${this.formatRedditTime(post.created_utc)}`);

    // Link for link posts
    if (!post.is_self && post.url) {
      lines.push(`**Link:** ${post.url}`);
    }

    // Image preview if available
    if (post.preview?.images?.[0]?.source) {
      const img = post.preview.images[0].source;
      // Reddit HTML-encodes URLs in preview
      const imgUrl = img.url.replace(/&amp;/g, '&');
      lines.push(`**Image:** ${imgUrl}`);
    }

    // Post body for text posts
    if (includeBody && post.is_self && post.selftext) {
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push(post.selftext);
    }

    lines.push('');
    lines.push(`**Permalink:** https://reddit.com${post.permalink}`);

    return lines.join('\n');
  }

  /**
   * Format Reddit comments for display.
   */
  formatRedditComments(comments: RedditComment[], maxDepth = 3): string {
    const lines: string[] = [];

    const formatComment = (comment: RedditComment): void => {
      if (comment.depth > maxDepth) return;

      const indent = '  '.repeat(comment.depth);
      lines.push(`${indent}**u/${comment.author}** (${comment.score} points)`);

      // Indent the body text
      const bodyLines = comment.body.split('\n');
      for (const line of bodyLines) {
        lines.push(`${indent}${line}`);
      }
      lines.push('');

      // Format replies
      if (comment.replies) {
        for (const reply of comment.replies) {
          formatComment(reply);
        }
      }
    };

    for (const comment of comments) {
      formatComment(comment);
    }

    return lines.join('\n');
  }

  /**
   * Format Reddit timestamp to relative time.
   */
  private formatRedditTime(utc: number): string {
    const now = Date.now() / 1000;
    const diff = now - utc;

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
    return `${Math.floor(diff / 2592000)} months ago`;
  }
}

export default WebReaderService;
