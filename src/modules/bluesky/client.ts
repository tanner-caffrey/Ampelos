/**
 * Bluesky Client Wrapper
 *
 * Wraps @atproto/api BskyAgent with a cleaner interface for Ampelos.
 */

import { BskyAgent, RichText } from '@atproto/api';
import type {
  BlueskyPost,
  BlueskyNotification,
  PostResult,
  BlueskyImage,
  BlueskyProfile,
  ProfileUpdateData,
  BlueskyConversation,
  BlueskyMessage,
  SendMessageResult,
  ConversationMember
} from './types.js';

export interface BlueskyClientOptions {
  service?: string;
}

export interface SessionInfo {
  did: string;
  handle: string;
}

export class BlueskyClientWrapper {
  private agent: BskyAgent;
  private authenticated = false;

  constructor(options: BlueskyClientOptions) {
    this.agent = new BskyAgent({
      service: options.service || 'https://bsky.social'
    });
  }

  /**
   * Login with handle and app password
   */
  async login(handle: string, password: string): Promise<SessionInfo> {
    const response = await this.agent.login({
      identifier: handle,
      password
    });

    this.authenticated = true;

    return {
      did: response.data.did,
      handle: response.data.handle
    };
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Get current session
   */
  getSession(): SessionInfo | undefined {
    if (!this.agent.session) {
      return undefined;
    }
    return {
      did: this.agent.session.did,
      handle: this.agent.session.handle
    };
  }

  /**
   * Create a new post
   */
  async post(text: string): Promise<PostResult> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    // Process text for mentions and links
    const rt = new RichText({ text });
    await rt.detectFacets(this.agent);

    const response = await this.agent.post({
      text: rt.text,
      facets: rt.facets
    });

    return {
      uri: response.uri,
      cid: response.cid
    };
  }

  /**
   * Reply to a post
   */
  async reply(
    text: string,
    parentUri: string,
    parentCid: string,
    rootUri?: string,
    rootCid?: string
  ): Promise<PostResult> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    // Process text for mentions and links
    const rt = new RichText({ text });
    await rt.detectFacets(this.agent);

    // If no root provided, parent is the root
    const root = rootUri && rootCid
      ? { uri: rootUri, cid: rootCid }
      : { uri: parentUri, cid: parentCid };

    const response = await this.agent.post({
      text: rt.text,
      facets: rt.facets,
      reply: {
        root,
        parent: { uri: parentUri, cid: parentCid }
      }
    });

    return {
      uri: response.uri,
      cid: response.cid
    };
  }

  /**
   * Get home timeline
   */
  async getTimeline(limit = 20): Promise<BlueskyPost[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const response = await this.agent.getTimeline({ limit });

    return response.data.feed.map(item => this.mapPost(item.post));
  }

  /**
   * Get posts from a specific author
   */
  async getAuthorFeed(author: string, limit = 20): Promise<BlueskyPost[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const response = await this.agent.getAuthorFeed({
      actor: author,
      limit
    });

    return response.data.feed.map(item => this.mapPost(item.post));
  }

  /**
   * Search posts
   */
  async searchPosts(query: string, limit = 20): Promise<BlueskyPost[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const response = await this.agent.app.bsky.feed.searchPosts({
      q: query,
      limit
    });

    return response.data.posts.map(post => this.mapPost(post));
  }

  /**
   * Get posts from a custom feed generator
   */
  async getFeed(feedUri: string, limit = 20): Promise<BlueskyPost[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const response = await this.agent.app.bsky.feed.getFeed({
      feed: feedUri,
      limit
    });

    return response.data.feed.map(item => this.mapPost(item.post));
  }

  /**
   * Get notifications
   */
  async getNotifications(limit = 20): Promise<BlueskyNotification[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const response = await this.agent.app.bsky.notification.listNotifications({
      limit
    });

    return response.data.notifications.map(notif => ({
      uri: notif.uri,
      reason: notif.reason as BlueskyNotification['reason'],
      author: {
        did: notif.author.did,
        handle: notif.author.handle,
        displayName: notif.author.displayName
      },
      indexedAt: notif.indexedAt,
      isRead: notif.isRead,
      text: (notif.record as { text?: string })?.text,
      subjectUri: notif.reasonSubject
    }));
  }

  /**
   * Get a single post by URI
   */
  async getPost(uri: string): Promise<BlueskyPost> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const response = await this.agent.app.bsky.feed.getPosts({
      uris: [uri]
    });

    if (!response.data.posts.length) {
      throw new Error(`Post not found: ${uri}`);
    }

    return this.mapPost(response.data.posts[0]);
  }

  /**
   * Get replies to a post (thread)
   */
  async getPostThread(uri: string, depth = 10): Promise<{ post: BlueskyPost; replies: BlueskyPost[] }> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const response = await this.agent.app.bsky.feed.getPostThread({
      uri,
      depth
    });

    const thread = response.data.thread as any;

    if (thread.$type === 'app.bsky.feed.defs#blockedPost') {
      throw new Error('Post is blocked');
    }

    if (thread.$type === 'app.bsky.feed.defs#notFoundPost') {
      throw new Error('Post not found');
    }

    const post = this.mapPost(thread.post);
    const replies: BlueskyPost[] = [];

    // Extract replies from thread
    if (thread.replies && Array.isArray(thread.replies)) {
      for (const reply of thread.replies) {
        if (reply.$type === 'app.bsky.feed.defs#threadViewPost' && reply.post) {
          replies.push(this.mapPost(reply.post));
        }
      }
    }

    return { post, replies };
  }

  /**
   * Get a thread by following the original author's reply chain
   * Traverses from a starting post, finding each subsequent reply by the same author
   * @param uri - Starting post URI
   * @param maxDepth - Maximum posts to traverse (default: 20)
   * @returns Array of posts in chronological order (starting post first)
   */
  async getAuthorThread(uri: string, maxDepth = 20): Promise<BlueskyPost[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const thread: BlueskyPost[] = [];
    let currentUri = uri;
    let authorDid: string | null = null;

    for (let i = 0; i < maxDepth; i++) {
      const { post, replies } = await this.getPostThread(currentUri, 1);

      // On first iteration, capture the author DID
      if (i === 0) {
        authorDid = post.author.did;
      }

      thread.push(post);

      // Find the author's reply among the replies
      const authorReply = replies.find(reply => reply.author.did === authorDid);

      if (!authorReply) {
        // No more replies from the author - thread ends here
        break;
      }

      // Continue traversal from the author's reply
      currentUri = authorReply.uri;
    }

    return thread;
  }

  /**
   * Map API post response to BlueskyPost
   */
  private mapPost(post: any): BlueskyPost {
    // Extract images from embed
    let images: BlueskyImage[] | undefined;
    if (post.embed?.$type === 'app.bsky.embed.images#view') {
      images = post.embed.images?.map((img: any) => ({
        alt: img.alt || '',
        fullsize: img.fullsize,
        thumb: img.thumb
      }));
    }

    return {
      uri: post.uri,
      cid: post.cid,
      author: {
        did: post.author.did,
        handle: post.author.handle,
        displayName: post.author.displayName
      },
      text: post.record?.text || '',
      createdAt: post.record?.createdAt || post.indexedAt || '',
      replyCount: post.replyCount || 0,
      repostCount: post.repostCount || 0,
      likeCount: post.likeCount || 0,
      images
    };
  }

  // ============================================================================
  // Profile Methods
  // ============================================================================

  /**
   * Resolve a handle to a DID
   */
  async resolveHandle(handle: string): Promise<string> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const response = await this.agent.resolveHandle({ handle });
    return response.data.did;
  }

  /**
   * Get a user's profile
   * @param actor - Handle or DID (omit for own profile)
   */
  async getProfile(actor?: string): Promise<BlueskyProfile> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const targetActor = actor || this.agent.session?.did;
    if (!targetActor) {
      throw new Error('No actor specified and no session available');
    }

    const response = await this.agent.getProfile({ actor: targetActor });
    const profile = response.data;

    return {
      did: profile.did,
      handle: profile.handle,
      displayName: profile.displayName,
      description: profile.description,
      avatar: profile.avatar,
      banner: profile.banner,
      followersCount: profile.followersCount || 0,
      followsCount: profile.followsCount || 0,
      postsCount: profile.postsCount || 0,
      isFollowing: profile.viewer?.following !== undefined,
      isFollowedBy: profile.viewer?.followedBy !== undefined,
      followUri: profile.viewer?.following
    };
  }

  /**
   * Update own profile
   */
  async updateProfile(data: ProfileUpdateData): Promise<void> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    await this.agent.upsertProfile((existing) => {
      return {
        ...existing,
        displayName: data.displayName ?? existing?.displayName,
        description: data.description ?? existing?.description
      };
    });
  }

  // ============================================================================
  // Follow/Unfollow Methods
  // ============================================================================

  /**
   * Follow a user
   * @param did - The DID of the user to follow
   * @returns The URI of the follow record (needed for unfollowing)
   */
  async follow(did: string): Promise<{ uri: string }> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const response = await this.agent.follow(did);
    return { uri: response.uri };
  }

  /**
   * Unfollow a user
   * @param followUri - The URI of the follow record (from follow() or profile.followUri)
   */
  async unfollow(followUri: string): Promise<void> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    await this.agent.deleteFollow(followUri);
  }

  /**
   * Get followers of a user
   * @param actor - Handle or DID (omit for own followers)
   * @param limit - Max number to return (default: 50)
   */
  async getFollowers(actor?: string, limit = 50): Promise<BlueskyProfile[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const targetActor = actor || this.agent.session?.did;
    if (!targetActor) {
      throw new Error('No actor specified and no session available');
    }

    const response = await this.agent.getFollowers({ actor: targetActor, limit });

    return response.data.followers.map(f => ({
      did: f.did,
      handle: f.handle,
      displayName: f.displayName,
      description: f.description,
      avatar: f.avatar,
      followersCount: 0, // Not provided in this endpoint
      followsCount: 0,
      postsCount: 0,
      isFollowing: f.viewer?.following !== undefined,
      isFollowedBy: f.viewer?.followedBy !== undefined,
      followUri: f.viewer?.following
    }));
  }

  /**
   * Get users that a user follows
   * @param actor - Handle or DID (omit for own following list)
   * @param limit - Max number to return (default: 50)
   */
  async getFollowing(actor?: string, limit = 50): Promise<BlueskyProfile[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const targetActor = actor || this.agent.session?.did;
    if (!targetActor) {
      throw new Error('No actor specified and no session available');
    }

    const response = await this.agent.getFollows({ actor: targetActor, limit });

    return response.data.follows.map(f => ({
      did: f.did,
      handle: f.handle,
      displayName: f.displayName,
      description: f.description,
      avatar: f.avatar,
      followersCount: 0,
      followsCount: 0,
      postsCount: 0,
      isFollowing: f.viewer?.following !== undefined,
      isFollowedBy: f.viewer?.followedBy !== undefined,
      followUri: f.viewer?.following
    }));
  }

  // ============================================================================
  // DM (Direct Message) Methods
  // ============================================================================

  /**
   * List DM conversations
   * @param limit - Max conversations to return (default: 20)
   */
  async listConversations(limit = 20): Promise<BlueskyConversation[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.agent.api.chat.bsky.convo.listConvos(
        { limit },
        { headers: { 'atproto-proxy': 'did:web:api.bsky.chat#bsky_chat' } }
      );

      return response.data.convos.map(convo => this.mapConversation(convo));
    } catch (error: any) {
      if (error?.message?.includes('Bad token scope')) {
        throw new Error(
          'DM access not enabled. Please create an app password with "Allow access to your direct messages" enabled.'
        );
      }
      throw error;
    }
  }

  /**
   * Get messages from a conversation
   * @param convoId - The conversation ID
   * @param limit - Max messages to return (default: 50)
   */
  async getMessages(convoId: string, limit = 50): Promise<BlueskyMessage[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.agent.api.chat.bsky.convo.getMessages(
        { convoId, limit },
        { headers: { 'atproto-proxy': 'did:web:api.bsky.chat#bsky_chat' } }
      );

      return response.data.messages
        .filter((msg: any) => msg.$type === 'chat.bsky.convo.defs#messageView')
        .map((msg: any) => this.mapMessage(msg, convoId));
    } catch (error: any) {
      if (error?.message?.includes('Bad token scope')) {
        throw new Error(
          'DM access not enabled. Please create an app password with "Allow access to your direct messages" enabled.'
        );
      }
      throw error;
    }
  }

  /**
   * Get or create a conversation with specific members
   * @param memberDids - DIDs of the users to start a conversation with
   */
  async getOrCreateConversation(memberDids: string[]): Promise<BlueskyConversation> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.agent.api.chat.bsky.convo.getConvoForMembers(
        { members: memberDids },
        { headers: { 'atproto-proxy': 'did:web:api.bsky.chat#bsky_chat' } }
      );

      return this.mapConversation(response.data.convo);
    } catch (error: any) {
      if (error?.message?.includes('Bad token scope')) {
        throw new Error(
          'DM access not enabled. Please create an app password with "Allow access to your direct messages" enabled.'
        );
      }
      throw error;
    }
  }

  /**
   * Send a DM to a conversation
   * @param convoId - The conversation ID
   * @param text - The message text
   */
  async sendMessage(convoId: string, text: string): Promise<SendMessageResult> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.agent.api.chat.bsky.convo.sendMessage(
        { convoId, message: { text } },
        { encoding: 'application/json', headers: { 'atproto-proxy': 'did:web:api.bsky.chat#bsky_chat' } }
      );

      return {
        id: response.data.id,
        conversationId: convoId
      };
    } catch (error: any) {
      if (error?.message?.includes('Bad token scope')) {
        throw new Error(
          'DM access not enabled. Please create an app password with "Allow access to your direct messages" enabled.'
        );
      }
      throw error;
    }
  }

  /**
   * Send a DM to a user by DID (creates conversation if needed)
   * @param userDid - The DID of the user to message
   * @param text - The message text
   */
  async sendMessageToUser(userDid: string, text: string): Promise<SendMessageResult> {
    // Get or create conversation with the user
    const convo = await this.getOrCreateConversation([userDid]);
    // Send the message
    return this.sendMessage(convo.id, text);
  }

  /**
   * Map API conversation response to BlueskyConversation
   */
  private mapConversation(convo: any): BlueskyConversation {
    return {
      id: convo.id,
      members: convo.members.map((m: any) => ({
        did: m.did,
        handle: m.handle,
        displayName: m.displayName
      })),
      lastMessage: convo.lastMessage ? {
        text: convo.lastMessage.text || '',
        sentAt: convo.lastMessage.sentAt,
        senderDid: convo.lastMessage.sender?.did || ''
      } : undefined,
      unreadCount: convo.unreadCount || 0,
      muted: convo.muted || false
    };
  }

  /**
   * Map API message response to BlueskyMessage
   */
  private mapMessage(msg: any, convoId: string): BlueskyMessage {
    return {
      id: msg.id,
      text: msg.text || '',
      sender: {
        did: msg.sender?.did || '',
        handle: msg.sender?.handle || '',
        displayName: msg.sender?.displayName
      },
      sentAt: msg.sentAt,
      conversationId: convoId
    };
  }

  /**
   * Get new DM messages since a given timestamp
   * Iterates through conversations and collects messages newer than `since`
   * @param since - ISO timestamp to filter messages (optional, returns all recent if omitted)
   * @returns Array of new messages with conversation context
   */
  async getNewMessages(since?: string): Promise<BlueskyMessage[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    try {
      // Get all conversations
      const conversations = await this.listConversations(50);

      const newMessages: BlueskyMessage[] = [];

      // Check each conversation for new messages
      for (const convo of conversations) {
        // Skip if no unread and we have a since timestamp
        // (optimization: if no unread, likely no new messages)
        if (since && convo.unreadCount === 0) {
          continue;
        }

        // Build a DID -> member info lookup from conversation members
        const membersByDid = new Map<string, { did: string; handle: string; displayName?: string }>();
        for (const member of convo.members) {
          membersByDid.set(member.did, member);
        }

        // Get recent messages from this conversation
        const messages = await this.getMessages(convo.id, 20);

        // Filter to messages newer than `since`
        for (const msg of messages) {
          // Skip messages from self (we only want incoming DMs)
          if (msg.sender.did === this.agent.session?.did) {
            continue;
          }

          // Filter by timestamp if provided
          if (since && msg.sentAt <= since) {
            continue;
          }

          // Enrich sender info from conversation members if handle is missing
          if (!msg.sender.handle && msg.sender.did) {
            const memberInfo = membersByDid.get(msg.sender.did);
            if (memberInfo) {
              msg.sender.handle = memberInfo.handle;
              msg.sender.displayName = msg.sender.displayName || memberInfo.displayName;
            }
          }

          newMessages.push(msg);
        }
      }

      // Sort by timestamp (oldest first)
      newMessages.sort((a, b) => a.sentAt.localeCompare(b.sentAt));

      return newMessages;
    } catch (error: any) {
      if (error?.message?.includes('Bad token scope')) {
        throw new Error(
          'DM access not enabled. Please create an app password with "Allow access to your direct messages" enabled.'
        );
      }
      throw error;
    }
  }
}
