/**
 * Multi-Agent Chat Service Tests
 *
 * Tests for MultiAgentChatService singleton.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import MultiAgentChatService from '../../../modules/multi-agent-chat/service.js';
import { createMockServiceContext, createMockReactiveState, MockServiceContext } from '../../mocks/service-context.mock.js';
import type { AgentId } from '../../../types/agent.js';

// Mock LettaService
function createMockLettaService() {
  return {
    getClient: vi.fn().mockReturnValue({
      createGroup: vi.fn().mockResolvedValue({ id: 'group-123', name: 'Test Group' }),
      deleteGroup: vi.fn().mockResolvedValue(undefined),
      updateGroup: vi.fn().mockResolvedValue(undefined),
      sendGroupMessage: vi.fn().mockResolvedValue({
        messages: [
          {
            id: 'msg-1',
            message_type: 'assistant_message',
            role: 'assistant',
            agent_id: 'agent-1',
            content: 'Hello from agent 1',
            created_at: new Date().toISOString()
          }
        ]
      }),
      getGroupMessages: vi.fn().mockResolvedValue([])
    }),
    getLettaAgentId: vi.fn((agentId: string) => `letta-${agentId}`)
  };
}

describe('MultiAgentChatService', () => {
  let service: MultiAgentChatService;
  let mockContext: MockServiceContext;
  let mockLettaService: ReturnType<typeof createMockLettaService>;

  const testConfig = {
    default_manager_type: 'round_robin'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MultiAgentChatService();
    mockContext = createMockServiceContext();
    mockLettaService = createMockLettaService();

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

      const globalState = createMockReactiveState<any>({
        initialized: false,
        conversations: {}
      });
      mockContext.getGlobalState.mockReturnValue(globalState);

      await service.initAgent(agentId, testConfig);

      expect(globalState.set).toHaveBeenCalledWith(
        expect.objectContaining({ initialized: true })
      );
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

  describe('createConversation', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        initialized: true,
        conversations: {}
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
    });

    it('should create new conversation with Letta group', async () => {
      const request = {
        name: 'Test Conversation',
        description: 'A test conversation',
        participants: ['agent-1', 'agent-2'] as AgentId[]
      };

      const conversation = await service.createConversation(request, 'user-123');

      expect(conversation.id).toBeDefined();
      expect(conversation.name).toBe('Test Conversation');
      expect(conversation.participants).toEqual(['agent-1', 'agent-2']);
      expect(mockLettaService.getClient().createGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Conversation',
          agent_ids: ['letta-agent-1', 'letta-agent-2'],
          manager_type: 'round_robin'
        })
      );
    });

    it('should use specified manager type', async () => {
      const request = {
        name: 'Test Conversation',
        participants: ['agent-1'] as AgentId[],
        manager_type: 'sleeptime' as const
      };

      await service.createConversation(request, 'user-123');

      expect(mockLettaService.getClient().createGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          manager_type: 'sleeptime'
        })
      );
    });
  });

  describe('getConversation', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        initialized: true,
        conversations: {
          'conv-123': {
            id: 'conv-123',
            group_id: 'group-123',
            name: 'Existing Conversation',
            created_at: new Date().toISOString(),
            created_by: 'user-123',
            participants: ['agent-1', 'agent-2'],
            manager_type: 'round_robin'
          }
        }
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
    });

    it('should return existing conversation', async () => {
      const conversation = await service.getConversation('conv-123');

      expect(conversation).not.toBeNull();
      expect(conversation?.name).toBe('Existing Conversation');
    });

    it('should return null for non-existent conversation', async () => {
      const conversation = await service.getConversation('nonexistent');

      expect(conversation).toBeNull();
    });
  });

  describe('listConversations', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        initialized: true,
        conversations: {
          'conv-1': {
            id: 'conv-1',
            group_id: 'group-1',
            name: 'Conversation 1',
            created_at: new Date().toISOString(),
            created_by: 'user-123',
            participants: ['agent-1'],
            manager_type: 'round_robin'
          },
          'conv-2': {
            id: 'conv-2',
            group_id: 'group-2',
            name: 'Conversation 2',
            created_at: new Date().toISOString(),
            created_by: 'user-123',
            participants: ['agent-2'],
            manager_type: 'round_robin'
          }
        }
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
    });

    it('should return all conversations', async () => {
      const conversations = await service.listConversations();

      expect(conversations).toHaveLength(2);
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        initialized: true,
        conversations: {
          'conv-123': {
            id: 'conv-123',
            group_id: 'group-123',
            name: 'Test Conversation',
            created_at: new Date().toISOString(),
            created_by: 'user-123',
            participants: ['agent-1', 'agent-2'],
            manager_type: 'round_robin'
          }
        }
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
    });

    it('should send message to Letta group', async () => {
      const messages = await service.sendMessage('conv-123', { text: 'Hello!' });

      expect(mockLettaService.getClient().sendGroupMessage).toHaveBeenCalledWith(
        'group-123',
        'Hello!'
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello from agent 1');
    });

    it('should throw for non-existent conversation', async () => {
      await expect(
        service.sendMessage('nonexistent', { text: 'Hello!' })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('addParticipant', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        initialized: true,
        conversations: {
          'conv-123': {
            id: 'conv-123',
            group_id: 'group-123',
            name: 'Test Conversation',
            created_at: new Date().toISOString(),
            created_by: 'user-123',
            participants: ['agent-1'],
            manager_type: 'round_robin'
          }
        }
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
    });

    it('should add participant to conversation', async () => {
      const conversation = await service.addParticipant('conv-123', {
        agent_id: 'agent-2' as AgentId
      });

      expect(conversation.participants).toContain('agent-2');
      expect(mockLettaService.getClient().updateGroup).toHaveBeenCalled();
    });

    it('should not duplicate existing participant', async () => {
      const conversation = await service.addParticipant('conv-123', {
        agent_id: 'agent-1' as AgentId
      });

      expect(conversation.participants).toEqual(['agent-1']);
      expect(mockLettaService.getClient().updateGroup).not.toHaveBeenCalled();
    });

    it('should throw for non-existent conversation', async () => {
      await expect(
        service.addParticipant('nonexistent', { agent_id: 'agent-2' as AgentId })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('removeParticipant', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        initialized: true,
        conversations: {
          'conv-123': {
            id: 'conv-123',
            group_id: 'group-123',
            name: 'Test Conversation',
            created_at: new Date().toISOString(),
            created_by: 'user-123',
            participants: ['agent-1', 'agent-2'],
            manager_type: 'round_robin'
          }
        }
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
    });

    it('should remove participant from conversation', async () => {
      const conversation = await service.removeParticipant('conv-123', 'agent-2' as AgentId);

      expect(conversation.participants).not.toContain('agent-2');
      expect(mockLettaService.getClient().updateGroup).toHaveBeenCalled();
    });

    it('should not modify if participant not in conversation', async () => {
      const conversation = await service.removeParticipant('conv-123', 'agent-3' as AgentId);

      expect(conversation.participants).toEqual(['agent-1', 'agent-2']);
      expect(mockLettaService.getClient().updateGroup).not.toHaveBeenCalled();
    });

    it('should throw when removing last participant', async () => {
      // First remove agent-2
      await service.removeParticipant('conv-123', 'agent-2' as AgentId);

      const globalState = createMockReactiveState<any>({
        initialized: true,
        conversations: {
          'conv-123': {
            id: 'conv-123',
            group_id: 'group-123',
            name: 'Test Conversation',
            created_at: new Date().toISOString(),
            created_by: 'user-123',
            participants: ['agent-1'],
            manager_type: 'round_robin'
          }
        }
      });
      mockContext.getGlobalState.mockReturnValue(globalState);

      await expect(
        service.removeParticipant('conv-123', 'agent-1' as AgentId)
      ).rejects.toThrow(/last participant/i);
    });
  });

  describe('deleteConversation', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        initialized: true,
        conversations: {
          'conv-123': {
            id: 'conv-123',
            group_id: 'group-123',
            name: 'Test Conversation',
            created_at: new Date().toISOString(),
            created_by: 'user-123',
            participants: ['agent-1'],
            manager_type: 'round_robin'
          }
        }
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
    });

    it('should delete conversation and Letta group', async () => {
      await service.deleteConversation('conv-123');

      expect(mockLettaService.getClient().deleteGroup).toHaveBeenCalledWith('group-123');
    });

    it('should throw for non-existent conversation', async () => {
      await expect(
        service.deleteConversation('nonexistent')
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('getMessages', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        initialized: true,
        conversations: {
          'conv-123': {
            id: 'conv-123',
            group_id: 'group-123',
            name: 'Test Conversation',
            created_at: new Date().toISOString(),
            created_by: 'user-123',
            participants: ['agent-1'],
            manager_type: 'round_robin'
          }
        }
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
    });

    it('should return messages from Letta group', async () => {
      mockLettaService.getClient().getGroupMessages.mockResolvedValue([
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          created_at: new Date().toISOString()
        },
        {
          id: 'msg-2',
          role: 'assistant',
          agent_id: 'agent-1',
          content: 'Hi there!',
          created_at: new Date().toISOString()
        }
      ]);

      const messages = await service.getMessages('conv-123');

      expect(mockLettaService.getClient().getGroupMessages).toHaveBeenCalledWith('group-123', 50);
      expect(messages).toHaveLength(2);
    });

    it('should throw for non-existent conversation', async () => {
      await expect(
        service.getMessages('nonexistent')
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('cleanup', () => {
    it('should cleanup without errors', async () => {
      await service.init(mockContext as any);

      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});
