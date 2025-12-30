/**
 * Web Reader Service Tests
 *
 * Tests for WebReaderService singleton.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import WebReaderService from '../../../modules/web-reader/service.js';
import { createMockServiceContext, createMockReactiveState, MockServiceContext } from '../../mocks/service-context.mock.js';
import type { AgentId } from '../../../types/agent.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WebReaderService', () => {
  let service: WebReaderService;
  let mockContext: MockServiceContext;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WebReaderService();
    mockContext = createMockServiceContext();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('init', () => {
    it('should initialize service context', async () => {
      await service.init(mockContext as any);

      expect(service).toBeDefined();
    });
  });

  describe('initAgent', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should initialize with default config', async () => {
      const agentId = 'test-agent' as AgentId;
      const globalState = createMockReactiveState<any>({ cache: {} });
      mockContext.getGlobalState.mockReturnValue(globalState);

      await service.initAgent(agentId, {});

      expect(service).toBeDefined();
    });

    it('should accept custom config', async () => {
      const agentId = 'test-agent' as AgentId;
      const config = {
        cache_ttl_minutes: 120,
        max_cached_pages: 100
      };

      const globalState = createMockReactiveState<any>({ cache: {} });
      mockContext.getGlobalState.mockReturnValue(globalState);

      await service.initAgent(agentId, config);

      expect(service).toBeDefined();
    });
  });

  describe('canReconnect', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should always return true', () => {
      const result = service.canReconnect('test-agent' as AgentId, {});
      expect(result).toBe(true);
    });
  });

  describe('fetchPage', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
      const globalState = createMockReactiveState<any>({ cache: {} });
      mockContext.getGlobalState.mockReturnValue(globalState);
      await service.initAgent('test-agent' as AgentId, {});
    });

    it('should fetch page from Jina Reader API', async () => {
      const mockResponse = {
        code: 200,
        status: 'success',
        data: {
          url: 'https://example.com',
          title: 'Example Page',
          content: '# Example\n\nThis is example content.'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await service.fetchPage('https://example.com');

      expect(result.fromCache).toBe(false);
      expect(result.page.title).toBe('Example Page');
      expect(result.page.content).toContain('Example');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://example.com',
        expect.any(Object)
      );
    });

    it('should return cached page if available', async () => {
      const cachedPage = {
        url: 'https://example.com',
        title: 'Cached Page',
        content: 'Cached content',
        fetchedAt: new Date().toISOString()
      };

      const globalState = createMockReactiveState<any>({
        cache: { 'https://example.com': cachedPage }
      });
      mockContext.getGlobalState.mockReturnValue(globalState);

      const result = await service.fetchPage('https://example.com');

      expect(result.fromCache).toBe(true);
      expect(result.page.title).toBe('Cached Page');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should force refresh when requested', async () => {
      const cachedPage = {
        url: 'https://example.com',
        title: 'Cached Page',
        content: 'Cached content',
        fetchedAt: new Date().toISOString()
      };

      const globalState = createMockReactiveState<any>({
        cache: { 'https://example.com': cachedPage }
      });
      mockContext.getGlobalState.mockReturnValue(globalState);

      const mockResponse = {
        code: 200,
        status: 'success',
        data: {
          url: 'https://example.com',
          title: 'Fresh Page',
          content: 'Fresh content'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await service.fetchPage('https://example.com', true);

      expect(result.fromCache).toBe(false);
      expect(result.page.title).toBe('Fresh Page');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should add https:// if no protocol provided', async () => {
      const mockResponse = {
        code: 200,
        status: 'success',
        data: {
          url: 'https://example.com',
          title: 'Example',
          content: 'Content'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await service.fetchPage('example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://example.com',
        expect.any(Object)
      );
    });

    it('should throw on rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      });

      await expect(
        service.fetchPage('https://example.com')
      ).rejects.toThrow(/rate limit/i);
    });

    it('should throw on Jina API error', async () => {
      const mockResponse = {
        code: 500,
        status: 'error'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await expect(
        service.fetchPage('https://example.com')
      ).rejects.toThrow(/Jina Reader error/i);
    });
  });

  describe('getCacheStats', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should return cache statistics', async () => {
      const globalState = createMockReactiveState<any>({
        cache: {
          'https://example.com': { url: 'https://example.com', fetchedAt: new Date().toISOString() },
          'https://test.com': { url: 'https://test.com', fetchedAt: new Date().toISOString() }
        }
      });
      mockContext.getGlobalState.mockReturnValue(globalState);

      const stats = service.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.urls).toContain('https://example.com');
      expect(stats.urls).toContain('https://test.com');
    });
  });

  describe('clearCache', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should clear the cache', async () => {
      const globalState = createMockReactiveState<any>({
        cache: {
          'https://example.com': { url: 'https://example.com', fetchedAt: new Date().toISOString() }
        }
      });
      mockContext.getGlobalState.mockReturnValue(globalState);

      await service.clearCache();

      expect(globalState.set).toHaveBeenCalledWith({ cache: {} });
    });
  });

  describe('browseSubreddit', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should fetch subreddit posts', async () => {
      const mockResponse = {
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'post1',
                title: 'Test Post',
                author: 'user1',
                score: 100,
                num_comments: 50
              }
            }
          ]
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await service.browseSubreddit('technology');

      expect(result.subreddit).toBe('technology');
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].title).toBe('Test Post');
    });

    it('should handle r/ prefix in subreddit name', async () => {
      const mockResponse = {
        data: { children: [] }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await service.browseSubreddit('r/technology');

      expect(result.subreddit).toBe('technology');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/r/technology/'),
        expect.any(Object)
      );
    });

    it('should throw on 404 for non-existent subreddit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(
        service.browseSubreddit('nonexistentsubreddit123')
      ).rejects.toThrow(/not found/i);
    });

    it('should throw on rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      });

      await expect(
        service.browseSubreddit('technology')
      ).rejects.toThrow(/rate limit/i);
    });
  });

  describe('getRedditPost', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should fetch post with comments', async () => {
      const mockResponse = [
        {
          data: {
            children: [{
              kind: 't3',
              data: {
                id: 'post1',
                title: 'Test Post',
                author: 'user1',
                selftext: 'Post content'
              }
            }]
          }
        },
        {
          data: {
            children: [{
              kind: 't1',
              data: {
                id: 'comment1',
                author: 'commenter1',
                body: 'Great post!',
                score: 10,
                created_utc: Date.now() / 1000
              }
            }]
          }
        }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await service.getRedditPost('technology', 'post1');

      expect(result.post.id).toBe('post1');
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].author).toBe('commenter1');
    });
  });

  describe('formatRedditPost', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should format post as markdown', () => {
      const post = {
        title: 'Test Post',
        author: 'user1',
        subreddit: 'technology',
        score: 100,
        upvote_ratio: 0.95,
        num_comments: 50,
        created_utc: Date.now() / 1000 - 3600,
        is_self: true,
        selftext: 'Post body content',
        permalink: '/r/technology/comments/abc123/test_post/'
      };

      const formatted = service.formatRedditPost(post as any);

      expect(formatted).toContain('## Test Post');
      expect(formatted).toContain('r/technology');
      expect(formatted).toContain('u/user1');
      expect(formatted).toContain('100');
      expect(formatted).toContain('95%');
      expect(formatted).toContain('Post body content');
    });
  });

  describe('cleanup', () => {
    it('should cleanup without errors', async () => {
      await service.init(mockContext as any);

      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});
