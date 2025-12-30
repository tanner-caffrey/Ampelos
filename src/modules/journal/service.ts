/**
 * Journal Service (Singleton)
 *
 * Manages journals as inventory items. Journals are InventoryItems with
 * type: "journal" and embedded journal_data.
 *
 * All operations require possession - the journal must be in the agent's inventory.
 *
 * This service depends on body_and_inventory and stores no state of its own.
 * It can always reconnect since its "state" is in the inventory service.
 */

import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import type BodyAndInventoryService from '../embodiment/service.js';
import { createComponentLogger } from '../../core/logger.js';
import type { InventoryItem, JournalPayload, JournalEntry } from '../embodiment/types.js';
import { generatePortableObjectId } from '../../types/portable-object.js';

export interface JournalConfig {
  max_journals?: number;
  max_entry_length?: number;
}

const log = createComponentLogger('Journal');

function now(): string {
  return new Date().toISOString();
}

function generateEntryId(): string {
  return `entry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

class JournalService implements BaseService {
  private context?: ServiceContext;
  private agentConfigs: Map<AgentId, JournalConfig> = new Map();

  /**
   * Initialize the service (global, once at startup)
   */
  async init(context: ServiceContext): Promise<void> {
    this.context = context;
    log.info('Service initialized (global singleton)');
  }

  /**
   * Initialize for a specific agent
   */
  async initAgent(agentId: AgentId, config: Record<string, unknown>): Promise<void> {
    // Store per-agent config
    this.agentConfigs.set(agentId, (config as JournalConfig) || {});

    // Verify body_and_inventory service is available
    if (!this.context) {
      throw new Error('Journal service not initialized');
    }

    try {
      this.context.getService('body_and_inventory');
    } catch {
      throw new Error('[Journal] body_and_inventory service is required but not available');
    }

    log.info(`Initialized for ${agentId} (delegating to inventory)`);
  }

  /**
   * Check if an agent can reconnect
   * Journal can always reconnect - state is in inventory
   */
  canReconnect(_agentId: AgentId, _state: Record<string, unknown>): boolean {
    return true;
  }

  /**
   * Clean up agent-specific resources
   */
  async cleanupAgent(agentId: AgentId): Promise<void> {
    this.agentConfigs.delete(agentId);
    log.info(`Cleanup complete for agent ${agentId}`);
  }

  async cleanup(): Promise<void> {
    this.agentConfigs.clear();
    log.info('Cleanup complete');
  }

  /**
   * Get config for an agent
   */
  private getConfig(agentId: AgentId): JournalConfig {
    return this.agentConfigs.get(agentId) || {};
  }

  /**
   * Get inventory service
   */
  private getInventoryService(): BodyAndInventoryService {
    if (!this.context) {
      throw new Error('Journal service not initialized');
    }
    return this.context.getService('body_and_inventory') as BodyAndInventoryService;
  }

  // ===== Public Methods =====

  async createJournal(
    agentId: AgentId,
    title: string,
    description: string = ''
  ): Promise<{ success: boolean; message: string; journal?: InventoryItem }> {
    const config = this.getConfig(agentId);
    const inventoryService = this.getInventoryService();

    if (config.max_journals && config.max_journals > 0) {
      const journals = await inventoryService.getJournals(agentId);
      if (journals.length >= config.max_journals) {
        return {
          success: false,
          message: `Maximum number of journals (${config.max_journals}) reached`
        };
      }
    }

    const existing = await inventoryService.findJournal(agentId, title);
    if (existing) {
      return {
        success: false,
        message: `A journal with the title "${title}" already exists in your inventory`
      };
    }

    const timestamp = now();
    const id = generatePortableObjectId('journal');

    const journalItem: InventoryItem = {
      id,
      name: title,
      description,
      type: 'journal',
      descriptors: { binding: 'leather' },
      properties: {},
      equipped_slot: undefined,
      show_in_memory: true,
      journal_data: {
        title,
        entries: []
      },
      created_at: timestamp,
      updated_at: timestamp,
      origin_agent: agentId
    };

    const result = await inventoryService.receiveItem(agentId, journalItem);
    if (!result.success) {
      return { success: false, message: result.message };
    }

    return {
      success: true,
      message: `Created journal "${title}"`,
      journal: result.item
    };
  }

  async writeEntry(
    agentId: AgentId,
    journalRef: string,
    content: string
  ): Promise<{ success: boolean; message: string; entry?: JournalEntry }> {
    const config = this.getConfig(agentId);
    const inventoryService = this.getInventoryService();

    const journal = await inventoryService.findJournal(agentId, journalRef);
    if (!journal) {
      return {
        success: false,
        message: `Journal "${journalRef}" not found in your inventory. You must possess a journal to write in it.`
      };
    }

    if (!journal.journal_data) {
      return {
        success: false,
        message: `Item "${journal.name}" is not a valid journal`
      };
    }

    if (config.max_entry_length && config.max_entry_length > 0) {
      if (content.length > config.max_entry_length) {
        return {
          success: false,
          message: `Entry exceeds maximum length of ${config.max_entry_length} characters`
        };
      }
    }

    const timestamp = now();
    const entry: JournalEntry = {
      id: generateEntryId(),
      content,
      author_agent: agentId,
      created_at: timestamp,
      updated_at: timestamp
    };

    journal.journal_data.entries.push(entry);

    await inventoryService.modifyInventoryItem(agentId, journal.id, {
      properties: { ...journal.properties, updated_at: timestamp }
    });

    return {
      success: true,
      message: `Added entry to "${journal.journal_data.title}"`,
      entry
    };
  }

  async editEntry(
    agentId: AgentId,
    journalRef: string,
    entryId: string,
    content: string
  ): Promise<{ success: boolean; message: string; entry?: JournalEntry }> {
    const config = this.getConfig(agentId);
    const inventoryService = this.getInventoryService();

    const journal = await inventoryService.findJournal(agentId, journalRef);
    if (!journal) {
      return {
        success: false,
        message: `Journal "${journalRef}" not found in your inventory. You must possess a journal to edit it.`
      };
    }

    if (!journal.journal_data) {
      return {
        success: false,
        message: `Item "${journal.name}" is not a valid journal`
      };
    }

    let entry = journal.journal_data.entries.find(e => e.id === entryId);
    if (!entry) {
      const index = parseInt(entryId, 10) - 1;
      if (index >= 0 && index < journal.journal_data.entries.length) {
        entry = journal.journal_data.entries[index];
      }
    }

    if (!entry) {
      return {
        success: false,
        message: `Entry "${entryId}" not found in journal "${journal.journal_data.title}"`
      };
    }

    if (config.max_entry_length && config.max_entry_length > 0) {
      if (content.length > config.max_entry_length) {
        return {
          success: false,
          message: `Entry exceeds maximum length of ${config.max_entry_length} characters`
        };
      }
    }

    const timestamp = now();
    entry.content = content;
    entry.updated_at = timestamp;

    await inventoryService.modifyInventoryItem(agentId, journal.id, {
      properties: { ...journal.properties, updated_at: timestamp }
    });

    return {
      success: true,
      message: `Updated entry in "${journal.journal_data.title}"`,
      entry
    };
  }

  async readJournal(
    agentId: AgentId,
    journalRef: string
  ): Promise<{ success: boolean; message?: string; content?: string; journal?: InventoryItem }> {
    const inventoryService = this.getInventoryService();

    const journal = await inventoryService.findJournal(agentId, journalRef);
    if (!journal) {
      return {
        success: false,
        message: `Journal "${journalRef}" not found in your inventory. You must possess a journal to read it.`
      };
    }

    if (!journal.journal_data) {
      return {
        success: false,
        message: `Item "${journal.name}" is not a valid journal`
      };
    }

    const content = this.formatJournalAsMarkdown(journal);

    return {
      success: true,
      content,
      journal
    };
  }

  async readEntry(
    agentId: AgentId,
    journalRef: string,
    entryId: string
  ): Promise<{ success: boolean; message?: string; entry?: JournalEntry }> {
    const inventoryService = this.getInventoryService();

    const journal = await inventoryService.findJournal(agentId, journalRef);
    if (!journal) {
      return {
        success: false,
        message: `Journal "${journalRef}" not found in your inventory`
      };
    }

    if (!journal.journal_data) {
      return {
        success: false,
        message: `Item "${journal.name}" is not a valid journal`
      };
    }

    let entry = journal.journal_data.entries.find(e => e.id === entryId);
    if (!entry) {
      const index = parseInt(entryId, 10) - 1;
      if (index >= 0 && index < journal.journal_data.entries.length) {
        entry = journal.journal_data.entries[index];
      }
    }

    if (!entry) {
      return {
        success: false,
        message: `Entry "${entryId}" not found in journal "${journal.journal_data.title}"`
      };
    }

    return {
      success: true,
      entry
    };
  }

  async listJournals(
    agentId: AgentId
  ): Promise<{ id: string; title: string; description: string; entry_count: number; created_at: string; updated_at: string }[]> {
    const inventoryService = this.getInventoryService();

    const journals = await inventoryService.getJournals(agentId);
    return journals.map(j => ({
      id: j.id,
      title: j.journal_data?.title || j.name,
      description: j.description || '',
      entry_count: j.journal_data?.entries.length || 0,
      created_at: j.created_at || '',
      updated_at: j.updated_at || ''
    }));
  }

  async deleteEntry(
    agentId: AgentId,
    journalRef: string,
    entryId: string
  ): Promise<{ success: boolean; message: string }> {
    const inventoryService = this.getInventoryService();

    const journal = await inventoryService.findJournal(agentId, journalRef);
    if (!journal) {
      return {
        success: false,
        message: `Journal "${journalRef}" not found in your inventory`
      };
    }

    if (!journal.journal_data) {
      return {
        success: false,
        message: `Item "${journal.name}" is not a valid journal`
      };
    }

    let entryIndex = journal.journal_data.entries.findIndex(e => e.id === entryId);
    if (entryIndex === -1) {
      const index = parseInt(entryId, 10) - 1;
      if (index >= 0 && index < journal.journal_data.entries.length) {
        entryIndex = index;
      }
    }

    if (entryIndex === -1) {
      return {
        success: false,
        message: `Entry "${entryId}" not found in journal "${journal.journal_data.title}"`
      };
    }

    journal.journal_data.entries.splice(entryIndex, 1);

    const timestamp = now();
    await inventoryService.modifyInventoryItem(agentId, journal.id, {
      properties: { ...journal.properties, updated_at: timestamp }
    });

    return {
      success: true,
      message: `Deleted entry from "${journal.journal_data.title}"`
    };
  }

  private formatJournalAsMarkdown(journal: InventoryItem): string {
    if (!journal.journal_data) {
      return `# ${journal.name}\n\n*Not a valid journal*`;
    }

    const journalData = journal.journal_data;
    const lines: string[] = [];

    lines.push(`# ${journalData.title}`);
    lines.push('');

    if (journal.description) {
      lines.push(`> ${journal.description}`);
      lines.push('');
    }

    lines.push(`*Created: ${journal.created_at}*`);
    lines.push(`*Last updated: ${journal.updated_at}*`);
    lines.push('');
    lines.push('---');
    lines.push('');

    if (journalData.entries.length === 0) {
      lines.push('*No entries yet.*');
    } else {
      for (let i = 0; i < journalData.entries.length; i++) {
        const entry = journalData.entries[i];
        const entryDate = new Date(entry.created_at).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        lines.push(`## Entry ${i + 1}`);
        lines.push(`*${entryDate}*`);
        if (entry.author_agent) {
          lines.push(`*Author: ${entry.author_agent}*`);
        }
        lines.push('');
        lines.push(entry.content);
        lines.push('');

        if (entry.updated_at !== entry.created_at) {
          lines.push(`*Edited: ${entry.updated_at}*`);
          lines.push('');
        }

        if (i < journalData.entries.length - 1) {
          lines.push('---');
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }
}

export default JournalService;

export type { JournalEntry, JournalPayload as Journal } from '../embodiment/types.js';
