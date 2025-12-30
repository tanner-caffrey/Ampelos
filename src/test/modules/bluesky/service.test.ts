/**
 * Bluesky Service Tests
 *
 * Tests for BlueskyService singleton.
 * Following TDD: These tests are written before implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @atproto/api before importing service
vi.mock('@atproto/api', () => {
  const mockSession = {
    did: 'did:plc:testuser123',
    handle: 'testagent.bsky.social',
    accessJwt: 'mock-access-token',
    refreshJwt: 'mock-refresh-token'
  };

  class MockBskyAgent {
    session = mockSession;

    login = vi.fn().mockResolvedValue({
      success: true,
      data: mockSession
    });

    post = vi.fn().mockResolvedValue({
      uri: 'at://did:plc:testuser123/app.bsky.feed.post/abc123',
      cid: 'bafyreimockpostcid'
    });

    getTimeline = vi.fn().mockResolvedValue({
      success: true,
      data: { cursor: 'cursor', feed: [] }
    });

    getAuthorFeed = vi.fn().mockResolvedValue({
      success: true,
      data: { cursor: 'cursor', feed: [] }
    });

    app = {
      bsky: {
        feed: {
          searchPosts: vi.fn().mockResolvedValue({
            success: true,
            data: { cursor: 'cursor', posts: [] }
          })
        },
        notification: {
          listNotifications: vi.fn().mockResolvedValue({
            success: true,
            data: { cursor: 'cursor', notifications: [] }
          })
        }
      }
    };
  }

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

// Mock environment variables
vi.stubEnv('BLUESKY_TESTAGENT_PASSWORD', 'test-app-password');

import BlueskyService from '../../../modules/bluesky/service.js';
import { createMockServiceContext, createMockReactiveState, MockServiceContext } from '../../mocks/service-context.mock.js';
import type { AgentId } from '../../../types/agent.js';

describe('BlueskyService', () => {
  let service: BlueskyService;
  let mockContext: MockServiceContext;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BlueskyService();
    mockContext = createMockServiceContext();
  });

  describe('init', () => {
    it('should initialize service context', async () => {
      await service.init(mockContext as any);

      // Service should be ready for agent initialization
      expect(service).toBeDefined();
    });
  });

  describe('initAgent', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should login and store state on first init', async () => {
      const agentId = 'test-agent' as AgentId;
      const config = {
        handle: 'testagent.bsky.social'
      };

      // Mock agent metadata to return proper name
      mockContext.getAgentMetadata.mockReturnValue({
        agent_id: agentId,
        agent_name: 'TestAgent',
        enabled: true,
        modules: {}
      });

      const state = createMockReactiveState<any>({});
      mockContext.getState.mockReturnValue(state);

      await service.initAgent(agentId, config);

      // State should be updated with initialized flag
      expect(state.set).toHaveBeenCalledWith(
        expect.objectContaining({
          initialized: true,
          handle: 'testagent.bsky.social'
        })
      );
    });

    it('should use environment variable for password', async () => {
      const agentId = 'test-agent' as AgentId;
      const config = {
        handle: 'testagent.bsky.social'
      };

      mockContext.getAgentMetadata.mockReturnValue({
        agent_id: agentId,
        agent_name: 'TestAgent',
        enabled: true,
        modules: {}
      });

      const state = createMockReactiveState<any>({});
      mockContext.getState.mockReturnValue(state);

      // Should read BLUESKY_TESTAGENT_PASSWORD from env
      await service.initAgent(agentId, config);

      expect(state.set).toHaveBeenCalled();
    });

    it('should throw if no password in environment', async () => {
      const agentId = 'agent-no-password' as AgentId;
      const config = {
        handle: 'nopassword.bsky.social'
      };

      mockContext.getAgentMetadata.mockReturnValue({
        agent_id: agentId,
        agent_name: 'AgentNoPassword',
        enabled: true,
        modules: {}
      });

      const state = createMockReactiveState<any>({});
      mockContext.getState.mockReturnValue(state);

      // No BLUESKY_AGENTNOPASSWORD_PASSWORD in env
      await expect(
        service.initAgent(agentId, config)
      ).rejects.toThrow(/password/i);
    });

    it('should throw if no handle in config', async () => {
      const agentId = 'test-agent' as AgentId;
      const config = {} as any; // Intentionally empty to test validation

      mockContext.getAgentMetadata.mockReturnValue({
        agent_id: agentId,
        agent_name: 'TestAgent',
        enabled: true,
        modules: {}
      });

      const state = createMockReactiveState<any>({});
      mockContext.getState.mockReturnValue(state);

      await expect(
        service.initAgent(agentId, config)
      ).rejects.toThrow(/handle/i);
    });
  });

  describe('canReconnect', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should return true if state has valid session', () => {
      const state = {
        initialized: true,
        handle: 'test.bsky.social',
        did: 'did:plc:test123'
      };

      const result = service.canReconnect('test-agent' as AgentId, state);

      expect(result).toBe(true);
    });

    it('should return false if state is empty', () => {
      const result = service.canReconnect('test-agent' as AgentId, {});

      expect(result).toBe(false);
    });

    it('should return false if not initialized', () => {
      const state = {
        initialized: false
      };

      const result = service.canReconnect('test-agent' as AgentId, state);

      expect(result).toBe(false);
    });
  });

  describe('getClient', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should return client for initialized agent', async () => {
      const agentId = 'test-agent' as AgentId;
      const config = { handle: 'testagent.bsky.social' };

      mockContext.getAgentMetadata.mockReturnValue({
        agent_id: agentId,
        agent_name: 'TestAgent',
        enabled: true,
        modules: {}
      });

      const state = createMockReactiveState<any>({});
      mockContext.getState.mockReturnValue(state);

      await service.initAgent(agentId, config);

      const client = service.getClient(agentId);
      expect(client).toBeDefined();
    });

    it('should throw for uninitialized agent', () => {
      expect(() => {
        service.getClient('unknown-agent' as AgentId);
      }).toThrow(/not initialized/i);
    });
  });

  describe('isAgentInitialized', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should return true for initialized agent', async () => {
      const agentId = 'test-agent' as AgentId;
      const config = { handle: 'testagent.bsky.social' };

      mockContext.getAgentMetadata.mockReturnValue({
        agent_id: agentId,
        agent_name: 'TestAgent',
        enabled: true,
        modules: {}
      });

      const state = createMockReactiveState<any>({});
      mockContext.getState.mockReturnValue(state);

      await service.initAgent(agentId, config);

      expect(service.isAgentInitialized(agentId)).toBe(true);
    });

    it('should return false for uninitialized agent', () => {
      expect(service.isAgentInitialized('unknown' as AgentId)).toBe(false);
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should clean up all agent clients', async () => {
      const agentId = 'test-agent' as AgentId;
      const config = { handle: 'testagent.bsky.social' };

      mockContext.getAgentMetadata.mockReturnValue({
        agent_id: agentId,
        agent_name: 'TestAgent',
        enabled: true,
        modules: {}
      });

      const state = createMockReactiveState<any>({});
      mockContext.getState.mockReturnValue(state);

      await service.initAgent(agentId, config);
      await service.cleanup();

      expect(service.isAgentInitialized(agentId)).toBe(false);
    });
  });

  describe('cleanupAgent', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should clean up specific agent client', async () => {
      const agentId = 'test-agent' as AgentId;
      const config = { handle: 'testagent.bsky.social' };

      mockContext.getAgentMetadata.mockReturnValue({
        agent_id: agentId,
        agent_name: 'TestAgent',
        enabled: true,
        modules: {}
      });

      const state = createMockReactiveState<any>({});
      mockContext.getState.mockReturnValue(state);

      await service.initAgent(agentId, config);
      await service.cleanupAgent(agentId);

      expect(service.isAgentInitialized(agentId)).toBe(false);
    });
  });
});
