/**
 * Journal MCP Tool
 *
 * Single tool with multiple actions for managing journals.
 * Journals are now inventory items - you must possess a journal to read/write it.
 * To delete a journal, use the inventory's remove_item action.
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../../types/tool.js';
import type JournalService from './service.js';

/**
 * Valid journal actions
 */
type JournalAction = 'create' | 'write' | 'edit' | 'read' | 'read_entry' | 'list' | 'delete_entry';

/**
 * Journal tool - manage journals and entries
 */
export const journal: ToolDefinition = {
  name: 'journal',
  description: 'Manage personal journals. Journals are inventory items - you must possess a journal to read or write in it. Use inventory\'s remove_item to delete a journal, or place_item to put it in the world for others to find.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'write', 'edit', 'read', 'read_entry', 'list', 'delete_entry'],
        description: 'Action to perform: create (new journal - appears in inventory), write (new entry), edit (existing entry), read (full journal), read_entry (single entry), list (journals in your inventory), delete_entry (single entry)'
      },
      journal: {
        type: 'string',
        description: 'Journal ID or title (for write, edit, read, read_entry, delete_entry actions). Must be in your inventory.'
      },
      title: {
        type: 'string',
        description: 'For create: title of the new journal'
      },
      description: {
        type: 'string',
        description: 'For create: optional description of the journal'
      },
      content: {
        type: 'string',
        description: 'For write/edit: the markdown content to write or the updated content'
      },
      entry: {
        type: 'string',
        description: 'For edit/read_entry/delete_entry: entry ID or number (1-based index)'
      }
    },
    required: ['action']
  },
  handler: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
    const service = context.getService('journal') as JournalService;
    const action = params.action as JournalAction;

    try {
      switch (action) {
        case 'create': {
          const title = params.title as string;
          const description = (params.description as string) || '';

          if (!title) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'title is required for create action' }]
            };
          }

          const result = await service.createJournal(context.agentId, title, description);
          if (!result.success) {
            return {
              isError: true,
              content: [{ type: 'text', text: result.message }]
            };
          }

          return {
            isError: false,
            content: [{
              type: 'text',
              text: `${result.message}\n\nJournal ID: ${result.journal!.id}\n\nThe journal has been added to your inventory.`
            }]
          };
        }

        case 'write': {
          const journalId = params.journal as string;
          const content = params.content as string;

          if (!journalId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'journal is required for write action' }]
            };
          }

          if (!content) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'content is required for write action' }]
            };
          }

          const result = await service.writeEntry(context.agentId, journalId, content);
          if (!result.success) {
            return {
              isError: true,
              content: [{ type: 'text', text: result.message }]
            };
          }

          return {
            isError: false,
            content: [{
              type: 'text',
              text: `${result.message}\n\nEntry ID: ${result.entry!.id}`
            }]
          };
        }

        case 'edit': {
          const journalId = params.journal as string;
          const entryId = params.entry as string;
          const content = params.content as string;

          if (!journalId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'journal is required for edit action' }]
            };
          }

          if (!entryId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'entry is required for edit action' }]
            };
          }

          if (!content) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'content is required for edit action' }]
            };
          }

          const result = await service.editEntry(context.agentId, journalId, entryId, content);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'read': {
          const journalId = params.journal as string;

          if (!journalId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'journal is required for read action' }]
            };
          }

          const result = await service.readJournal(context.agentId, journalId);
          if (!result.success) {
            return {
              isError: true,
              content: [{ type: 'text', text: result.message! }]
            };
          }

          return {
            isError: false,
            content: [{ type: 'text', text: result.content! }]
          };
        }

        case 'read_entry': {
          const journalId = params.journal as string;
          const entryId = params.entry as string;

          if (!journalId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'journal is required for read_entry action' }]
            };
          }

          if (!entryId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'entry is required for read_entry action' }]
            };
          }

          const result = await service.readEntry(context.agentId, journalId, entryId);
          if (!result.success) {
            return {
              isError: true,
              content: [{ type: 'text', text: result.message! }]
            };
          }

          const entry = result.entry!;
          const textParts = [
            `**Entry ID:** ${entry.id}`,
            `**Created:** ${entry.created_at}`,
            entry.updated_at !== entry.created_at ? `**Edited:** ${entry.updated_at}` : null,
            entry.author_agent ? `**Author:** ${entry.author_agent}` : null,
            '',
            entry.content
          ];

          return {
            isError: false,
            content: [{ type: 'text', text: textParts.filter(Boolean).join('\n') }]
          };
        }

        case 'list': {
          const journals = await service.listJournals(context.agentId);

          if (journals.length === 0) {
            return {
              isError: false,
              content: [{ type: 'text', text: 'No journals in your inventory. Use action "create" to create one, or pick one up from the world.' }]
            };
          }

          const lines: string[] = ['## Journals in Your Inventory', ''];
          for (const j of journals) {
            lines.push(`### ${j.title}`);
            lines.push(`- **ID:** ${j.id}`);
            if (j.description) {
              lines.push(`- **Description:** ${j.description}`);
            }
            lines.push(`- **Entries:** ${j.entry_count}`);
            lines.push(`- **Created:** ${j.created_at}`);
            lines.push(`- **Last updated:** ${j.updated_at}`);
            lines.push('');
          }

          return {
            isError: false,
            content: [{ type: 'text', text: lines.join('\n') }]
          };
        }

        case 'delete_entry': {
          const journalId = params.journal as string;
          const entryId = params.entry as string;

          if (!journalId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'journal is required for delete_entry action' }]
            };
          }

          if (!entryId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'entry is required for delete_entry action' }]
            };
          }

          const result = await service.deleteEntry(context.agentId, journalId, entryId);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown journal action: ${action}. To delete a journal entirely, use the inventory's remove_item action.` }]
          };
      }
    } catch (error: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${error.message}` }]
      };
    }
  }
};

// Export all tools
export const tools: ToolDefinition[] = [journal];
