/**
 * Body and Inventory Service Tests
 *
 * Tests for BodyAndInventoryService singleton.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import BodyAndInventoryService from '../../../modules/embodiment/service.js';
import { createMockServiceContext, createMockReactiveState, MockServiceContext } from '../../mocks/service-context.mock.js';
import type { AgentId } from '../../../types/agent.js';

// Mock LettaService
function createMockLettaService() {
  return {
    getClient: vi.fn().mockReturnValue({
      updateMemoryBlock: vi.fn().mockResolvedValue(undefined),
      getMemoryBlocks: vi.fn().mockResolvedValue({})
    }),
    getLettaAgentId: vi.fn().mockReturnValue('letta-agent-123')
  };
}

describe('BodyAndInventoryService', () => {
  let service: BodyAndInventoryService;
  let mockContext: MockServiceContext;
  let mockLettaService: ReturnType<typeof createMockLettaService>;

  const testConfig = {
    default_body_parts: {
      head: { descriptors: { hair: 'black' } },
      hands: { descriptors: { fingers: '10' } }
    },
    max_inventory_items: 100
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BodyAndInventoryService();
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

    it('should initialize with default body parts from config', async () => {
      const agentId = 'test-agent' as AgentId;

      const agentState = createMockReactiveState<any>(null);
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent(agentId, testConfig);

      expect(agentState.set).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            parts: expect.objectContaining({
              head: expect.any(Object),
              hands: expect.any(Object)
            })
          })
        })
      );
    });

    it('should throw with invalid config', async () => {
      const agentId = 'test-agent' as AgentId;
      const invalidConfig = { default_body_parts: 'not-an-object' };

      await expect(
        service.initAgent(agentId, invalidConfig)
      ).rejects.toThrow();
    });

    it('should throw if service not initialized', async () => {
      const freshService = new BodyAndInventoryService();
      const agentId = 'test-agent' as AgentId;

      await expect(
        freshService.initAgent(agentId, testConfig)
      ).rejects.toThrow(/not initialized/i);
    });
  });

  describe('canReconnect', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should return true if state has body and inventory', () => {
      const state = {
        body: { parts: {} },
        inventory: { items: {} }
      };

      const result = service.canReconnect('test-agent' as AgentId, state);

      expect(result).toBe(true);
    });

    it('should return false if state is missing body', () => {
      const state = {
        inventory: { items: {} }
      };

      const result = service.canReconnect('test-agent' as AgentId, state);

      expect(result).toBe(false);
    });

    it('should return false if state is missing inventory', () => {
      const state = {
        body: { parts: {} }
      };

      const result = service.canReconnect('test-agent' as AgentId, state);

      expect(result).toBe(false);
    });
  });

  describe('Body Part Management', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const agentState = createMockReactiveState<any>({
        body: { parts: { head: { name: 'head', descriptors: {}, states: [] } } },
        inventory: { items: {} },
        letta_memory_block_created: true
      });
      mockContext.getState.mockReturnValue(agentState);
    });

    describe('createBodyPart', () => {
      it('should create new body part', async () => {
        const agentId = 'test-agent' as AgentId;

        const result = await service.createBodyPart(agentId, 'arm');

        expect(result.success).toBe(true);
        expect(result.message).toContain('Created body part');
      });

      it('should fail for existing body part', async () => {
        const agentId = 'test-agent' as AgentId;

        const result = await service.createBodyPart(agentId, 'head');

        expect(result.success).toBe(false);
        expect(result.message).toContain('already exists');
      });
    });

    describe('addBodyDescriptor', () => {
      it('should add descriptor to body part', async () => {
        const agentId = 'test-agent' as AgentId;

        const result = await service.addBodyDescriptor(agentId, 'head', 'color', 'pale');

        expect(result.success).toBe(true);
        expect(result.message).toContain('Added descriptor');
      });

      it('should fail for non-existent body part', async () => {
        const agentId = 'test-agent' as AgentId;

        const result = await service.addBodyDescriptor(agentId, 'tail', 'length', 'long');

        expect(result.success).toBe(false);
        expect(result.message).toContain('not found');
      });
    });

    describe('addBodyState', () => {
      it('should add state to body part', async () => {
        const agentId = 'test-agent' as AgentId;

        const result = await service.addBodyState(agentId, 'head', 'tired');

        expect(result.success).toBe(true);
        expect(result.message).toContain('Added state');
      });

      it('should fail for duplicate state', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: { head: { name: 'head', descriptors: {}, states: ['tired'] } } },
          inventory: { items: {} },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.addBodyState(agentId, 'head', 'tired');

        expect(result.success).toBe(false);
        expect(result.message).toContain('already exists');
      });
    });

    describe('listBodyParts', () => {
      it('should return all body parts', async () => {
        const agentId = 'test-agent' as AgentId;

        const result = await service.listBodyParts(agentId);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('head');
      });
    });
  });

  describe('Inventory Management', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const agentState = createMockReactiveState<any>({
        body: { parts: {} },
        inventory: { items: {} },
        letta_memory_block_created: true
      });
      mockContext.getState.mockReturnValue(agentState);

      // Initialize agent to set config
      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    describe('addInventoryItem', () => {
      it('should add item to inventory', async () => {
        const agentId = 'test-agent' as AgentId;

        const result = await service.addInventoryItem(
          agentId,
          'Sword',
          'A sharp blade',
          { material: 'steel' }
        );

        expect(result.success).toBe(true);
        expect(result.item?.name).toBe('Sword');
        expect(result.item?.id).toMatch(/^item_/);
      });

      it('should fail when inventory is full', async () => {
        const agentId = 'test-agent' as AgentId;

        // Create state with max items
        const items: Record<string, any> = {};
        for (let i = 0; i < 100; i++) {
          items[`item_${i}`] = { id: `item_${i}`, name: `Item ${i}` };
        }

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: { items },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.addInventoryItem(agentId, 'NewItem');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Inventory full');
      });
    });

    describe('removeInventoryItem', () => {
      it('should remove item from inventory', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: {
            items: { 'item_123': { id: 'item_123', name: 'Sword' } }
          },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.removeInventoryItem(agentId, 'item_123');

        expect(result.success).toBe(true);
        expect(result.message).toContain('Removed item');
      });

      it('should fail for non-existent item', async () => {
        const agentId = 'test-agent' as AgentId;

        const result = await service.removeInventoryItem(agentId, 'nonexistent');

        expect(result.success).toBe(false);
        expect(result.message).toContain('not found');
      });
    });

    describe('equipInventoryItem', () => {
      it('should equip item to slot', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: {
            items: { 'item_123': { id: 'item_123', name: 'Sword' } }
          },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.equipInventoryItem(agentId, 'item_123', 'right_hand');

        expect(result.success).toBe(true);
        expect(result.message).toContain('Equipped');
      });

      it('should unequip current item in slot', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: {
            items: {
              'item_1': { id: 'item_1', name: 'Old Sword', equipped_slot: 'right_hand' },
              'item_2': { id: 'item_2', name: 'New Sword' }
            }
          },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.equipInventoryItem(agentId, 'item_2', 'right_hand');

        expect(result.success).toBe(true);
      });
    });

    describe('unequipInventoryItem', () => {
      it('should unequip item', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: {
            items: {
              'item_123': { id: 'item_123', name: 'Sword', equipped_slot: 'right_hand' }
            }
          },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.unequipInventoryItem(agentId, 'item_123');

        expect(result.success).toBe(true);
        expect(result.message).toContain('Unequipped');
      });

      it('should fail for non-equipped item', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: {
            items: {
              'item_123': { id: 'item_123', name: 'Sword' }
            }
          },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.unequipInventoryItem(agentId, 'item_123');

        expect(result.success).toBe(false);
        expect(result.message).toContain('not equipped');
      });
    });

    describe('listInventoryItems', () => {
      it('should return all inventory items', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: {
            items: {
              'item_1': { id: 'item_1', name: 'Sword' },
              'item_2': { id: 'item_2', name: 'Shield' }
            }
          },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.listInventoryItems(agentId);

        expect(result).toHaveLength(2);
      });
    });

    describe('markItemForMemory', () => {
      it('should mark item to show in memory', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: {
            items: {
              'item_123': { id: 'item_123', name: 'Sword', show_in_memory: false }
            }
          },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.markItemForMemory(agentId, 'item_123', true);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Marked');
      });
    });
  });

  describe('Journal Support Methods', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    describe('getJournals', () => {
      it('should return only journal items', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: {
            items: {
              'item_1': { id: 'item_1', name: 'Sword', type: 'weapon' },
              'item_2': { id: 'item_2', name: 'My Journal', type: 'journal', journal_data: {} }
            }
          },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.getJournals(agentId);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('My Journal');
      });
    });

    describe('findJournal', () => {
      it('should find journal by ID', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: {
            items: {
              'journal_123': { id: 'journal_123', name: 'My Journal', type: 'journal', journal_data: { title: 'My Journal' } }
            }
          },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.findJournal(agentId, 'journal_123');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('journal_123');
      });

      it('should find journal by title', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: {
            items: {
              'journal_123': { id: 'journal_123', name: 'My Journal', type: 'journal', journal_data: { title: 'My Journal' } }
            }
          },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.findJournal(agentId, 'my journal');

        expect(result).not.toBeNull();
        expect(result?.name).toBe('My Journal');
      });

      it('should return null for non-existent journal', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: { items: {} },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        const result = await service.findJournal(agentId, 'nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('receiveItem', () => {
      it('should add received item to inventory', async () => {
        const agentId = 'test-agent' as AgentId;

        const agentState = createMockReactiveState<any>({
          body: { parts: {} },
          inventory: { items: {} },
          letta_memory_block_created: true
        });
        mockContext.getState.mockReturnValue(agentState);

        // Initialize to set config
        await service.initAgent(agentId, testConfig);

        const item = {
          id: 'received_item',
          name: 'Gift Sword',
          descriptors: {},
          properties: {},
          show_in_memory: false
        };

        const result = await service.receiveItem(agentId, item as any);

        expect(result.success).toBe(true);
        expect(result.item?.name).toBe('Gift Sword');
      });
    });
  });

  describe('cleanupAgent', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should cleanup agent without errors', async () => {
      await expect(
        service.cleanupAgent('test-agent' as AgentId)
      ).resolves.not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should cleanup without errors', async () => {
      await service.init(mockContext as any);

      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});
