/**
 * Letta MCP Tools
 *
 * Tools for interacting with Letta agents through MCP
 */

import type { ToolDefinition, ToolResult } from '../../types/tool.js';
import type { LettaService } from './service.js';

/**
 * Send a message to the Letta agent
 */
const letta_chat: ToolDefinition = {
  name: 'letta_chat',
  description: 'Send a message to the Letta agent and get a response. The agent has persistent memory and will remember previous conversations.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The message to send to the agent'
      }
    },
    required: ['message']
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<LettaService>('letta');
      const message = params.message as string;

      const response = await service.chat(message);

      // Format response
      let responseText = '';
      if (response.messages && response.messages.length > 0) {
        for (const msg of response.messages) {
          if (msg.role === 'assistant') {
            responseText += msg.content + '\n';
          }
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: responseText.trim() || 'No response from agent'
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * Get agent memory blocks
 */
const letta_get_memory: ToolDefinition = {
  name: 'letta_get_memory',
  description: 'Retrieve the agent\'s core memory blocks (identity, relationship_context, persona, human, etc.)',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<LettaService>('letta');
      const memory = await service.getMemory();

      const formattedMemory = Object.entries(memory)
        .map(([name, value]) => `### ${name}\n\n${value}`)
        .join('\n\n---\n\n');

      return {
        content: [
          {
            type: 'text',
            text: formattedMemory || 'No memory blocks found'
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * Update a specific memory block
 */
const letta_update_memory: ToolDefinition = {
  name: 'letta_update_memory',
  description: 'Update a specific core memory block (e.g., identity, relationship_context, persona)',
  inputSchema: {
    type: 'object',
    properties: {
      block_name: {
        type: 'string',
        description: 'Name of the memory block to update (e.g., "identity", "relationship_context")'
      },
      content: {
        type: 'string',
        description: 'New content for the memory block'
      }
    },
    required: ['block_name', 'content']
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<LettaService>('letta');
      const blockName = params.block_name as string;
      const content = params.content as string;

      await service.updateMemory(blockName, content);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully updated memory block: ${blockName}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * Get conversation history
 *
 * Note: Agents can search their own conversation using the built-in
 * conversation_search tool. This tool is for external access to history.
 */
const letta_get_messages: ToolDefinition = {
  name: 'letta_get_messages',
  description: 'Retrieve recent conversation messages with the agent',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Number of messages to retrieve (default: 50)'
      }
    }
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<LettaService>('letta');
      const limit = (params.limit as number) || 50;

      const messages = await service.getMessages(limit);

      if (messages.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No messages found'
            }
          ]
        };
      }

      const formattedMessages = messages
        .map((msg) => `[${msg.role}] ${msg.content}`)
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: formattedMessages
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * Get agent info
 */
const letta_get_agent_info: ToolDefinition = {
  name: 'letta_get_agent_info',
  description: 'Get information about the Letta agent (ID, model, embedding, etc.)',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<LettaService>('letta');
      const info = service.getAgentInfo();

      if (!info) {
        return {
          content: [
            {
              type: 'text',
              text: 'Agent not initialized'
            }
          ]
        };
      }

      const formattedInfo = `
Agent ID: ${info.id}
Name: ${info.name}
Model: ${info.model}
Embedding: ${info.embedding}
Created: ${info.created_at}
`.trim();

      return {
        content: [
          {
            type: 'text',
            text: formattedInfo
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

// Export all tools
// Note: Letta agents have built-in memory tools (archival_memory_search/insert, conversation_search)
// These MCP tools are for external interaction with the agent
export const tools: ToolDefinition[] = [
  letta_chat,
  letta_get_memory,
  letta_update_memory,
  letta_get_messages,
  letta_get_agent_info
];
