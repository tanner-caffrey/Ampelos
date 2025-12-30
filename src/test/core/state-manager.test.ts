/**
 * StateManager Tests
 *
 * Tests for the auto-persisting reactive state manager.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StateManager, ReactiveState } from '../../core/state-manager.js';

// Mock Database
function createMockDatabase() {
  const data: Record<string, unknown> = {};

  return {
    getRawDB: vi.fn().mockReturnValue({
      data,
      read: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined)
    })
  };
}

describe('StateManager', () => {
  let stateManager: StateManager;
  let mockDb: ReturnType<typeof createMockDatabase>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockDb = createMockDatabase();
    stateManager = new StateManager(mockDb as any, { debounceMs: 50 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('should initialize without errors', async () => {
      await expect(stateManager.initialize()).resolves.not.toThrow();
    });

    it('should be idempotent', async () => {
      await stateManager.initialize();
      await stateManager.initialize();

      // Should only read once
      expect(mockDb.getRawDB().read).toHaveBeenCalledTimes(1);
    });
  });

  describe('getServiceState', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    it('should return a ReactiveState instance', () => {
      const state = stateManager.getServiceState<{ foo: string }>('agent-1', 'letta');

      expect(state).toBeDefined();
      expect(typeof state.get).toBe('function');
      expect(typeof state.set).toBe('function');
      expect(typeof state.update).toBe('function');
      expect(typeof state.flush).toBe('function');
    });

    it('should return same instance for same path', () => {
      const state1 = stateManager.getServiceState('agent-1', 'letta');
      const state2 = stateManager.getServiceState('agent-1', 'letta');

      expect(state1).toBe(state2);
    });

    it('should return different instances for different paths', () => {
      const state1 = stateManager.getServiceState('agent-1', 'letta');
      const state2 = stateManager.getServiceState('agent-2', 'letta');

      expect(state1).not.toBe(state2);
    });
  });

  describe('getGlobalState', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    it('should return a ReactiveState instance', () => {
      const state = stateManager.getGlobalState<{ cache: object }>('web-reader');

      expect(state).toBeDefined();
      expect(typeof state.get).toBe('function');
    });

    it('should use global namespace', () => {
      const state1 = stateManager.getGlobalState('vision');
      const state2 = stateManager.getGlobalState('vision');

      expect(state1).toBe(state2);
    });
  });

  describe('ReactiveState', () => {
    let state: ReactiveState<{ value: number }>;

    beforeEach(async () => {
      await stateManager.initialize();
      state = stateManager.getServiceState<{ value: number }>('agent-1', 'test');
    });

    describe('get/set', () => {
      it('should return undefined initially', () => {
        expect(state.get()).toBeUndefined();
      });

      it('should store and retrieve values', () => {
        state.set({ value: 42 });
        expect(state.get()).toEqual({ value: 42 });
      });
    });

    describe('update', () => {
      it('should update value with function', () => {
        state.set({ value: 10 });
        state.update(current => ({ value: (current?.value || 0) + 5 }));

        expect(state.get()).toEqual({ value: 15 });
      });

      it('should handle undefined current value', () => {
        state.update(current => ({ value: (current?.value ?? 0) + 1 }));

        expect(state.get()).toEqual({ value: 1 });
      });
    });

    describe('exists', () => {
      it('should return false when no value set', () => {
        expect(state.exists()).toBe(false);
      });

      it('should return true after value is set', () => {
        state.set({ value: 1 });
        expect(state.exists()).toBe(true);
      });
    });

    describe('clear', () => {
      it('should remove the value', () => {
        state.set({ value: 1 });
        state.clear();

        expect(state.exists()).toBe(false);
        expect(state.get()).toBeUndefined();
      });
    });

    describe('debounced persistence', () => {
      it('should not write immediately', () => {
        state.set({ value: 1 });

        expect(mockDb.getRawDB().write).not.toHaveBeenCalled();
      });

      it('should write after debounce delay', async () => {
        state.set({ value: 1 });

        // Advance time past debounce
        await vi.advanceTimersByTimeAsync(100);

        expect(mockDb.getRawDB().write).toHaveBeenCalled();
      });

      it('should coalesce multiple writes', async () => {
        state.set({ value: 1 });
        state.set({ value: 2 });
        state.set({ value: 3 });

        await vi.advanceTimersByTimeAsync(100);

        // Should only write once
        expect(mockDb.getRawDB().write).toHaveBeenCalledTimes(1);
      });
    });

    describe('flush', () => {
      it('should write immediately', async () => {
        state.set({ value: 1 });
        await state.flush();

        expect(mockDb.getRawDB().write).toHaveBeenCalled();
      });

      it('should cancel pending debounced write', async () => {
        state.set({ value: 1 });
        await state.flush();

        // Advance past debounce time
        await vi.advanceTimersByTimeAsync(100);

        // Should only have written once (from flush)
        expect(mockDb.getRawDB().write).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('flushAll', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    it('should flush all pending writes', async () => {
      const state1 = stateManager.getServiceState<{ v: number }>('agent-1', 'service-1');
      const state2 = stateManager.getServiceState<{ v: number }>('agent-2', 'service-2');

      state1.set({ v: 1 });
      state2.set({ v: 2 });

      await stateManager.flushAll();

      expect(mockDb.getRawDB().write).toHaveBeenCalled();
    });
  });

  describe('deleteAgentState', () => {
    beforeEach(async () => {
      await stateManager.initialize();
      // Set up data structure
      mockDb.getRawDB().data.state = {
        'agent-1': { letta: { initialized: true } },
        'agent-2': { letta: { initialized: true } }
      };
    });

    it('should remove agent state from database', async () => {
      await stateManager.deleteAgentState('agent-1');

      expect(mockDb.getRawDB().data.state['agent-1']).toBeUndefined();
      expect(mockDb.getRawDB().data.state['agent-2']).toBeDefined();
    });
  });

  describe('getAgentStates', () => {
    beforeEach(async () => {
      await stateManager.initialize();
      mockDb.getRawDB().data.state = {
        'agent-1': {
          letta: { initialized: true },
          vision: { enabled: true }
        }
      };
    });

    it('should return all states for an agent', async () => {
      const states = await stateManager.getAgentStates('agent-1');

      expect(states).toEqual({
        letta: { initialized: true },
        vision: { enabled: true }
      });
    });

    it('should return empty object for unknown agent', async () => {
      const states = await stateManager.getAgentStates('unknown-agent');

      expect(states).toEqual({});
    });
  });

  describe('preloadAgentState', () => {
    beforeEach(async () => {
      await stateManager.initialize();
      mockDb.getRawDB().data.state = {
        'agent-1': {
          letta: { initialized: true, letta_agent_id: 'letta-123' }
        }
      };
    });

    it('should preload state into cache', async () => {
      await stateManager.preloadAgentState('agent-1', ['letta']);

      const state = stateManager.getServiceState<any>('agent-1', 'letta');
      expect(state.get()).toEqual({ initialized: true, letta_agent_id: 'letta-123' });
    });
  });
});
