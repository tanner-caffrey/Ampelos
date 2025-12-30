/**
 * Mock for LettaClientWrapper
 *
 * Provides a mock implementation of the Letta client for testing services
 * that depend on Letta operations.
 */

import { vi } from 'vitest';
import type { LettaClientWrapper, MemoryBlockDetailed, AgentInfo, CreateAgentOptions } from '../../core/letta/letta-client.js';

export interface MockLettaClient {
  // Agent operations
  agentExists: ReturnType<typeof vi.fn>;
  getAgent: ReturnType<typeof vi.fn>;
  createAgent: ReturnType<typeof vi.fn>;
  deleteAgent: ReturnType<typeof vi.fn>;
  listAgents: ReturnType<typeof vi.fn>;
  updateAgentModel: ReturnType<typeof vi.fn>;

  // Memory block operations
  createBlock: ReturnType<typeof vi.fn>;
  attachBlockToAgent: ReturnType<typeof vi.fn>;
  detachBlockFromAgent: ReturnType<typeof vi.fn>;
  getMemoryBlocks: ReturnType<typeof vi.fn>;
  getMemoryBlocksDetailed: ReturnType<typeof vi.fn>;
  updateMemoryBlock: ReturnType<typeof vi.fn>;
  addMemoryBlockToAgent: ReturnType<typeof vi.fn>;

  // Messaging
  sendMessage: ReturnType<typeof vi.fn>;
  sendMessageStream: ReturnType<typeof vi.fn>;
  getMessages: ReturnType<typeof vi.fn>;
  clearMessages: ReturnType<typeof vi.fn>;

  // Tools
  createTool: ReturnType<typeof vi.fn>;
  attachTool: ReturnType<typeof vi.fn>;
  detachTool: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  listAgentTools: ReturnType<typeof vi.fn>;
  getToolByName: ReturnType<typeof vi.fn>;

  // Models
  listModels: ReturnType<typeof vi.fn>;

  // Groups
  createGroup: ReturnType<typeof vi.fn>;
  getGroup: ReturnType<typeof vi.fn>;
  listGroups: ReturnType<typeof vi.fn>;
  updateGroup: ReturnType<typeof vi.fn>;
  deleteGroup: ReturnType<typeof vi.fn>;
  sendGroupMessage: ReturnType<typeof vi.fn>;
  getGroupMessages: ReturnType<typeof vi.fn>;

  // Raw client access
  getRawClient: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock LettaClientWrapper with sensible defaults
 */
export function createMockLettaClient(overrides: Partial<MockLettaClient> = {}): MockLettaClient {
  const defaultMock: MockLettaClient = {
    // Agent operations
    agentExists: vi.fn().mockResolvedValue(true),
    getAgent: vi.fn().mockResolvedValue({
      id: 'mock-letta-agent-id',
      name: 'MockAgent',
      model: 'gpt-4',
      embedding: 'text-embedding-ada-002',
      created_at: '2024-01-01T00:00:00Z'
    } as AgentInfo),
    createAgent: vi.fn().mockResolvedValue('mock-letta-agent-id'),
    deleteAgent: vi.fn().mockResolvedValue(undefined),
    listAgents: vi.fn().mockResolvedValue([]),
    updateAgentModel: vi.fn().mockResolvedValue(undefined),

    // Memory block operations
    createBlock: vi.fn().mockResolvedValue('mock-block-id'),
    attachBlockToAgent: vi.fn().mockResolvedValue(undefined),
    detachBlockFromAgent: vi.fn().mockResolvedValue(undefined),
    getMemoryBlocks: vi.fn().mockResolvedValue({}),
    getMemoryBlocksDetailed: vi.fn().mockResolvedValue([]),
    updateMemoryBlock: vi.fn().mockResolvedValue(undefined),
    addMemoryBlockToAgent: vi.fn().mockResolvedValue('mock-block-id'),

    // Messaging
    sendMessage: vi.fn().mockResolvedValue({ messages: [], usage: { step_count: 1 } }),
    sendMessageStream: vi.fn().mockImplementation(async function* () {
      yield { message_type: 'assistant_message', content: 'Mock response' };
    }),
    getMessages: vi.fn().mockResolvedValue([]),
    clearMessages: vi.fn().mockResolvedValue(undefined),

    // Tools
    createTool: vi.fn().mockResolvedValue({ id: 'mock-tool-id', name: 'mock_tool' }),
    attachTool: vi.fn().mockResolvedValue(undefined),
    detachTool: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue([]),
    listAgentTools: vi.fn().mockResolvedValue([]),
    getToolByName: vi.fn().mockResolvedValue(null),

    // Models
    listModels: vi.fn().mockResolvedValue(['gpt-4', 'gpt-3.5-turbo']),

    // Groups
    createGroup: vi.fn().mockResolvedValue({
      id: 'mock-group-id',
      name: 'MockGroup',
      agent_ids: [],
      manager_type: 'round_robin',
      created_at: '2024-01-01T00:00:00Z'
    }),
    getGroup: vi.fn().mockResolvedValue(null),
    listGroups: vi.fn().mockResolvedValue([]),
    updateGroup: vi.fn().mockResolvedValue({}),
    deleteGroup: vi.fn().mockResolvedValue(undefined),
    sendGroupMessage: vi.fn().mockResolvedValue({ messages: [] }),
    getGroupMessages: vi.fn().mockResolvedValue([]),

    // Raw client access
    getRawClient: vi.fn().mockReturnValue({})
  };

  return { ...defaultMock, ...overrides };
}

/**
 * Reset all mock functions on a mock client
 */
export function resetMockLettaClient(mock: MockLettaClient): void {
  Object.values(mock).forEach(fn => {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset();
    }
  });
}
