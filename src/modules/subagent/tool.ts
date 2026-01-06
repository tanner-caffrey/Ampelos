/**
 * Sub-Agent Tool
 *
 * MCP tool for spawning and managing sub-agents from Letta templates.
 * Uses action-based pattern for all operations.
 */

import type { ToolDefinition, ToolResult } from '../../types/tool.js';
import type SubagentService from './service.js';
import type { SubagentInfo, SubagentStatus } from './types.js';

/**
 * Format a sub-agent for display
 */
function formatSubagent(subagent: SubagentInfo): string {
  const statusEmoji = {
    active: '🟢',
    completed: '✅',
    failed: '❌',
    abandoned: '⚪',
  }[subagent.status];

  const age = formatRelativeTime(subagent.created_at);
  const lastActivity = formatRelativeTime(subagent.last_activity_at);

  let result = `${statusEmoji} **${subagent.id.substring(0, 8)}** (${subagent.lifecycle})
  - Template: ${subagent.template_version}
  - Status: ${subagent.status}
  - Task: "${subagent.task_description.substring(0, 80)}${subagent.task_description.length > 80 ? '...' : ''}"
  - Created: ${age} | Last active: ${lastActivity}`;

  if (subagent.result) {
    result += `\n  - Result: "${subagent.result.substring(0, 100)}${subagent.result.length > 100 ? '...' : ''}"`;
  }

  return result;
}

/**
 * Format relative time
 */
function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Subagent tool definition - manages sub-agents via actions
 */
export const subagentTool: ToolDefinition = {
  name: 'subagent',
  description: `Manage sub-agents that can work on delegated tasks autonomously.

**Actions:**
- **spawn**: Create a sub-agent from a Letta template
  - params: template_version (required), task (required), memory_variables?, wait_for_result?, shared_blocks?, lifecycle?
- **list**: View all sub-agents with status
  - params: status_filter? ('active', 'completed', 'failed', 'abandoned', 'all')
- **message**: Send a message to an existing sub-agent
  - params: subagent_id (required), message (required), wait_for_reply?
- **cleanup**: Delete a sub-agent and detach shared blocks
  - params: subagent_id (required)

**Sub-agent capabilities:**
- Work on delegated tasks autonomously
- Share memory blocks with parent (changes sync automatically)
- Message parent with updates via send_message_to_agent_async
- Be ephemeral (deleted after task) or persistent (reusable)

**Examples:**
- Spawn: \`{ "action": "spawn", "template_version": "researcher_v1", "task": "Find info about X" }\`
- Spawn (sync): \`{ "action": "spawn", "template_version": "summarizer_v1", "task": "Summarize this", "wait_for_result": true }\`
- List active: \`{ "action": "list", "status_filter": "active" }\`
- Message: \`{ "action": "message", "subagent_id": "abc123", "message": "What's your progress?" }\`
- Cleanup: \`{ "action": "cleanup", "subagent_id": "abc123" }\``,

  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['spawn', 'list', 'message', 'cleanup'],
        description: 'Action to perform',
      },
      // Spawn params
      template_version: {
        type: 'string',
        description: 'For spawn: Letta template version ID',
      },
      task: {
        type: 'string',
        description: 'For spawn: Task description for the sub-agent',
      },
      memory_variables: {
        type: 'object',
        description: 'For spawn: Additional memory variables for template',
        additionalProperties: { type: 'string' },
      },
      wait_for_result: {
        type: 'boolean',
        description: 'For spawn: Wait for result (sync) or return immediately (async). Default: false',
      },
      shared_blocks: {
        type: 'array',
        items: { type: 'string' },
        description: 'For spawn: Block labels to share (changes sync between parent and sub-agent)',
      },
      lifecycle: {
        type: 'string',
        enum: ['ephemeral', 'persistent'],
        description: 'For spawn: ephemeral = deleted after task, persistent = kept for reuse',
      },
      // List params
      status_filter: {
        type: 'string',
        enum: ['active', 'completed', 'failed', 'abandoned', 'all'],
        description: 'For list: Filter by status (default: all)',
      },
      // Message/cleanup params
      subagent_id: {
        type: 'string',
        description: 'For message/cleanup: Sub-agent ID',
      },
      message: {
        type: 'string',
        description: 'For message: Message to send',
      },
      wait_for_reply: {
        type: 'boolean',
        description: 'For message: Wait for reply. Default: true',
      },
    },
    required: ['action'],
  },

  handler: async (params, context): Promise<ToolResult> => {
    const action = params.action as string;

    console.log('[Subagent Tool] Handler called with action:', action);

    const service = context.getService('subagent') as SubagentService;

    if (!service) {
      console.error('[Subagent Tool] Service not found!');
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: Subagent service not initialized. The module may not be loaded.' }],
      };
    }

    console.log('[Subagent Tool] Service found, proceeding with action');

    try {
      switch (action) {
        case 'spawn': {
          const templateVersion = params.template_version as string | undefined;
          const task = params.task as string | undefined;

          if (!templateVersion) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: template_version is required for spawn action' }],
            };
          }

          if (!task) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: task is required for spawn action' }],
            };
          }

          const result = await service.spawnSubagent(context.agentId, {
            template_version: templateVersion,
            task,
            memory_variables: params.memory_variables as Record<string, string> | undefined,
            wait_for_result: params.wait_for_result as boolean | undefined,
            shared_blocks: params.shared_blocks as string[] | undefined,
            lifecycle: params.lifecycle as 'ephemeral' | 'persistent' | undefined,
          });

          if (result.result) {
            // Sync mode - got result
            return {
              content: [
                {
                  type: 'text',
                  text: `Sub-agent completed task:\n\nResult: ${result.result}\n\nSub-agent ID: ${result.subagent_id}`,
                },
              ],
            };
          } else {
            // Async mode
            return {
              content: [
                {
                  type: 'text',
                  text: `Sub-agent spawned and working on task.\n\nSub-agent ID: ${result.subagent_id}\nLetta Agent ID: ${result.letta_agent_id}\nStatus: ${result.status}\n\nThe sub-agent can message you using send_message_to_agent_async. Use \`{ "action": "list" }\` to check status.`,
                },
              ],
            };
          }
        }

        case 'list': {
          const statusFilter = (params.status_filter as SubagentStatus | 'all') || 'all';
          const subagents = service.listSubagents(context.agentId, statusFilter);

          if (subagents.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: statusFilter === 'all'
                    ? 'No sub-agents found.'
                    : `No sub-agents with status '${statusFilter}'.`,
                },
              ],
            };
          }

          const formatted = subagents.map(formatSubagent).join('\n\n');
          return {
            content: [
              {
                type: 'text',
                text: `**Sub-agents (${subagents.length}):**\n\n${formatted}`,
              },
            ],
          };
        }

        case 'message': {
          const subagentId = params.subagent_id as string | undefined;
          const message = params.message as string | undefined;

          if (!subagentId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: subagent_id is required for message action' }],
            };
          }

          if (!message) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: message is required for message action' }],
            };
          }

          const waitForReply = params.wait_for_reply !== false; // Default true
          const result = await service.messageSubagent(context.agentId, {
            subagent_id: subagentId,
            message,
            wait_for_reply: waitForReply,
          });

          if (!result.delivered) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Failed to deliver message to sub-agent' }],
            };
          }

          if (result.response) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Sub-agent response:\n\n${result.response}`,
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: 'Message delivered to sub-agent.' }],
            };
          }
        }

        case 'cleanup': {
          const subagentId = params.subagent_id as string | undefined;

          if (!subagentId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: subagent_id is required for cleanup action' }],
            };
          }

          await service.cleanupSubagent(context.agentId, subagentId);
          return {
            content: [
              {
                type: 'text',
                text: `Sub-agent ${subagentId} has been deleted.`,
              },
            ],
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown action: ${action}. Valid actions: spawn, list, message, cleanup` }],
          };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${message}` }],
      };
    }
  },
};

// Export tools array for module loader
export const tools: ToolDefinition[] = [subagentTool];
