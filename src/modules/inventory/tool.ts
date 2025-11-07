/**
 * Inventory tool handlers
 */

import type { ToolDefinition } from '../../types/tool.js';
import type { InventoryService } from './service.js';

export const tools: ToolDefinition[] = [
  {
    name: 'inventory_add',
    description: 'Add an item to the inventory',
    inputSchema: {
      type: 'object',
      properties: {
        item: {
          type: 'string',
          description: 'Name of the item to add',
        },
      },
      required: ['item'],
    },
    handler: async (params, context) => {
      const service = context.getService<InventoryService>('inventory');
      const item = params.item as string;
      const result = await service.addItem(item);
      
      return {
        content: [
          {
            type: 'text',
            text: result.message,
          },
        ],
        isError: !result.success,
      };
    },
  },
  {
    name: 'inventory_remove',
    description: 'Remove an item from the inventory',
    inputSchema: {
      type: 'object',
      properties: {
        item: {
          type: 'string',
          description: 'Name of the item to remove',
        },
      },
      required: ['item'],
    },
    handler: async (params, context) => {
      const service = context.getService<InventoryService>('inventory');
      const item = params.item as string;
      const result = await service.removeItem(item);
      
      return {
        content: [
          {
            type: 'text',
            text: result.message,
          },
        ],
        isError: !result.success,
      };
    },
  },
  {
    name: 'inventory_list',
    description: 'List all items in the inventory',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async (params, context) => {
      const service = context.getService<InventoryService>('inventory');
      const items = await service.listItems();
      const count = service.getCount();
      
      if (items.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Inventory is empty',
            },
          ],
        };
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Inventory (${count} items):\n${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}`,
          },
        ],
      };
    },
  },
  {
    name: 'inventory_count',
    description: 'Get the number of items in the inventory',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async (params, context) => {
      const service = context.getService<InventoryService>('inventory');
      const count = service.getCount();
      const maxItems = (await service.getState()).max_items as number;
      
      return {
        content: [
          {
            type: 'text',
            text: `Inventory contains ${count} of ${maxItems} items`,
          },
        ],
      };
    },
  },
];

