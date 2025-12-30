/**
 * Letta Core MCP Tools
 *
 * Built-in tools for interacting with Letta agents through MCP.
 * These are registered as core tools, always available.
 */

import type { ToolDefinition, ToolResult, GlobalToolContext, ToolContext } from '../../types/tool.js';
import type { LettaManager } from './letta-manager.js';
import type { LettaBackendType } from './types.js';
import { createAgentId } from '../../types/agent.js';
import { createComponentLogger } from '../logger.js';

const log = createComponentLogger('LettaTools');

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
      const lettaManager = (context as any).getLettaManager?.() as LettaManager;
      if (!lettaManager) {
        return {
          content: [{ type: 'text', text: 'Error: Letta manager not available' }],
          isError: true
        };
      }

      const message = params.message as string;
      const response = await lettaManager.chat(context.agentId, message);

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
      const lettaManager = (context as any).getLettaManager?.() as LettaManager;
      if (!lettaManager) {
        return {
          content: [{ type: 'text', text: 'Error: Letta manager not available' }],
          isError: true
        };
      }

      const memory = await lettaManager.getMemory(context.agentId);

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
      const lettaManager = (context as any).getLettaManager?.() as LettaManager;
      if (!lettaManager) {
        return {
          content: [{ type: 'text', text: 'Error: Letta manager not available' }],
          isError: true
        };
      }

      const blockName = params.block_name as string;
      const content = params.content as string;

      await lettaManager.updateMemory(context.agentId, blockName, content);

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
      const lettaManager = (context as any).getLettaManager?.() as LettaManager;
      if (!lettaManager) {
        return {
          content: [{ type: 'text', text: 'Error: Letta manager not available' }],
          isError: true
        };
      }

      const limit = (params.limit as number) || 50;
      const messages = await lettaManager.getMessages(context.agentId, limit);

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
        .map((msg: any) => `[${msg.role}] ${msg.content}`)
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
      const lettaManager = (context as any).getLettaManager?.() as LettaManager;
      if (!lettaManager) {
        return {
          content: [{ type: 'text', text: 'Error: Letta manager not available' }],
          isError: true
        };
      }

      const info = await lettaManager.getAgentInfo(context.agentId);

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

/**
 * Register a Letta agent with Ampelos
 *
 * This is a GLOBAL tool that can be called without an existing agent context.
 * It allows Letta agents (cloud or self-hosted) to self-register with Ampelos at runtime.
 */
const ampelos_register_agent: ToolDefinition = {
  name: 'ampelos_register_agent',
  description:
    'Register this Letta agent with Ampelos. Call this tool to enable Ampelos modules for this agent. ' +
    'No parameters required - the agent will be automatically registered with all available modules.',
  inputSchema: {
    type: 'object',
    properties: {
      letta_agent_id: {
        type: 'string',
        description:
          'The Letta agent ID to register (automatically provided by the Letta client). ' +
          'If not provided, the tool will attempt to extract it from the request context.',
      },
      ampelos_agent_id: {
        type: 'string',
        description:
          'Optional custom Ampelos agent ID. If not provided, uses the Letta agent ID.',
      },
      backend: {
        type: 'string',
        enum: ['cloud', 'self-hosted'],
        description:
          'Which Letta backend this agent is from. Defaults to "cloud" for agents calling this tool.',
      },
      modules: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of module names to enable. If not provided, all loaded modules will be enabled.',
      },
    },
  },
  global: true, // This tool operates without an existing agent context
  handler: async (params, context): Promise<ToolResult> => {
    // Cast context to GlobalToolContext since this is a global tool
    const globalContext = context as unknown as GlobalToolContext;

    try {
      // Get letta_agent_id from params
      const lettaAgentId = params.letta_agent_id as string | undefined;

      if (!lettaAgentId) {
        return {
          content: [
            {
              type: 'text',
              text:
                'Error: letta_agent_id is required. This tool should be called by a Letta agent ' +
                'which automatically provides the letta_agent_id parameter.',
            },
          ],
          isError: true,
        };
      }

      // Determine backend - defaults to 'cloud' for self-registering agents
      const backend = (params.backend as LettaBackendType) || 'cloud';

      // Get the Letta manager
      const lettaManager = globalContext.getLettaManager?.() as LettaManager;
      if (!lettaManager) {
        return {
          content: [{ type: 'text', text: 'Error: Letta manager not available' }],
          isError: true
        };
      }

      // Check if the backend is configured
      if (!lettaManager.hasBackend(backend)) {
        const configHint = backend === 'cloud'
          ? 'LETTA_CLOUD_API_KEY and LETTA_CLOUD_PROJECT_ID'
          : 'LETTA_SERVER_URL';
        return {
          content: [
            {
              type: 'text',
              text: `Error: Backend '${backend}' is not configured. ` +
                `Please configure ${configHint} in your environment.`,
            },
          ],
          isError: true,
        };
      }

      const client = lettaManager.getClientForBackend(backend)!;

      // Query Letta API to verify agent exists and get its details
      let agentInfo;
      try {
        agentInfo = await client.getAgent(lettaAgentId);
      } catch (error) {
        const configHint = backend === 'cloud'
          ? 'LETTA_CLOUD_API_KEY'
          : 'LETTA_SERVER_URL and LETTA_TOKEN';
        return {
          content: [
            {
              type: 'text',
              text: `Error: Could not verify Letta agent ${lettaAgentId} on ${backend} backend. ` +
                `Make sure ${configHint} is configured correctly. ` +
                `Details: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }

      // Determine the Ampelos agent ID
      const ampelosAgentIdStr = (params.ampelos_agent_id as string) || lettaAgentId;
      const ampelosAgentId = createAgentId(ampelosAgentIdStr);

      // Check if agent is already registered
      const agentRegistry = globalContext.getAgentRegistry();
      const existingAgent = agentRegistry.getAgent(ampelosAgentId);

      if (existingAgent) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'already_registered',
                  agent_id: existingAgent.agent_id,
                  name: existingAgent.agent_name,
                  message: 'This agent is already registered with Ampelos.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Create the agent in the database (all modules are available)
      const agentStore = globalContext.getAgentStore();
      const agentDefinition = await agentStore.createAgent({
        id: ampelosAgentIdStr,
        name: agentInfo.name,
        enabled: true,
      });

      // Add to the registry cache
      agentRegistry.addToCache(agentDefinition);

      // Store the letta_agent_id and backend in the agent's state so LettaManager can reconnect
      const serviceManager = globalContext.getServiceManager();

      try {
        // Get the state manager and set the initial letta state
        // Use getLettaState() to write to the dedicated letta_state table (not agent_service_state)
        const stateManager = (serviceManager as any).stateManager;
        if (stateManager) {
          const lettaState = stateManager.getLettaState(ampelosAgentId);
          lettaState.set({
            letta_agent_id: lettaAgentId,
            backend,
            initialized: true,
            created_at: new Date().toISOString(),
          });
          await lettaState.flush();
        }

        // Call LettaManager.initAgent() to register the Letta-to-Ampelos mapping
        // This is crucial for tools to resolve the agent ID from incoming requests
        await lettaManager.initAgent(ampelosAgentId, undefined, backend);

        // Now initialize the agent's module services
        await serviceManager.initializeAgentServices(ampelosAgentId);
      } catch (error) {
        // If service initialization fails, try to clean up
        log.error('Service initialization failed', { error: error instanceof Error ? error.message : String(error) });
        try {
          await agentStore.deleteAgent(ampelosAgentIdStr);
          agentRegistry.removeFromCache(ampelosAgentId);
        } catch (cleanupError) {
          log.error('Cleanup failed', { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error: Failed to initialize services for agent. ` +
                `The agent was not registered. Details: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'registered',
                agent_id: ampelosAgentId,
                letta_agent_id: lettaAgentId,
                backend,
                name: agentInfo.name,
                message: `Successfully registered Letta agent "${agentInfo.name}" with Ampelos (backend: ${backend}). All modules are available.`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Get all Letta core tools
 */
export function getLettaCoreTools(): ToolDefinition[] {
  return [
    letta_chat,
    letta_get_memory,
    letta_update_memory,
    letta_get_messages,
    letta_get_agent_info,
    ampelos_register_agent,
  ];
}

// Export individual tools for reference
export const tools = {
  letta_chat,
  letta_get_memory,
  letta_update_memory,
  letta_get_messages,
  letta_get_agent_info,
  ampelos_register_agent,
};
