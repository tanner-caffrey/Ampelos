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
 * Search archival memory
 */
const letta_search_archival: ToolDefinition = {
  name: 'letta_search_archival',
  description: 'Search the agent\'s long-term archival memory for relevant information',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for archival memory'
      },
      page: {
        type: 'number',
        description: 'Page number for paginated results (default: 0)'
      }
    },
    required: ['query']
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<LettaService>('letta');
      const query = params.query as string;
      const page = (params.page as number) || 0;

      const results = await service.searchArchival(query, page);

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No results found in archival memory'
            }
          ]
        };
      }

      const formattedResults = results
        .map((result, idx) => `[${idx + 1}] ${JSON.stringify(result, null, 2)}`)
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} results:\n\n${formattedResults}`
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
 * Insert into archival memory
 */
const letta_insert_archival: ToolDefinition = {
  name: 'letta_insert_archival',
  description: 'Insert new information into the agent\'s long-term archival memory',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Content to store in archival memory. Include relevant tags in the format: #tag1 #tag2'
      }
    },
    required: ['content']
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<LettaService>('letta');
      const content = params.content as string;

      await service.insertArchival(content);

      return {
        content: [
          {
            type: 'text',
            text: 'Successfully inserted content into archival memory'
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
Embedding: ${info.embedding_model}
Created: ${info.created_at}
Last Updated: ${info.last_updated}
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

// Import custom tools
import { customTools } from './custom-tools.js';

// Export all tools (standard + custom)
export const tools: ToolDefinition[] = [
  letta_chat,
  letta_get_memory,
  letta_update_memory,
  letta_search_archival,
  letta_insert_archival,
  letta_get_messages,
  letta_get_agent_info,
  ...customTools
];
