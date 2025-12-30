/**
 * Vision Service Tests
 *
 * Tests for VisionService singleton.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import VisionService from '../../../modules/vision/service.js';
import { createMockServiceContext, createMockReactiveState, MockServiceContext } from '../../mocks/service-context.mock.js';
import type { AgentId } from '../../../types/agent.js';

// Mock LettaService
function createMockLettaService() {
  return {
    getClient: vi.fn().mockReturnValue({
      listAgents: vi.fn().mockResolvedValue([]),
      createAgent: vi.fn().mockResolvedValue('vision-agent-123'),
      getMemoryBlocks: vi.fn().mockResolvedValue({
        persona: 'Test persona',
        human: 'Test human'
      }),
      updateMemoryBlock: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue({
        messages: [
          {
            message_type: 'tool_call_message',
            tool_call: {
              name: 'send_message',
              arguments: JSON.stringify({ message: 'A red car on a city street.' })
            }
          }
        ]
      }),
      clearMessages: vi.fn().mockResolvedValue(undefined)
    }),
    getLettaAgentId: vi.fn().mockReturnValue('letta-agent-123')
  };
}

describe('VisionService', () => {
  let service: VisionService;
  let mockContext: MockServiceContext;
  let mockLettaService: ReturnType<typeof createMockLettaService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VisionService();
    mockContext = createMockServiceContext();
    mockLettaService = createMockLettaService();

    // Setup getService to return mock Letta service
    mockContext.getService.mockReturnValue(mockLettaService);
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
      const config = { model: 'anthropic/claude-sonnet-4-20250514' };

      const globalState = createMockReactiveState<any>({});
      mockContext.getGlobalState.mockReturnValue(globalState);

      await service.initAgent(agentId, config);

      // Should complete without errors
      expect(service).toBeDefined();
    });
  });

  describe('canReconnect', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should always return true (no per-agent state needed)', () => {
      const result = service.canReconnect('test-agent' as AgentId, {});
      expect(result).toBe(true);
    });
  });

  describe('describeImage', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should create vision agent if not exists', async () => {
      const agentId = 'test-agent' as AgentId;
      const imageUrl = 'https://example.com/image.jpg';

      const globalState = createMockReactiveState<any>({});
      mockContext.getGlobalState.mockReturnValue(globalState);

      const client = mockLettaService.getClient();
      client.listAgents.mockResolvedValue([]);

      const description = await service.describeImage(agentId, imageUrl);

      expect(client.createAgent).toHaveBeenCalled();
      expect(description).toBe('A red car on a city street.');
    });

    it('should reuse existing vision agent', async () => {
      const agentId = 'test-agent' as AgentId;
      const imageUrl = 'https://example.com/image.jpg';

      const globalState = createMockReactiveState<any>({ visionAgentId: 'existing-vision-123' });
      mockContext.getGlobalState.mockReturnValue(globalState);

      const client = mockLettaService.getClient();

      const description = await service.describeImage(agentId, imageUrl);

      expect(client.createAgent).not.toHaveBeenCalled();
      expect(client.sendMessage).toHaveBeenCalledWith(
        'existing-vision-123',
        expect.any(Array)
      );
      expect(description).toBe('A red car on a city street.');
    });

    it('should use custom prompt if provided', async () => {
      const agentId = 'test-agent' as AgentId;
      const imageUrl = 'https://example.com/image.jpg';
      const customPrompt = 'What color is the main object?';

      const globalState = createMockReactiveState<any>({ visionAgentId: 'vision-123' });
      mockContext.getGlobalState.mockReturnValue(globalState);

      const client = mockLettaService.getClient();

      await service.describeImage(agentId, imageUrl, customPrompt);

      expect(client.sendMessage).toHaveBeenCalledWith(
        'vision-123',
        expect.arrayContaining([
          expect.objectContaining({ type: 'text', text: customPrompt })
        ])
      );
    });

    it('should copy caller memory blocks for context', async () => {
      const agentId = 'test-agent' as AgentId;
      const imageUrl = 'https://example.com/image.jpg';

      const globalState = createMockReactiveState<any>({ visionAgentId: 'vision-123' });
      mockContext.getGlobalState.mockReturnValue(globalState);

      const client = mockLettaService.getClient();

      await service.describeImage(agentId, imageUrl);

      // Should get memory blocks from caller agent
      expect(client.getMemoryBlocks).toHaveBeenCalledWith('letta-agent-123');
      // Should update vision agent's context block
      expect(client.updateMemoryBlock).toHaveBeenCalledWith(
        'vision-123',
        'context',
        expect.any(String)
      );
    });

    it('should clear vision agent messages after description', async () => {
      const agentId = 'test-agent' as AgentId;
      const imageUrl = 'https://example.com/image.jpg';

      const globalState = createMockReactiveState<any>({ visionAgentId: 'vision-123' });
      mockContext.getGlobalState.mockReturnValue(globalState);

      const client = mockLettaService.getClient();

      await service.describeImage(agentId, imageUrl);

      expect(client.clearMessages).toHaveBeenCalledWith('vision-123');
    });

    it('should throw if service not initialized', async () => {
      const freshService = new VisionService();
      const agentId = 'test-agent' as AgentId;
      const imageUrl = 'https://example.com/image.jpg';

      await expect(
        freshService.describeImage(agentId, imageUrl)
      ).rejects.toThrow(/not initialized/i);
    });

    it('should throw if letta service not available', async () => {
      const agentId = 'test-agent' as AgentId;
      const imageUrl = 'https://example.com/image.jpg';

      mockContext.getService.mockReturnValue(null);

      await expect(
        service.describeImage(agentId, imageUrl)
      ).rejects.toThrow(/letta/i);
    });
  });

  describe('cleanup', () => {
    it('should cleanup without errors', async () => {
      await service.init(mockContext as any);

      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});
