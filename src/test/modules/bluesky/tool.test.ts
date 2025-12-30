/**
 * Bluesky Tool Tests
 *
 * Tests for Bluesky MCP tools.
 * Following TDD: These tests are written before implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tools } from '../../../modules/bluesky/tool.js';
import type { ToolContext } from '../../../types/tool.js';
import type { AgentId } from '../../../types/agent.js';

// Mock BlueskyService
const mockBlueskyClient = {
  post: vi.fn().mockResolvedValue({ uri: 'at://test/post/123', cid: 'cid123' }),
  reply: vi.fn().mockResolvedValue({ uri: 'at://test/post/456', cid: 'cid456' }),
  getTimeline: vi.fn().mockResolvedValue([
    {
      uri: 'at://test/post/1',
      cid: 'cid1',
      author: { did: 'did:plc:author1', handle: 'author1.bsky.social', displayName: 'Author 1' },
      text: 'Post 1 content',
      createdAt: '2024-01-15T10:00:00Z',
      replyCount: 5,
      repostCount: 10,
      likeCount: 25
    },
    {
      uri: 'at://test/post/2',
      cid: 'cid2',
      author: { did: 'did:plc:author2', handle: 'author2.bsky.social', displayName: 'Author 2' },
      text: 'Post 2 content',
      createdAt: '2024-01-15T09:00:00Z',
      replyCount: 2,
      repostCount: 3,
      likeCount: 10
    }
  ]),
  getAuthorFeed: vi.fn().mockResolvedValue([
    {
      uri: 'at://test/post/author1',
      cid: 'cid_author1',
      author: { did: 'did:plc:author1', handle: 'author1.bsky.social', displayName: 'Author 1' },
      text: 'Author post',
      createdAt: '2024-01-15T10:00:00Z',
      replyCount: 1,
      repostCount: 2,
      likeCount: 5
    }
  ]),
  searchPosts: vi.fn().mockResolvedValue([
    {
      uri: 'at://test/post/search1',
      cid: 'cid_search1',
      author: { did: 'did:plc:author1', handle: 'author1.bsky.social', displayName: 'Author 1' },
      text: 'Search result post',
      createdAt: '2024-01-15T10:00:00Z',
      replyCount: 0,
      repostCount: 0,
      likeCount: 1
    }
  ]),
  getNotifications: vi.fn().mockResolvedValue([
    {
      uri: 'at://test/like/1',
      reason: 'like',
      author: { did: 'did:plc:liker', handle: 'liker.bsky.social', displayName: 'Liker' },
      indexedAt: '2024-01-15T11:00:00Z',
      isRead: false,
      subjectUri: 'at://test/post/mypost'
    },
    {
      uri: 'at://test/reply/1',
      reason: 'reply',
      author: { did: 'did:plc:replier', handle: 'replier.bsky.social', displayName: 'Replier' },
      indexedAt: '2024-01-15T10:30:00Z',
      isRead: true,
      text: 'This is a reply'
    }
  ])
};

const mockBlueskyService = {
  getClient: vi.fn().mockReturnValue(mockBlueskyClient),
  isAgentInitialized: vi.fn().mockReturnValue(true)
};

// Create mock tool context
function createMockToolContext(agentId: AgentId = 'test-agent' as AgentId): ToolContext {
  return {
    agentId,
    getService: vi.fn().mockImplementation((name: string) => {
      if (name === 'bluesky') return mockBlueskyService;
      return undefined;
    }),
    getAgentMetadata: vi.fn().mockReturnValue({
      agent_id: agentId,
      agent_name: 'TestAgent',
      enabled: true,
      modules: {}
    }),
    isAgentInitialized: vi.fn().mockReturnValue(true)
  } as unknown as ToolContext;
}

describe('Bluesky MCP Tools', () => {
  const findTool = (name: string) => tools.find(t => t.name === name)!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('bluesky_post', () => {
    it('should create a post and return success message', async () => {
      const tool = findTool('bluesky_post');
      const context = createMockToolContext();
      const params = { text: 'Hello Bluesky!' };

      const result = await tool.handler(params, context);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Posted');
      expect(mockBlueskyClient.post).toHaveBeenCalledWith('Hello Bluesky!');
    });

    it('should return error for empty text', async () => {
      const tool = findTool('bluesky_post');
      const context = createMockToolContext();
      const params = { text: '' };

      const result = await tool.handler(params, context);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('empty');
    });

    it('should return error for text exceeding 300 characters', async () => {
      const tool = findTool('bluesky_post');
      const context = createMockToolContext();
      const params = { text: 'x'.repeat(301) };

      const result = await tool.handler(params, context);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('300');
    });

    it('should return error if bluesky service not initialized', async () => {
      const tool = findTool('bluesky_post');
      const context = createMockToolContext();
      mockBlueskyService.isAgentInitialized.mockReturnValueOnce(false);
      const params = { text: 'Test post' };

      const result = await tool.handler(params, context);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not initialized');
    });
  });

  describe('bluesky_reply', () => {
    it('should create reply with correct parent reference', async () => {
      const tool = findTool('bluesky_reply');
      const context = createMockToolContext();
      const params = {
        text: 'This is a reply',
        parent_uri: 'at://did:plc:xyz/app.bsky.feed.post/abc',
        parent_cid: 'bafyreiabc123'
      };

      const result = await tool.handler(params, context);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Replied');
      expect(mockBlueskyClient.reply).toHaveBeenCalledWith(
        'This is a reply',
        'at://did:plc:xyz/app.bsky.feed.post/abc',
        'bafyreiabc123',
        undefined,
        undefined
      );
    });

    it('should handle nested replies with root reference', async () => {
      const tool = findTool('bluesky_reply');
      const context = createMockToolContext();
      const params = {
        text: 'Nested reply',
        parent_uri: 'at://did:plc:xyz/app.bsky.feed.post/abc',
        parent_cid: 'bafyreiabc123',
        root_uri: 'at://did:plc:xyz/app.bsky.feed.post/root',
        root_cid: 'bafyreiroot456'
      };

      const result = await tool.handler(params, context);

      expect(result.isError).toBeFalsy();
      expect(mockBlueskyClient.reply).toHaveBeenCalledWith(
        'Nested reply',
        'at://did:plc:xyz/app.bsky.feed.post/abc',
        'bafyreiabc123',
        'at://did:plc:xyz/app.bsky.feed.post/root',
        'bafyreiroot456'
      );
    });

    it('should return error for empty text', async () => {
      const tool = findTool('bluesky_reply');
      const context = createMockToolContext();
      const params = {
        text: '',
        parent_uri: 'at://test',
        parent_cid: 'cid'
      };

      const result = await tool.handler(params, context);

      expect(result.isError).toBe(true);
    });
  });

  describe('bluesky_read_feed', () => {
    it('should return formatted timeline for home feed', async () => {
      const tool = findTool('bluesky_read_feed');
      const context = createMockToolContext();
      const params = { type: 'home', limit: 10 };

      const result = await tool.handler(params, context);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Post 1 content');
      expect(result.content[0].text).toContain('author1.bsky.social');
      expect(mockBlueskyClient.getTimeline).toHaveBeenCalledWith(10);
    });

    it('should return author feed when type is author', async () => {
      const tool = findTool('bluesky_read_feed');
      const context = createMockToolContext();
      const params = { type: 'author', author: 'someone.bsky.social', limit: 5 };

      const result = await tool.handler(params, context);

      expect(result.isError).toBeFalsy();
      expect(mockBlueskyClient.getAuthorFeed).toHaveBeenCalledWith('someone.bsky.social', 5);
    });

    it('should return error if type is author but no author provided', async () => {
      const tool = findTool('bluesky_read_feed');
      const context = createMockToolContext();
      const params = { type: 'author' };

      const result = await tool.handler(params, context);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('author');
    });

    it('should use default limit of 20', async () => {
      const tool = findTool('bluesky_read_feed');
      const context = createMockToolContext();
      const params = { type: 'home' };

      await tool.handler(params, context);

      expect(mockBlueskyClient.getTimeline).toHaveBeenCalledWith(20);
    });
  });

  describe('bluesky_search', () => {
    it('should search and return formatted results', async () => {
      const tool = findTool('bluesky_search');
      const context = createMockToolContext();
      const params = { query: 'test query', limit: 10 };

      const result = await tool.handler(params, context);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Search result post');
      expect(mockBlueskyClient.searchPosts).toHaveBeenCalledWith('test query', 10);
    });

    it('should return error for empty query', async () => {
      const tool = findTool('bluesky_search');
      const context = createMockToolContext();
      const params = { query: '' };

      const result = await tool.handler(params, context);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('query');
    });

    it('should use default limit of 20', async () => {
      const tool = findTool('bluesky_search');
      const context = createMockToolContext();
      const params = { query: 'test' };

      await tool.handler(params, context);

      expect(mockBlueskyClient.searchPosts).toHaveBeenCalledWith('test', 20);
    });
  });

  describe('bluesky_get_notifications', () => {
    it('should return formatted notifications', async () => {
      const tool = findTool('bluesky_get_notifications');
      const context = createMockToolContext();
      const params = { limit: 10 };

      const result = await tool.handler(params, context);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('like');
      expect(result.content[0].text).toContain('liker.bsky.social');
      expect(mockBlueskyClient.getNotifications).toHaveBeenCalledWith(10);
    });

    it('should use default limit of 20', async () => {
      const tool = findTool('bluesky_get_notifications');
      const context = createMockToolContext();
      const params = {};

      await tool.handler(params, context);

      expect(mockBlueskyClient.getNotifications).toHaveBeenCalledWith(20);
    });

    it('should categorize notifications by type', async () => {
      const tool = findTool('bluesky_get_notifications');
      const context = createMockToolContext();
      const params = {};

      const result = await tool.handler(params, context);

      expect(result.isError).toBeFalsy();
      // Should show both like and reply notifications
      expect(result.content[0].text).toContain('like');
      expect(result.content[0].text).toContain('reply');
    });
  });
});
