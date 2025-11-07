/**
 * Calculator tool - standalone tool with no persistent state
 */

import type { ToolDefinition } from '../../../types/tool.js';

export const tools: ToolDefinition[] = [
  {
    name: 'calculator_add',
    description: 'Add two numbers together',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
    handler: async (params) => {
      const a = params.a as number;
      const b = params.b as number;
      const result = a + b;
      return {
        content: [
          {
            type: 'text',
            text: `${a} + ${b} = ${result}`,
          },
        ],
      };
    },
  },
  {
    name: 'calculator_subtract',
    description: 'Subtract second number from first number',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
    handler: async (params) => {
      const a = params.a as number;
      const b = params.b as number;
      const result = a - b;
      return {
        content: [
          {
            type: 'text',
            text: `${a} - ${b} = ${result}`,
          },
        ],
      };
    },
  },
  {
    name: 'calculator_multiply',
    description: 'Multiply two numbers',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
    handler: async (params) => {
      const a = params.a as number;
      const b = params.b as number;
      const result = a * b;
      return {
        content: [
          {
            type: 'text',
            text: `${a} × ${b} = ${result}`,
          },
        ],
      };
    },
  },
  {
    name: 'calculator_divide',
    description: 'Divide first number by second number',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number (dividend)' },
        b: { type: 'number', description: 'Second number (divisor)' },
      },
      required: ['a', 'b'],
    },
    handler: async (params) => {
      const a = params.a as number;
      const b = params.b as number;
      
      if (b === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Division by zero is not allowed',
            },
          ],
          isError: true,
        };
      }
      
      const result = a / b;
      return {
        content: [
          {
            type: 'text',
            text: `${a} ÷ ${b} = ${result}`,
          },
        ],
      };
    },
  },
];

