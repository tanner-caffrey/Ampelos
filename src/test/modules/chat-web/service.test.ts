/**
 * Chat Web Service Tests
 *
 * Tests for ChatWebService singleton.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import ChatWebService from '../../../modules/chat-web/service.js';
import { createMockServiceContext, createMockReactiveState, MockServiceContext } from '../../mocks/service-context.mock.js';
import type { AgentId } from '../../../types/agent.js';

describe('ChatWebService', () => {
  let service: ChatWebService;
  let mockContext: MockServiceContext;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ChatWebService();
    mockContext = createMockServiceContext();
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

    it('should initialize for a specific agent', async () => {
      const agentId = 'test-agent' as AgentId;

      const agentState = createMockReactiveState<any>({});
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent(agentId, {});

      expect(agentState.set).toHaveBeenCalledWith({ initialized: true });
      expect(service.isAgentInitialized(agentId)).toBe(true);
    });

    it('should throw if service not initialized', async () => {
      const freshService = new ChatWebService();
      const agentId = 'test-agent' as AgentId;

      await expect(
        freshService.initAgent(agentId, {})
      ).rejects.toThrow(/not initialized/i);
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

    it('should return true even with empty state', () => {
      const result = service.canReconnect('test-agent' as AgentId, {});
      expect(result).toBe(true);
    });
  });

  describe('isAgentInitialized', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should return true for initialized agent', async () => {
      const agentId = 'test-agent' as AgentId;

      const agentState = createMockReactiveState<any>({});
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent(agentId, {});

      expect(service.isAgentInitialized(agentId)).toBe(true);
    });

    it('should return false for uninitialized agent', () => {
      const agentId = 'unknown-agent' as AgentId;

      expect(service.isAgentInitialized(agentId)).toBe(false);
    });
  });

  describe('cleanupAgent', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should cleanup agent and remove from initialized set', async () => {
      const agentId = 'test-agent' as AgentId;

      const agentState = createMockReactiveState<any>({});
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent(agentId, {});
      expect(service.isAgentInitialized(agentId)).toBe(true);

      await service.cleanupAgent(agentId);
      expect(service.isAgentInitialized(agentId)).toBe(false);
    });

    it('should handle cleanup of non-initialized agent', async () => {
      const agentId = 'unknown-agent' as AgentId;

      await expect(
        service.cleanupAgent(agentId)
      ).resolves.not.toThrow();
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should cleanup all agents', async () => {
      const agentState = createMockReactiveState<any>({});
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent('agent-1' as AgentId, {});
      await service.initAgent('agent-2' as AgentId, {});

      expect(service.isAgentInitialized('agent-1' as AgentId)).toBe(true);
      expect(service.isAgentInitialized('agent-2' as AgentId)).toBe(true);

      await service.cleanup();

      expect(service.isAgentInitialized('agent-1' as AgentId)).toBe(false);
      expect(service.isAgentInitialized('agent-2' as AgentId)).toBe(false);
    });

    it('should cleanup without errors', async () => {
      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});
