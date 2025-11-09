/**
 * Body and Inventory MCP Tools
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../../types/tool.js';
import type { BodyAndInventoryService } from './service.js';
import { BodyAction, InventoryAction, BodyPart, InventoryItem } from './types.js';

// ===== manage_body Tool =====

export const manage_body: ToolDefinition = {
  name: 'manage_body',
  description: 'Manage body parts, descriptors, and states',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create_part', 'add_descriptor', 'remove_descriptor', 'add_state', 'remove_state', 'get_part', 'list_parts'],
        description: 'Action to perform'
      },
      part_name: {
        type: 'string',
        description: 'Name of the body part (required for all actions except list_parts)'
      },
      descriptor_key: {
        type: 'string',
        description: 'Descriptor key (required for add_descriptor and remove_descriptor)'
      },
      descriptor_value: {
        type: 'string',
        description: 'Descriptor value (required for add_descriptor)'
      },
      state: {
        type: 'string',
        description: 'State name (required for add_state and remove_state)'
      }
    },
    required: ['action']
  },
  handler: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
    const service = context.getService('body_and_inventory') as BodyAndInventoryService;
    const action = params.action as BodyAction;

    try {
      switch (action) {
        case 'create_part': {
          const partName = params.part_name as string;
          if (!partName) {
            return { isError: true, content: [{ type: 'text', text: 'part_name is required for create_part' }] };
          }
          const result = await service.createBodyPart(partName);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'add_descriptor': {
          const partName = params.part_name as string;
          const key = params.descriptor_key as string;
          const value = params.descriptor_value as string;

          if (!partName || !key || !value) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'part_name, descriptor_key, and descriptor_value are required for add_descriptor' }]
            };
          }

          const result = await service.addBodyDescriptor(partName, key, value);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'remove_descriptor': {
          const partName = params.part_name as string;
          const key = params.descriptor_key as string;

          if (!partName || !key) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'part_name and descriptor_key are required for remove_descriptor' }]
            };
          }

          const result = await service.removeBodyDescriptor(partName, key);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'add_state': {
          const partName = params.part_name as string;
          const state = params.state as string;

          if (!partName || !state) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'part_name and state are required for add_state' }]
            };
          }

          const result = await service.addBodyState(partName, state);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'remove_state': {
          const partName = params.part_name as string;
          const state = params.state as string;

          if (!partName || !state) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'part_name and state are required for remove_state' }]
            };
          }

          const result = await service.removeBodyState(partName, state);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'get_part': {
          const partName = params.part_name as string;
          if (!partName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'part_name is required for get_part' }]
            };
          }

          const part = await service.getBodyPart(partName);
          if (!part) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Body part '${partName}' not found` }]
            };
          }

          const descriptorStr = Object.entries(part.descriptors)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          const stateStr = part.states.length > 0 ? `States: ${part.states.join(', ')}` : 'No states';

          return {
            isError: false,
            content: [{
              type: 'text',
              text: `Body part: ${part.name}\nDescriptors: ${descriptorStr || 'None'}\n${stateStr}`
            }]
          };
        }

        case 'list_parts': {
          const parts = await service.listBodyParts();
          const lines = parts.map((part: BodyPart) => {
            const descriptorStr = Object.entries(part.descriptors)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ');
            const stateStr = part.states.length > 0 ? ` [${part.states.join(', ')}]` : '';
            return `- ${part.name}: ${descriptorStr || 'no descriptors'}${stateStr}`;
          });

          return {
            isError: false,
            content: [{
              type: 'text',
              text: parts.length > 0 ? `Body parts:\n${lines.join('\n')}` : 'No body parts'
            }]
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown action: ${action}` }]
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

// ===== manage_inventory Tool =====

export const manage_inventory: ToolDefinition = {
  name: 'manage_inventory',
  description: 'Manage inventory items, equipment, and properties',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add_item', 'remove_item', 'equip_item', 'unequip_item', 'modify_item', 'get_item', 'list_items', 'mark_for_memory', 'unmark_for_memory'],
        description: 'Action to perform'
      },
      item_id: {
        type: 'string',
        description: 'Item ID (required for remove_item, equip_item, unequip_item, modify_item, get_item, mark_for_memory, unmark_for_memory)'
      },
      name: {
        type: 'string',
        description: 'Item name (required for add_item, optional for modify_item)'
      },
      description: {
        type: 'string',
        description: 'Item description (optional for add_item and modify_item)'
      },
      descriptors: {
        type: 'object',
        description: 'Item descriptors as key-value pairs (optional for add_item and modify_item)',
        additionalProperties: {
          type: 'string'
        }
      },
      properties: {
        type: 'object',
        description: 'Item properties as key-value pairs (optional for add_item and modify_item)',
        additionalProperties: true
      },
      slot: {
        type: 'string',
        description: 'Equipment slot (required for equip_item)'
      }
    },
    required: ['action']
  },
  handler: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
    const service = context.getService('body_and_inventory') as BodyAndInventoryService;
    const action = params.action as InventoryAction;

    try {
      switch (action) {
        case 'add_item': {
          const name = params.name as string;
          if (!name) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'name is required for add_item' }]
            };
          }

          const description = params.description as string | undefined;
          const descriptors = params.descriptors as Record<string, string> | undefined;
          const properties = params.properties as Record<string, any> | undefined;

          const result = await service.addInventoryItem(name, description, descriptors, properties);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'remove_item': {
          const itemId = params.item_id as string;
          if (!itemId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'item_id is required for remove_item' }]
            };
          }

          const result = await service.removeInventoryItem(itemId);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'equip_item': {
          const itemId = params.item_id as string;
          const slot = params.slot as string;

          if (!itemId || !slot) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'item_id and slot are required for equip_item' }]
            };
          }

          const result = await service.equipInventoryItem(itemId, slot);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'unequip_item': {
          const itemId = params.item_id as string;
          if (!itemId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'item_id is required for unequip_item' }]
            };
          }

          const result = await service.unequipInventoryItem(itemId);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'modify_item': {
          const itemId = params.item_id as string;
          if (!itemId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'item_id is required for modify_item' }]
            };
          }

          const updates: any = {};
          if (params.name !== undefined) updates.name = params.name;
          if (params.description !== undefined) updates.description = params.description;
          if (params.descriptors !== undefined) updates.descriptors = params.descriptors;
          if (params.properties !== undefined) updates.properties = params.properties;

          const result = await service.modifyInventoryItem(itemId, updates);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'get_item': {
          const itemId = params.item_id as string;
          if (!itemId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'item_id is required for get_item' }]
            };
          }

          const item = await service.getInventoryItem(itemId);
          if (!item) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Item '${itemId}' not found` }]
            };
          }

          const lines: string[] = [
            `Item: ${item.name} (ID: ${item.id})`,
            item.description ? `Description: ${item.description}` : '',
            `Descriptors: ${JSON.stringify(item.descriptors)}`,
            `Properties: ${JSON.stringify(item.properties)}`,
            item.equipped_slot ? `Equipped to: ${item.equipped_slot}` : 'Not equipped',
            `Show in memory: ${item.show_in_memory ? 'Yes' : 'No'}`
          ].filter(line => line);

          return {
            isError: false,
            content: [{ type: 'text', text: lines.join('\n') }]
          };
        }

        case 'list_items': {
          const items = await service.listInventoryItems();
          if (items.length === 0) {
            return {
              isError: false,
              content: [{ type: 'text', text: 'No items in inventory' }]
            };
          }

          const lines = items.map((item: InventoryItem) => {
            const equipped = item.equipped_slot ? ` [equipped: ${item.equipped_slot}]` : '';
            const marked = item.show_in_memory ? ' [shown in memory]' : '';
            return `- ${item.name} (ID: ${item.id})${equipped}${marked}`;
          });

          return {
            isError: false,
            content: [{ type: 'text', text: `Inventory (${items.length} items):\n${lines.join('\n')}` }]
          };
        }

        case 'mark_for_memory': {
          const itemId = params.item_id as string;
          if (!itemId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'item_id is required for mark_for_memory' }]
            };
          }

          const result = await service.markItemForMemory(itemId, true);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'unmark_for_memory': {
          const itemId = params.item_id as string;
          if (!itemId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'item_id is required for unmark_for_memory' }]
            };
          }

          const result = await service.markItemForMemory(itemId, false);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown action: ${action}` }]
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
export const tools: ToolDefinition[] = [manage_body, manage_inventory];
