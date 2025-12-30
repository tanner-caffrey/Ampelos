/**
 * Mock for @atproto/api BskyAgent
 *
 * Provides a mock implementation for testing Bluesky integration.
 */

import { vi } from 'vitest';

export interface MockBskySession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

export interface MockBskyAgent {
  login: ReturnType<typeof vi.fn>;
  resumeSession: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  deletePost: ReturnType<typeof vi.fn>;
  like: ReturnType<typeof vi.fn>;
  deleteLike: ReturnType<typeof vi.fn>;
  repost: ReturnType<typeof vi.fn>;
  deleteRepost: ReturnType<typeof vi.fn>;
  getTimeline: ReturnType<typeof vi.fn>;
  getAuthorFeed: ReturnType<typeof vi.fn>;
  getPostThread: ReturnType<typeof vi.fn>;
  getPost: ReturnType<typeof vi.fn>;
  getPosts: ReturnType<typeof vi.fn>;
  // Profile & Follow methods
  getProfile: ReturnType<typeof vi.fn>;
  upsertProfile: ReturnType<typeof vi.fn>;
  follow: ReturnType<typeof vi.fn>;
  deleteFollow: ReturnType<typeof vi.fn>;
  getFollowers: ReturnType<typeof vi.fn>;
  getFollows: ReturnType<typeof vi.fn>;
  resolveHandle: ReturnType<typeof vi.fn>;
  app: {
    bsky: {
      feed: {
        searchPosts: ReturnType<typeof vi.fn>;
        getAuthorFeed: ReturnType<typeof vi.fn>;
        getPosts: ReturnType<typeof vi.fn>;
        getFeed: ReturnType<typeof vi.fn>;
      };
      notification: {
        listNotifications: ReturnType<typeof vi.fn>;
        updateSeen: ReturnType<typeof vi.fn>;
      };
    };
  };
  // DM API (accessed via api property)
  api: {
    chat: {
      bsky: {
        convo: {
          listConvos: ReturnType<typeof vi.fn>;
          getMessages: ReturnType<typeof vi.fn>;
          getConvoForMembers: ReturnType<typeof vi.fn>;
          sendMessage: ReturnType<typeof vi.fn>;
        };
      };
    };
  };
  session?: MockBskySession;
}

/**
 * Create a mock BskyAgent with sensible defaults
 */
export function createMockBskyAgent(overrides: Partial<MockBskyAgent> = {}): MockBskyAgent {
  const mockSession: MockBskySession = {
    did: 'did:plc:testuser123',
    handle: 'test.bsky.social',
    accessJwt: 'mock-access-token',
    refreshJwt: 'mock-refresh-token'
  };

  const defaultMock: MockBskyAgent = {
    login: vi.fn().mockResolvedValue({
      success: true,
      data: mockSession
    }),

    resumeSession: vi.fn().mockResolvedValue(undefined),

    post: vi.fn().mockResolvedValue({
      uri: 'at://did:plc:testuser123/app.bsky.feed.post/abc123',
      cid: 'bafyreimockpostcid'
    }),

    deletePost: vi.fn().mockResolvedValue(undefined),

    like: vi.fn().mockResolvedValue({
      uri: 'at://did:plc:testuser123/app.bsky.feed.like/xyz789'
    }),

    deleteLike: vi.fn().mockResolvedValue(undefined),

    repost: vi.fn().mockResolvedValue({
      uri: 'at://did:plc:testuser123/app.bsky.feed.repost/xyz789'
    }),

    deleteRepost: vi.fn().mockResolvedValue(undefined),

    getTimeline: vi.fn().mockResolvedValue({
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
          },
          {
            post: {
              uri: 'at://did:plc:author2/app.bsky.feed.post/post2',
              cid: 'bafyreimockcid2',
              author: {
                did: 'did:plc:author2',
                handle: 'author2.bsky.social',
                displayName: 'Author Two'
              },
              record: {
                text: 'Test post content 2',
                createdAt: '2024-01-15T09:00:00Z'
              },
              replyCount: 2,
              repostCount: 3,
              likeCount: 10
            }
          }
        ]
      }
    }),

    getAuthorFeed: vi.fn().mockResolvedValue({
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
    }),

    getPostThread: vi.fn().mockResolvedValue({
      success: true,
      data: {
        thread: {
          post: {
            uri: 'at://did:plc:author1/app.bsky.feed.post/thread1',
            cid: 'bafyreimockthreadcid',
            author: {
              did: 'did:plc:author1',
              handle: 'author1.bsky.social',
              displayName: 'Author One'
            },
            record: {
              text: 'Thread post',
              createdAt: '2024-01-15T10:00:00Z'
            },
            replyCount: 3,
            repostCount: 1,
            likeCount: 8
          },
          replies: []
        }
      }
    }),

    getPost: vi.fn().mockResolvedValue({
      success: true,
      data: {
        uri: 'at://did:plc:author1/app.bsky.feed.post/post1',
        cid: 'bafyreimockcid1',
        value: {
          text: 'Single post content',
          createdAt: '2024-01-15T10:00:00Z'
        }
      }
    }),

    getPosts: vi.fn().mockResolvedValue({
      success: true,
      data: {
        posts: []
      }
    }),

    // Profile methods
    getProfile: vi.fn().mockResolvedValue({
      success: true,
      data: {
        did: 'did:plc:testuser123',
        handle: 'test.bsky.social',
        displayName: 'Test User',
        description: 'A test user profile',
        avatar: 'https://example.com/avatar.jpg',
        followersCount: 100,
        followsCount: 50,
        postsCount: 200,
        viewer: {
          following: 'at://did:plc:testuser123/app.bsky.graph.follow/follow1',
          followedBy: 'at://did:plc:other/app.bsky.graph.follow/follow2'
        }
      }
    }),

    upsertProfile: vi.fn().mockImplementation(async (updateFn: (existing: any) => any) => {
      const existing = {
        displayName: 'Test User',
        description: 'A test user profile'
      };
      return updateFn(existing);
    }),

    // Follow methods
    follow: vi.fn().mockResolvedValue({
      uri: 'at://did:plc:testuser123/app.bsky.graph.follow/newfollowid'
    }),

    deleteFollow: vi.fn().mockResolvedValue(undefined),

    getFollowers: vi.fn().mockResolvedValue({
      success: true,
      data: {
        followers: [
          {
            did: 'did:plc:follower1',
            handle: 'follower1.bsky.social',
            displayName: 'Follower One',
            description: 'A follower',
            viewer: {}
          }
        ],
        cursor: 'followercursor'
      }
    }),

    getFollows: vi.fn().mockResolvedValue({
      success: true,
      data: {
        follows: [
          {
            did: 'did:plc:following1',
            handle: 'following1.bsky.social',
            displayName: 'Following One',
            description: 'Someone I follow',
            viewer: {}
          }
        ],
        cursor: 'followingcursor'
      }
    }),

    resolveHandle: vi.fn().mockResolvedValue({
      success: true,
      data: {
        did: 'did:plc:resolved123'
      }
    }),

    app: {
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
          }),
          getAuthorFeed: vi.fn().mockResolvedValue({
            success: true,
            data: { feed: [] }
          }),
          getPosts: vi.fn().mockResolvedValue({
            success: true,
            data: { posts: [] }
          }),
          getFeed: vi.fn().mockResolvedValue({
            success: true,
            data: { feed: [], cursor: 'feedcursor' }
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
          }),
          updateSeen: vi.fn().mockResolvedValue({ success: true })
        }
      }
    },

    // DM API (chat.bsky.convo)
    api: {
      chat: {
        bsky: {
          convo: {
            listConvos: vi.fn().mockResolvedValue({
              success: true,
              data: {
                convos: [
                  {
                    id: 'convo-123',
                    members: [
                      { did: 'did:plc:testuser123', handle: 'test.bsky.social', displayName: 'Test User' },
                      { did: 'did:plc:other123', handle: 'other.bsky.social', displayName: 'Other User' }
                    ],
                    lastMessage: {
                      text: 'Hello!',
                      sentAt: '2024-01-15T12:00:00Z',
                      sender: { did: 'did:plc:other123' }
                    },
                    unreadCount: 1,
                    muted: false
                  }
                ],
                cursor: 'convocursor'
              }
            }),
            getMessages: vi.fn().mockResolvedValue({
              success: true,
              data: {
                messages: [
                  {
                    $type: 'chat.bsky.convo.defs#messageView',
                    id: 'msg-1',
                    text: 'Hello!',
                    sender: { did: 'did:plc:other123', handle: 'other.bsky.social', displayName: 'Other User' },
                    sentAt: '2024-01-15T12:00:00Z'
                  },
                  {
                    $type: 'chat.bsky.convo.defs#messageView',
                    id: 'msg-2',
                    text: 'Hi there!',
                    sender: { did: 'did:plc:testuser123', handle: 'test.bsky.social', displayName: 'Test User' },
                    sentAt: '2024-01-15T12:01:00Z'
                  }
                ],
                cursor: 'msgcursor'
              }
            }),
            getConvoForMembers: vi.fn().mockResolvedValue({
              success: true,
              data: {
                convo: {
                  id: 'convo-new',
                  members: [
                    { did: 'did:plc:testuser123', handle: 'test.bsky.social', displayName: 'Test User' },
                    { did: 'did:plc:recipient', handle: 'recipient.bsky.social', displayName: 'Recipient' }
                  ],
                  unreadCount: 0,
                  muted: false
                }
              }
            }),
            sendMessage: vi.fn().mockResolvedValue({
              success: true,
              data: {
                id: 'msg-new',
                text: 'Test message',
                sentAt: '2024-01-15T12:05:00Z'
              }
            })
          }
        }
      }
    },

    session: mockSession
  };

  // Merge overrides
  const merged = { ...defaultMock, ...overrides };

  // Handle nested app.bsky overrides
  if (overrides.app?.bsky?.feed) {
    merged.app.bsky.feed = { ...defaultMock.app.bsky.feed, ...overrides.app.bsky.feed };
  }
  if (overrides.app?.bsky?.notification) {
    merged.app.bsky.notification = { ...defaultMock.app.bsky.notification, ...overrides.app.bsky.notification };
  }

  return merged;
}

/**
 * Create a mock RichText class
 */
export function createMockRichText() {
  return vi.fn().mockImplementation((opts: { text: string }) => ({
    text: opts.text,
    facets: [],
    detectFacets: vi.fn().mockResolvedValue(undefined)
  }));
}

/**
 * Reset all mock functions on a mock agent
 */
export function resetMockBskyAgent(mock: MockBskyAgent): void {
  // Auth
  mock.login.mockReset();
  mock.resumeSession.mockReset();

  // Posts
  mock.post.mockReset();
  mock.deletePost.mockReset();
  mock.like.mockReset();
  mock.deleteLike.mockReset();
  mock.repost.mockReset();
  mock.deleteRepost.mockReset();
  mock.getTimeline.mockReset();
  mock.getAuthorFeed.mockReset();
  mock.getPostThread.mockReset();
  mock.getPost.mockReset();
  mock.getPosts.mockReset();

  // Profile & Follows
  mock.getProfile.mockReset();
  mock.upsertProfile.mockReset();
  mock.follow.mockReset();
  mock.deleteFollow.mockReset();
  mock.getFollowers.mockReset();
  mock.getFollows.mockReset();
  mock.resolveHandle.mockReset();

  // App API
  mock.app.bsky.feed.searchPosts.mockReset();
  mock.app.bsky.feed.getPosts.mockReset();
  mock.app.bsky.feed.getFeed.mockReset();
  mock.app.bsky.notification.listNotifications.mockReset();
  mock.app.bsky.notification.updateSeen.mockReset();

  // DM API
  mock.api.chat.bsky.convo.listConvos.mockReset();
  mock.api.chat.bsky.convo.getMessages.mockReset();
  mock.api.chat.bsky.convo.getConvoForMembers.mockReset();
  mock.api.chat.bsky.convo.sendMessage.mockReset();
}
