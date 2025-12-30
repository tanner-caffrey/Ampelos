/**
 * AgentRegistry Tests
 *
 * Tests for the runtime agent metadata cache.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry } from '../../core/agent-registry.js';
import type { AgentId } from '../../types/agent.js';

// Mock AgentStore
function createMockAgentStore() {
  return {
    getAllAgents: vi.fn(),
    getAgent: vi.fn(),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn()
  };
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  let mockStore: ReturnType<typeof createMockAgentStore>;

  const mockAgents = [
    {
      id: 'void-play',
      name: 'Void',
      enabled: true
    },
    {
      id: 'echo',
      name: 'Echo',
      enabled: false
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = createMockAgentStore();
    mockStore.getAllAgents.mockResolvedValue(mockAgents);
    registry = new AgentRegistry(mockStore as any);
  });

  describe('getStore', () => {
    it('should return the underlying store', () => {
      expect(registry.getStore()).toBe(mockStore);
    });
  });

  describe('loadAgents', () => {
    it('should load agents from store into cache', async () => {
      await registry.loadAgents();

      expect(mockStore.getAllAgents).toHaveBeenCalled();
      expect(registry.getAllAgents()).toHaveLength(2);
    });

    it('should clear cache before loading', async () => {
      await registry.loadAgents();

      // Change mock data
      mockStore.getAllAgents.mockResolvedValue([mockAgents[0]]);

      await registry.loadAgents();

      expect(registry.getAllAgents()).toHaveLength(1);
    });
  });

  describe('reload', () => {
    it('should reload agents from store', async () => {
      await registry.loadAgents();
      await registry.reload();

      expect(mockStore.getAllAgents).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshAgent', () => {
    beforeEach(async () => {
      await registry.loadAgents();
    });

    it('should refresh a single agent in cache', async () => {
      const updatedAgent = { ...mockAgents[0], name: 'VoidUpdated' };
      mockStore.getAgent.mockResolvedValue(updatedAgent);

      const result = await registry.refreshAgent('void-play' as AgentId);

      expect(result?.agent_name).toBe('VoidUpdated');
    });

    it('should remove agent from cache if not found', async () => {
      mockStore.getAgent.mockResolvedValue(null);

      const result = await registry.refreshAgent('void-play' as AgentId);

      expect(result).toBeNull();
      expect(registry.hasAgent('void-play' as AgentId)).toBe(false);
    });
  });

  describe('addToCache', () => {
    it('should add agent to cache', () => {
      const newAgent = {
        id: 'new-agent',
        name: 'NewAgent',
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const metadata = registry.addToCache(newAgent);

      expect(metadata.agent_id).toBe('new-agent');
      expect(registry.hasAgent('new-agent' as AgentId)).toBe(true);
    });
  });

  describe('removeFromCache', () => {
    beforeEach(async () => {
      await registry.loadAgents();
    });

    it('should remove agent from cache', () => {
      registry.removeFromCache('void-play' as AgentId);

      expect(registry.hasAgent('void-play' as AgentId)).toBe(false);
    });
  });

  describe('getAgent', () => {
    beforeEach(async () => {
      await registry.loadAgents();
    });

    it('should return agent metadata by ID', () => {
      const agent = registry.getAgent('void-play' as AgentId);

      expect(agent).toBeDefined();
      expect(agent?.agent_name).toBe('Void');
    });

    it('should return undefined for unknown agent', () => {
      const agent = registry.getAgent('unknown' as AgentId);

      expect(agent).toBeUndefined();
    });
  });

  describe('getEnabledAgents', () => {
    beforeEach(async () => {
      await registry.loadAgents();
    });

    it('should return only enabled agents', () => {
      const agents = registry.getEnabledAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].agent_id).toBe('void-play');
    });
  });

  describe('getAllAgents', () => {
    beforeEach(async () => {
      await registry.loadAgents();
    });

    it('should return all agents', () => {
      const agents = registry.getAllAgents();

      expect(agents).toHaveLength(2);
    });
  });

  describe('hasAgent', () => {
    beforeEach(async () => {
      await registry.loadAgents();
    });

    it('should return true for existing agent', () => {
      expect(registry.hasAgent('void-play' as AgentId)).toBe(true);
    });

    it('should return false for unknown agent', () => {
      expect(registry.hasAgent('unknown' as AgentId)).toBe(false);
    });
  });

  describe('isEnabled', () => {
    beforeEach(async () => {
      await registry.loadAgents();
    });

    it('should return true for enabled agent', () => {
      expect(registry.isEnabled('void-play' as AgentId)).toBe(true);
    });

    it('should return false for disabled agent', () => {
      expect(registry.isEnabled('echo' as AgentId)).toBe(false);
    });

    it('should return false for unknown agent', () => {
      expect(registry.isEnabled('unknown' as AgentId)).toBe(false);
    });
  });

  // Note: getModules() and validateModuleNames() were removed in the
  // "all modules available to all agents" refactor. Tests removed.
});
