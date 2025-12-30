/**
 * Journal Service Tests
 *
 * Tests for JournalService singleton.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import JournalService from '../../../modules/journal/service.js';
import { createMockServiceContext, createMockReactiveState, MockServiceContext } from '../../mocks/service-context.mock.js';
import type { AgentId } from '../../../types/agent.js';

// Mock BodyAndInventoryService
function createMockInventoryService() {
  return {
    getJournals: vi.fn().mockResolvedValue([]),
    findJournal: vi.fn().mockResolvedValue(null),
    receiveItem: vi.fn().mockResolvedValue({ success: true, item: {} }),
    modifyInventoryItem: vi.fn().mockResolvedValue({ success: true })
  };
}

describe('JournalService', () => {
  let service: JournalService;
  let mockContext: MockServiceContext;
  let mockInventoryService: ReturnType<typeof createMockInventoryService>;

  const testConfig = {
    max_journals: 5,
    max_entry_length: 1000
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new JournalService();
    mockContext = createMockServiceContext();
    mockInventoryService = createMockInventoryService();

    mockContext.getService.mockReturnValue(mockInventoryService);
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

      await service.initAgent(agentId, testConfig);

      expect(service).toBeDefined();
    });

    it('should throw if body_and_inventory service not available', async () => {
      const agentId = 'test-agent' as AgentId;

      mockContext.getService.mockImplementation(() => {
        throw new Error('Service not found');
      });

      await expect(
        service.initAgent(agentId, testConfig)
      ).rejects.toThrow(/body_and_inventory/i);
    });

    it('should throw if service not initialized', async () => {
      const freshService = new JournalService();
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

    it('should always return true (state is in inventory)', () => {
      const result = service.canReconnect('test-agent' as AgentId, {});
      expect(result).toBe(true);
    });
  });

  describe('createJournal', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    it('should create new journal', async () => {
      const agentId = 'test-agent' as AgentId;

      mockInventoryService.receiveItem.mockResolvedValue({
        success: true,
        item: {
          id: 'journal_123',
          name: 'My Journal',
          type: 'journal',
          journal_data: { title: 'My Journal', entries: [] }
        }
      });

      const result = await service.createJournal(agentId, 'My Journal', 'Personal thoughts');

      expect(result.success).toBe(true);
      expect(mockInventoryService.receiveItem).toHaveBeenCalled();
    });

    it('should fail if journal with same title exists', async () => {
      const agentId = 'test-agent' as AgentId;

      mockInventoryService.findJournal.mockResolvedValue({
        id: 'existing_journal',
        name: 'My Journal',
        type: 'journal'
      });

      const result = await service.createJournal(agentId, 'My Journal');

      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists');
    });

    it('should fail if max journals reached', async () => {
      const agentId = 'test-agent' as AgentId;

      mockInventoryService.getJournals.mockResolvedValue([
        { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }
      ]);

      const result = await service.createJournal(agentId, 'New Journal');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Maximum');
    });
  });

  describe('writeEntry', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    it('should write entry to journal', async () => {
      const agentId = 'test-agent' as AgentId;
      const journal = {
        id: 'journal_123',
        name: 'My Journal',
        type: 'journal',
        journal_data: { title: 'My Journal', entries: [] },
        properties: {}
      };

      mockInventoryService.findJournal.mockResolvedValue(journal);

      const result = await service.writeEntry(agentId, 'My Journal', 'Today was a good day.');

      expect(result.success).toBe(true);
      expect(result.entry?.content).toBe('Today was a good day.');
      expect(mockInventoryService.modifyInventoryItem).toHaveBeenCalled();
    });

    it('should fail if journal not found', async () => {
      const agentId = 'test-agent' as AgentId;

      mockInventoryService.findJournal.mockResolvedValue(null);

      const result = await service.writeEntry(agentId, 'Nonexistent', 'Content');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should fail if entry exceeds max length', async () => {
      const agentId = 'test-agent' as AgentId;
      const journal = {
        id: 'journal_123',
        name: 'My Journal',
        type: 'journal',
        journal_data: { title: 'My Journal', entries: [] },
        properties: {}
      };

      mockInventoryService.findJournal.mockResolvedValue(journal);

      const longContent = 'a'.repeat(1001);
      const result = await service.writeEntry(agentId, 'My Journal', longContent);

      expect(result.success).toBe(false);
      expect(result.message).toContain('maximum length');
    });
  });

  describe('editEntry', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    it('should edit existing entry', async () => {
      const agentId = 'test-agent' as AgentId;
      const journal = {
        id: 'journal_123',
        name: 'My Journal',
        type: 'journal',
        journal_data: {
          title: 'My Journal',
          entries: [{
            id: 'entry_1',
            content: 'Original content',
            author_agent: agentId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]
        },
        properties: {}
      };

      mockInventoryService.findJournal.mockResolvedValue(journal);

      const result = await service.editEntry(agentId, 'My Journal', 'entry_1', 'Updated content');

      expect(result.success).toBe(true);
      expect(result.entry?.content).toBe('Updated content');
    });

    it('should edit entry by index', async () => {
      const agentId = 'test-agent' as AgentId;
      const journal = {
        id: 'journal_123',
        name: 'My Journal',
        type: 'journal',
        journal_data: {
          title: 'My Journal',
          entries: [{
            id: 'entry_1',
            content: 'Original content',
            author_agent: agentId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]
        },
        properties: {}
      };

      mockInventoryService.findJournal.mockResolvedValue(journal);

      const result = await service.editEntry(agentId, 'My Journal', '1', 'Updated content');

      expect(result.success).toBe(true);
    });

    it('should fail for non-existent entry', async () => {
      const agentId = 'test-agent' as AgentId;
      const journal = {
        id: 'journal_123',
        name: 'My Journal',
        type: 'journal',
        journal_data: { title: 'My Journal', entries: [] },
        properties: {}
      };

      mockInventoryService.findJournal.mockResolvedValue(journal);

      const result = await service.editEntry(agentId, 'My Journal', 'nonexistent', 'Content');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('readJournal', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    it('should read journal content', async () => {
      const agentId = 'test-agent' as AgentId;
      const journal = {
        id: 'journal_123',
        name: 'My Journal',
        type: 'journal',
        description: 'Personal thoughts',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        journal_data: {
          title: 'My Journal',
          entries: [{
            id: 'entry_1',
            content: 'Today was a good day.',
            author_agent: agentId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]
        }
      };

      mockInventoryService.findJournal.mockResolvedValue(journal);

      const result = await service.readJournal(agentId, 'My Journal');

      expect(result.success).toBe(true);
      expect(result.content).toContain('My Journal');
      expect(result.content).toContain('Today was a good day.');
    });

    it('should fail for non-existent journal', async () => {
      const agentId = 'test-agent' as AgentId;

      mockInventoryService.findJournal.mockResolvedValue(null);

      const result = await service.readJournal(agentId, 'Nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('listJournals', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    it('should list all journals', async () => {
      const agentId = 'test-agent' as AgentId;

      mockInventoryService.getJournals.mockResolvedValue([
        {
          id: 'journal_1',
          name: 'Journal 1',
          description: 'First journal',
          journal_data: { title: 'Journal 1', entries: [] },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'journal_2',
          name: 'Journal 2',
          description: 'Second journal',
          journal_data: { title: 'Journal 2', entries: [{}, {}] },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);

      const result = await service.listJournals(agentId);

      expect(result).toHaveLength(2);
      expect(result[0].entry_count).toBe(0);
      expect(result[1].entry_count).toBe(2);
    });
  });

  describe('deleteEntry', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    it('should delete entry from journal', async () => {
      const agentId = 'test-agent' as AgentId;
      const journal = {
        id: 'journal_123',
        name: 'My Journal',
        type: 'journal',
        journal_data: {
          title: 'My Journal',
          entries: [{
            id: 'entry_1',
            content: 'Content to delete',
            author_agent: agentId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]
        },
        properties: {}
      };

      mockInventoryService.findJournal.mockResolvedValue(journal);

      const result = await service.deleteEntry(agentId, 'My Journal', 'entry_1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Deleted entry');
    });
  });

  describe('cleanupAgent', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should cleanup agent without errors', async () => {
      await service.initAgent('test-agent' as AgentId, testConfig);

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
