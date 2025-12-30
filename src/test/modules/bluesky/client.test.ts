/**
 * Bluesky Client Tests
 *
 * Tests for BlueskyClientWrapper.
 * Following TDD: These tests are written before implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the @atproto/api module - must be self-contained (no external imports)
vi.mock('@atproto/api', () => {
  const mockSession = {
    did: 'did:plc:testuser123',
    handle: 'test.bsky.social',
    accessJwt: 'mock-access-token',
    refreshJwt: 'mock-refresh-token'
  };

  // Use a class to properly mock the constructor
  class MockBskyAgent {
    session: typeof mockSession | undefined = undefined;

    login = vi.fn().mockImplementation(async () => {
      this.session = mockSession;
      return {
        success: true,
        data: mockSession
      };
    });

    post = vi.fn().mockResolvedValue({
      uri: 'at://did:plc:testuser123/app.bsky.feed.post/abc123',
      cid: 'bafyreimockpostcid'
    });

    getTimeline = vi.fn().mockResolvedValue({
      success: true,
      data: {
        cursor: 'cursor123',
        feed: [
          {
            post: {
              uri: 'at://did:plc:author1/app.bsky.feed.post/post1',
              cid: 'bafyreimockcid1',
              author: {
                did: 'did:plc:author1',
                handle: 'author1.bsky.social',
                displayName: 'Author One'
              },
              record: {
                text: 'Test post content 1',
                createdAt: '2024-01-15T10:00:00Z'
              },
              replyCount: 5,
              repostCount: 10,
              likeCount: 25
            }
          }
        ]
      }
    });

    getAuthorFeed = vi.fn().mockResolvedValue({
      success: true,
      data: {
        cursor: 'cursor456',
        feed: [
          {
            post: {
              uri: 'at://did:plc:author1/app.bsky.feed.post/post1',
              cid: 'bafyreimockcid1',
              author: {
                did: 'did:plc:author1',
                handle: 'author1.bsky.social',
                displayName: 'Author One'
              },
              record: {
                text: 'Author feed post',
                createdAt: '2024-01-15T10:00:00Z'
              },
              replyCount: 1,
              repostCount: 2,
              likeCount: 5
            }
          }
        ]
      }
    });

    app = {
      bsky: {
        feed: {
          searchPosts: vi.fn().mockResolvedValue({
            success: true,
            data: {
              cursor: 'searchcursor',
              posts: [
                {
                  uri: 'at://did:plc:author1/app.bsky.feed.post/search1',
                  cid: 'bafyreimocksearchcid',
                  author: {
                    did: 'did:plc:author1',
                    handle: 'author1.bsky.social',
                    displayName: 'Author One'
                  },
                  record: {
                    text: 'Search result post',
                    createdAt: '2024-01-15T10:00:00Z'
                  },
                  replyCount: 0,
                  repostCount: 0,
                  likeCount: 1
                }
              ]
            }
          })
        },
        notification: {
          listNotifications: vi.fn().mockResolvedValue({
            success: true,
            data: {
              cursor: 'notifcursor',
              notifications: [
                {
                  uri: 'at://did:plc:liker/app.bsky.feed.like/like1',
                  cid: 'bafyreimocklikecid',
                  author: {
                    did: 'did:plc:liker',
                    handle: 'liker.bsky.social',
                    displayName: 'Liker'
                  },
                  reason: 'like',
                  reasonSubject: 'at://did:plc:testuser123/app.bsky.feed.post/mypost',
                  indexedAt: '2024-01-15T11:00:00Z',
                  isRead: false
                },
                {
                  uri: 'at://did:plc:replier/app.bsky.feed.post/reply1',
                  cid: 'bafyreimockreplycid',
                  author: {
                    did: 'did:plc:replier',
                    handle: 'replier.bsky.social',
                    displayName: 'Replier'
                  },
                  reason: 'reply',
                  record: {
                    text: 'This is a reply'
                  },
                  indexedAt: '2024-01-15T10:30:00Z',
                  isRead: true
                }
              ]
            }
          })
        }
      }
    };
  }

  // Mock RichText as a class too
  class MockRichText {
    text: string;
    facets: any[] = [];

    constructor(opts: { text: string }) {
      this.text = opts.text;
    }

    detectFacets = vi.fn().mockResolvedValue(undefined);
  }

  return {
    BskyAgent: MockBskyAgent,
    RichText: MockRichText
  };
});

// Import after mock is set up
import { BlueskyClientWrapper } from '../../../modules/bluesky/client.js';

describe('BlueskyClientWrapper', () => {
  let client: BlueskyClientWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new BlueskyClientWrapper({
      service: 'https://bsky.social'
    });
  });

  describe('constructor', () => {
    it('should create client with default service', () => {
      const defaultClient = new BlueskyClientWrapper({});
      expect(defaultClient).toBeDefined();
    });

    it('should create client with custom service', () => {
      const customClient = new BlueskyClientWrapper({
        service: 'https://custom.pds.social'
      });
      expect(customClient).toBeDefined();
    });
  });

  describe('login', () => {
    it('should authenticate and return session info', async () => {
      const result = await client.login('test.bsky.social', 'app-password');

      expect(result.did).toBe('did:plc:testuser123');
      expect(result.handle).toBe('test.bsky.social');
    });

    it('should throw on failed authentication', async () => {
      // Create a new client that will fail login
      const failClient = new BlueskyClientWrapper({ service: 'https://bsky.social' });

      // Access internal agent to mock rejection (this is a bit hacky but works for tests)
      const { BskyAgent } = await import('@atproto/api');
      const internalAgent = (failClient as any).agent;
      internalAgent.login.mockRejectedValueOnce(new Error('Invalid credentials'));

      await expect(
        failClient.login('bad.handle', 'wrong-password')
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when not logged in', () => {
      expect(client.isAuthenticated()).toBe(false);
    });

    it('should return true after successful login', async () => {
      await client.login('test.bsky.social', 'app-password');
      expect(client.isAuthenticated()).toBe(true);
    });
  });

  describe('post', () => {
    beforeEach(async () => {
      await client.login('test.bsky.social', 'app-password');
    });

    it('should create a simple text post', async () => {
      const result = await client.post('Hello Bluesky!');

      expect(result.uri).toBeDefined();
      expect(result.cid).toBeDefined();
    });

    it('should process mentions with RichText', async () => {
      const result = await client.post('Hello @mention.bsky.social!');

      expect(result.uri).toBeDefined();
      // RichText.detectFacets should have been called
    });

    it('should process links with RichText', async () => {
      const result = await client.post('Check out https://example.com');

      expect(result.uri).toBeDefined();
    });

    it('should throw if not authenticated', async () => {
      const unauthClient = new BlueskyClientWrapper({ service: 'https://bsky.social' });

      await expect(
        unauthClient.post('Test post')
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('reply', () => {
    beforeEach(async () => {
      await client.login('test.bsky.social', 'app-password');
    });

    it('should create a reply with correct parent reference', async () => {
      const parentUri = 'at://did:plc:xyz/app.bsky.feed.post/abc';
      const parentCid = 'bafyreiabc123';

      const result = await client.reply(
        'This is a reply',
        parentUri,
        parentCid
      );

      expect(result.uri).toBeDefined();
      expect(result.cid).toBeDefined();
    });

    it('should handle nested replies with root reference', async () => {
      const parentUri = 'at://did:plc:xyz/app.bsky.feed.post/abc';
      const parentCid = 'bafyreiabc123';
      const rootUri = 'at://did:plc:xyz/app.bsky.feed.post/root';
      const rootCid = 'bafyreiroot456';

      const result = await client.reply(
        'Nested reply',
        parentUri,
        parentCid,
        rootUri,
        rootCid
      );

      expect(result.uri).toBeDefined();
    });

    it('should throw if not authenticated', async () => {
      const unauthClient = new BlueskyClientWrapper({ service: 'https://bsky.social' });

      await expect(
        unauthClient.reply('Reply', 'uri', 'cid')
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('getTimeline', () => {
    beforeEach(async () => {
      await client.login('test.bsky.social', 'app-password');
    });

    it('should fetch timeline posts', async () => {
      const posts = await client.getTimeline();

      expect(posts).toBeInstanceOf(Array);
      expect(posts.length).toBeGreaterThan(0);
      expect(posts[0]).toHaveProperty('uri');
      expect(posts[0]).toHaveProperty('text');
      expect(posts[0]).toHaveProperty('author');
    });

    it('should respect limit parameter', async () => {
      const posts = await client.getTimeline(10);

      expect(posts).toBeInstanceOf(Array);
    });

    it('should throw if not authenticated', async () => {
      const unauthClient = new BlueskyClientWrapper({ service: 'https://bsky.social' });

      await expect(
        unauthClient.getTimeline()
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('getAuthorFeed', () => {
    beforeEach(async () => {
      await client.login('test.bsky.social', 'app-password');
    });

    it('should fetch posts from specific author', async () => {
      const posts = await client.getAuthorFeed('author.bsky.social');

      expect(posts).toBeInstanceOf(Array);
    });

    it('should respect limit parameter', async () => {
      const posts = await client.getAuthorFeed('author.bsky.social', 5);

      expect(posts).toBeInstanceOf(Array);
    });
  });

  describe('searchPosts', () => {
    beforeEach(async () => {
      await client.login('test.bsky.social', 'app-password');
    });

    it('should search and return matching posts', async () => {
      const posts = await client.searchPosts('test query');

      expect(posts).toBeInstanceOf(Array);
    });

    it('should respect limit parameter', async () => {
      const posts = await client.searchPosts('test', 10);

      expect(posts).toBeInstanceOf(Array);
    });
  });

  describe('getNotifications', () => {
    beforeEach(async () => {
      await client.login('test.bsky.social', 'app-password');
    });

    it('should fetch notifications', async () => {
      const notifications = await client.getNotifications();

      expect(notifications).toBeInstanceOf(Array);
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0]).toHaveProperty('uri');
      expect(notifications[0]).toHaveProperty('reason');
      expect(notifications[0]).toHaveProperty('author');
    });

    it('should respect limit parameter', async () => {
      const notifications = await client.getNotifications(5);

      expect(notifications).toBeInstanceOf(Array);
    });

    it('should throw if not authenticated', async () => {
      const unauthClient = new BlueskyClientWrapper({ service: 'https://bsky.social' });

      await expect(
        unauthClient.getNotifications()
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('getSession', () => {
    it('should return undefined when not logged in', () => {
      expect(client.getSession()).toBeUndefined();
    });

    it('should return session after login', async () => {
      await client.login('test.bsky.social', 'app-password');

      const session = client.getSession();
      expect(session).toBeDefined();
      expect(session?.did).toBe('did:plc:testuser123');
    });
  });
});
