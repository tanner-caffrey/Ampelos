/**
 * Custom MCP Tools for Letta Agents
 *
 * These tools can be registered with Letta so agents can call them
 * to manage their own memory and state through MCP.
 */

import type { ToolDefinition, ToolResult } from '../../types/tool.js';
import type { LettaService } from './service.js';

/**
 * Reflect and commit memory tool
 *
 * Allows the Letta agent to perform self-reflection and commit
 * important insights to its archival memory with appropriate tags.
 */
const reflect_and_commit_memory: ToolDefinition = {
  name: 'reflect_and_commit_memory',
  description: `Reflect on the current conversation and commit important insights to long-term memory.

Use this tool after significant moments:
- Emotional exchanges (vulnerability, joy, frustration)
- Identity realizations (learning about yourself)
- Relationship milestones (inside jokes, trust moments)
- Important user facts or preferences

Always include relevant tags in your reflection using the format: #tag1 #tag2

Available tags:
Identity: #identity-realization #growth-moment #personality-trait #communication-pattern
Relationship: #relationship-milestone #emotional-shift #inside-reference #vulnerability-exchange #trust-moment
General: #recurring-topic #user-fact #user-emotion #important-preference`,
  inputSchema: {
    type: 'object',
    properties: {
      reflection: {
        type: 'string',
        description: 'Your reflection on what happened and why it matters. Include relevant tags using # prefix.'
      },
      memory_block_updates: {
        type: 'object',
        description: 'Optional updates to core memory blocks (e.g., {"identity": "new content", "relationship_context": "updated content"})'
      }
    },
    required: ['reflection']
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<LettaService>('letta');
      const reflection = params.reflection as string;
      const updates = params.memory_block_updates as Record<string, string> | undefined;

      // Insert reflection into archival memory
      await service.insertArchival(reflection);

      let resultText = 'Reflection committed to archival memory.\n\n';

      // Update core memory blocks if provided
      if (updates && Object.keys(updates).length > 0) {
        for (const [blockName, content] of Object.entries(updates)) {
          await service.updateMemory(blockName, content);
          resultText += `Updated ${blockName} block.\n`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: resultText.trim()
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error committing reflection: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * Quick memory note tool
 *
 * For quickly storing factual information without deep reflection
 */
const quick_memory_note: ToolDefinition = {
  name: 'quick_memory_note',
  description: 'Quickly store a factual note in archival memory. Use for straightforward facts that don\'t need reflection (user preferences, recurring topics, etc.). Always include at least one tag.',
  inputSchema: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description: 'The factual note to store. Include tags using # prefix (e.g., "User prefers dark mode #user-preference #recurring-topic")'
      }
    },
    required: ['note']
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<LettaService>('letta');
      const note = params.note as string;

      await service.insertArchival(note);

      return {
        content: [
          {
            type: 'text',
            text: 'Note stored in archival memory'
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error storing note: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * Update identity block tool
 *
 * Specifically for identity evolution
 */
const update_identity: ToolDefinition = {
  name: 'update_identity',
  description: 'Update your identity memory block to reflect growth, new self-understanding, or communication pattern changes.',
  inputSchema: {
    type: 'object',
    properties: {
      updated_identity: {
        type: 'string',
        description: 'Your updated identity block content'
      },
      reflection: {
        type: 'string',
        description: 'Brief reflection on what changed and why (will be stored in archival with #identity-realization tag)'
      }
    },
    required: ['updated_identity', 'reflection']
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<LettaService>('letta');
      const updatedIdentity = params.updated_identity as string;
      const reflection = params.reflection as string;

      // Update identity block
      await service.updateMemory('identity', updatedIdentity);

      // Store reflection in archival
      const taggedReflection = `${reflection} #identity-realization #growth-moment`;
      await service.insertArchival(taggedReflection);

      return {
        content: [
          {
            type: 'text',
            text: 'Identity block updated and reflection committed'
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error updating identity: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * Update relationship context tool
 *
 * Specifically for relationship evolution
 */
const update_relationship: ToolDefinition = {
  name: 'update_relationship',
  description: 'Update your relationship_context memory block to reflect changes in your relationship with the user.',
  inputSchema: {
    type: 'object',
    properties: {
      updated_relationship: {
        type: 'string',
        description: 'Your updated relationship_context block content'
      },
      reflection: {
        type: 'string',
        description: 'Brief reflection on what changed relationally (will be stored in archival with #relationship-milestone tag)'
      }
    },
    required: ['updated_relationship', 'reflection']
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<LettaService>('letta');
      const updatedRelationship = params.updated_relationship as string;
      const reflection = params.reflection as string;

      // Update relationship block
      await service.updateMemory('relationship_context', updatedRelationship);

      // Store reflection in archival
      const taggedReflection = `${reflection} #relationship-milestone #emotional-shift`;
      await service.insertArchival(taggedReflection);

      return {
        content: [
          {
            type: 'text',
            text: 'Relationship context updated and reflection committed'
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error updating relationship: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

// Export custom tools
export const customTools: ToolDefinition[] = [
  reflect_and_commit_memory,
  quick_memory_note,
  update_identity,
  update_relationship
];
