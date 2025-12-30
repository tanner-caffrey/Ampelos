/**
 * Mock for ServiceContext
 *
 * Provides a mock implementation of ServiceContext for testing services
 * without requiring the full Ampelos infrastructure.
 */

import { vi } from 'vitest';
import type { ServiceContext } from '../../types/service.js';
import type { AgentId } from '../../types/agent.js';
import type { ReactiveState } from '../../core/state-manager.js';

export interface MockReactiveState<T> {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
}

export interface MockServiceContext {
  getState: ReturnType<typeof vi.fn>;
  getGlobalState: ReturnType<typeof vi.fn>;
  getService: ReturnType<typeof vi.fn>;
  getAgentMetadata: ReturnType<typeof vi.fn>;
  getEnabledAgentIds: ReturnType<typeof vi.fn>;
  registerLettaAgent: ReturnType<typeof vi.fn>;
  getLettaTools: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock reactive state object
 */
export function createMockReactiveState<T>(initialValue?: T): MockReactiveState<T> {
  let currentValue = initialValue;

  return {
    get: vi.fn(() => currentValue),
    set: vi.fn((newValue: T) => {
      currentValue = newValue;
    }),
    flush: vi.fn().mockResolvedValue(undefined)
  };
}

/**
 * Create a mock ServiceContext with sensible defaults
 */
export function createMockServiceContext(overrides: Partial<MockServiceContext> = {}): MockServiceContext {
  // State storage for mock
  const stateStore = new Map<string, MockReactiveState<any>>();
  const globalStateStore = new Map<string, MockReactiveState<any>>();

  const defaultMock: MockServiceContext = {
    getState: vi.fn((agentId: AgentId, serviceName: string) => {
      const key = `${agentId}.${serviceName}`;
      if (!stateStore.has(key)) {
        stateStore.set(key, createMockReactiveState(undefined));
      }
      return stateStore.get(key)!;
    }),

    getGlobalState: vi.fn((namespace: string) => {
      if (!globalStateStore.has(namespace)) {
        globalStateStore.set(namespace, createMockReactiveState(undefined));
      }
      return globalStateStore.get(namespace)!;
    }),

    getService: vi.fn().mockReturnValue(undefined),

    getAgentMetadata: vi.fn((agentId: AgentId) => ({
      agent_id: agentId,
      agent_name: `Agent-${agentId}`,
      enabled: true,
      modules: {}
    })),

    getEnabledAgentIds: vi.fn().mockReturnValue(['test-agent-1', 'test-agent-2']),

    registerLettaAgent: vi.fn(),

    getLettaTools: vi.fn().mockReturnValue([])
  };

  return { ...defaultMock, ...overrides };
}

/**
 * Helper to set up state for a specific agent/service combination
 */
export function setMockState<T>(
  context: MockServiceContext,
  agentId: AgentId,
  serviceName: string,
  state: T
): void {
  const mockState = createMockReactiveState(state);
  context.getState.mockImplementation((aId: AgentId, sName: string) => {
    if (aId === agentId && sName === serviceName) {
      return mockState;
    }
    return createMockReactiveState(undefined);
  });
}

/**
 * Reset all mock functions on a mock context
 */
export function resetMockServiceContext(mock: MockServiceContext): void {
  Object.values(mock).forEach(fn => {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset();
    }
  });
}
