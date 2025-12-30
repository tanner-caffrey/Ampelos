/**
 * Spatial MCP Tools
 *
 * Tools for spatial awareness and object interaction.
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../../types/tool.js';
import type SpatialService from './service.js';
import {
  SpatialAction,
  InteractAction,
  LocationCreate,
  LocationModify,
  ObjectCreate,
  ObjectModify,
  ObjectMove
} from './types.js';

/**
 * Spatial tool - manage locations and agent position
 */
export const spatial: ToolDefinition = {
  name: 'spatial',
  description: 'Navigate and manage spatial locations. Look around, move between locations, create/modify/remove locations, locate entities, switch worlds.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['look', 'move', 'locate', 'create_location', 'modify_location', 'remove_location', 'switch_world', 'list_locations'],
        description: 'Action to perform'
      },
      detailed: {
        type: 'boolean',
        description: 'For look: show detailed view with formatting (default: false)'
      },
      location: {
        type: 'string',
        description: 'For move: location name to move to'
      },
      position: {
        type: 'string',
        description: 'For move: position in location (e.g., "on the bed", "at the desk")'
      },
      target: {
        type: 'string',
        description: 'For locate: entity to find (agent ID or "user")'
      },
      locations: {
        type: 'array',
        description: 'For create_location: array of location definitions to create',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Location name' },
            description: { type: 'string', description: '1-3 sentence description' },
            parent: { type: 'string', description: 'Parent container (optional)' },
            connections: { type: 'array', items: { type: 'string' }, description: 'Adjacent locations' }
          },
          required: ['name', 'description']
        }
      },
      modifications: {
        type: 'array',
        description: 'For modify_location: array of location modifications',
        items: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'Location name to modify' },
            description: { type: 'string', description: 'New description' },
            add_connections: { type: 'array', items: { type: 'string' }, description: 'Connections to add' },
            remove_connections: { type: 'array', items: { type: 'string' }, description: 'Connections to remove' }
          },
          required: ['location']
        }
      },
      location_names: {
        type: 'array',
        items: { type: 'string' },
        description: 'For remove_location: array of location names to remove'
      },
      world_id: {
        type: 'string',
        description: 'For switch_world: ID of world to switch to'
      }
    },
    required: ['action']
  },
  handler: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
    const service = context.getService('spatial') as SpatialService;
    const action = params.action as SpatialAction;

    try {
      switch (action) {
        case 'look': {
          const detailed = params.detailed as boolean | undefined;
          const result = await service.look(context.agentId, detailed || false);
          return {
            isError: false,
            content: [{ type: 'text', text: result }]
          };
        }

        case 'move': {
          const location = params.location as string;
          const position = params.position as string | undefined;

          if (!location) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'location is required for move action' }]
            };
          }

          const result = await service.moveTo(context.agentId, location, position || 'here');
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'locate': {
          const target = params.target as string;

          if (!target) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'target is required for locate action' }]
            };
          }

          const result = await service.locate(context.agentId, target);

          if (!result.found) {
            return {
              isError: false,
              content: [{ type: 'text', text: `${target} not found` }]
            };
          }

          return {
            isError: false,
            content: [{
              type: 'text',
              text: `${target} is in ${result.location} (${result.distance})`
            }]
          };
        }

        case 'create_location': {
          const locations = params.locations as LocationCreate[] | undefined;

          if (!locations || !Array.isArray(locations) || locations.length === 0) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'locations array is required for create_location action' }]
            };
          }

          const result = await service.createLocations(context.agentId, locations);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'modify_location': {
          const modifications = params.modifications as LocationModify[] | undefined;

          if (!modifications || !Array.isArray(modifications) || modifications.length === 0) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'modifications array is required for modify_location action' }]
            };
          }

          const result = await service.modifyLocations(context.agentId, modifications);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'remove_location': {
          const locationNames = params.location_names as string[] | undefined;

          if (!locationNames || !Array.isArray(locationNames) || locationNames.length === 0) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'location_names array is required for remove_location action' }]
            };
          }

          const result = await service.removeLocations(context.agentId, locationNames);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'switch_world': {
          const worldId = params.world_id as string;

          if (!worldId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'world_id is required for switch_world action' }]
            };
          }

          const result = await service.switchWorld(context.agentId, worldId);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'list_locations': {
          const locations = await service.listLocations(context.agentId);
          return {
            isError: false,
            content: [{
              type: 'text',
              text: locations.length > 0
                ? `Locations:\n${locations.map(l => `- ${l}`).join('\n')}`
                : 'No locations in this world'
            }]
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown spatial action: ${action}` }]
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

/**
 * Interact tool - manage objects in the world
 */
export const interact: ToolDefinition = {
  name: 'interact',
  description: `Interact with objects in the world. Actions:
- examine: Inspect an object's details and state
- create: Create new objects in the world
- modify: Update an object's state, visibility, container, or position (use object NAME, not ID)
- move: Move objects to different locations or containers (use object NAME, not ID)
- remove: Delete objects from the world
- pickup: Pick up an object from your current location into your inventory
- drop: Drop an inventory item into the world at your current location`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['examine', 'modify', 'move', 'create', 'remove', 'pickup', 'drop'],
        description: 'Action to perform'
      },
      object: {
        type: 'string',
        description: 'For examine/pickup: object name to examine or pick up'
      },
      item: {
        type: 'string',
        description: 'For drop: inventory item name (or ID) to drop into the world'
      },
      position: {
        type: 'string',
        description: 'For drop: descriptive position where to place the dropped item (e.g., "on the table", "by the door")'
      },
      modifications: {
        type: 'array',
        description: 'For modify: array of object modifications. Use object NAME (e.g., "small campfire"), not internal ID.',
        items: {
          type: 'object',
          properties: {
            object: { type: 'string', description: 'Object NAME to modify (e.g., "wooden chair", not the internal ID)' },
            state: { type: 'object', description: 'State properties to update (merged with existing state)' },
            visible: { type: 'boolean', description: 'Set visibility (true = visible when looking around)' },
            container: { type: 'string', description: 'Move into container by ID, or omit/null to remove from container' },
            position: { type: 'string', description: 'Update descriptive position (e.g., "against the wall")' }
          },
          required: ['object']
        }
      },
      movements: {
        type: 'array',
        description: 'For move: array of object movements. Use object NAME, not internal ID.',
        items: {
          type: 'object',
          properties: {
            object: { type: 'string', description: 'Object NAME to move (e.g., "wooden chair")' },
            to_location: { type: 'string', description: 'Destination location name' },
            to_container: { type: 'string', description: 'Destination container ID, or omit/null to place in room' },
            position: { type: 'string', description: 'Position in new location/container' }
          },
          required: ['object']
        }
      },
      objects: {
        type: 'array',
        description: 'For create: array of objects to create',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Object type (e.g., "furniture", "item", "container")' },
            name: { type: 'string', description: 'Object name (used to reference it later)' },
            location: { type: 'string', description: 'Location name where object exists' },
            container: { type: 'string', description: 'Container object ID if inside another object, omit if in room' },
            position: { type: 'string', description: 'Descriptive position (e.g., "in the corner", "on the shelf")' },
            visible: { type: 'boolean', description: 'Is object visible? Default: true if not in container' },
            state: { type: 'object', description: 'Initial state properties (freeform key-value pairs)' }
          },
          required: ['type', 'name', 'location']
        }
      },
      object_names: {
        type: 'array',
        items: { type: 'string' },
        description: 'For remove: array of object names to remove'
      }
    },
    required: ['action']
  },
  handler: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
    const service = context.getService('spatial') as SpatialService;
    const action = params.action as InteractAction;

    try {
      switch (action) {
        case 'examine': {
          const objectName = params.object as string;

          if (!objectName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'object is required for examine action' }]
            };
          }

          const result = await service.examineObject(context.agentId, objectName);

          if (!result.success) {
            return {
              isError: true,
              content: [{ type: 'text', text: result.message || 'Object not found' }]
            };
          }

          const obj = result.object!;
          const lines: string[] = [];
          lines.push(`**${obj.name}** (${obj.type})`);
          lines.push(`Location: ${obj.location}`);
          lines.push(`Position: ${obj.position}`);

          if (Object.keys(obj.state).length > 0) {
            lines.push(`State: ${JSON.stringify(obj.state, null, 2)}`);
          }

          if (obj.contains && obj.contains.length > 0) {
            lines.push(`Contains: ${obj.contains.join(', ')}`);
          }

          return {
            isError: false,
            content: [{ type: 'text', text: lines.join('\n') }]
          };
        }

        case 'modify': {
          const modifications = params.modifications as ObjectModify[] | undefined;

          if (!modifications || !Array.isArray(modifications) || modifications.length === 0) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'modifications array is required for modify action' }]
            };
          }

          const result = await service.modifyObjects(context.agentId, modifications);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'move': {
          const movements = params.movements as ObjectMove[] | undefined;

          if (!movements || !Array.isArray(movements) || movements.length === 0) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'movements array is required for move action' }]
            };
          }

          const result = await service.moveObjects(context.agentId, movements);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'create': {
          const objects = params.objects as ObjectCreate[] | undefined;

          if (!objects || !Array.isArray(objects) || objects.length === 0) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'objects array is required for create action' }]
            };
          }

          const result = await service.createObjects(context.agentId, objects);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'remove': {
          const objectNames = params.object_names as string[] | undefined;

          if (!objectNames || !Array.isArray(objectNames) || objectNames.length === 0) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'object_names array is required for remove action' }]
            };
          }

          const result = await service.removeObjects(context.agentId, objectNames);
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'pickup': {
          const objectName = params.object as string;

          if (!objectName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'object (name) is required for pickup action' }]
            };
          }

          const result = await service.pickupObject(context.agentId, objectName);
          if (result.success && result.item) {
            return {
              isError: false,
              content: [{
                type: 'text',
                text: `${result.message}\n\nThe item is now in your inventory. Use manage_inventory to view, equip, or modify it.`
              }]
            };
          }
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        case 'drop': {
          const itemNameOrId = params.item as string;
          const position = params.position as string | undefined;

          if (!itemNameOrId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'item (name or ID) is required for drop action. Use manage_inventory with action "list_items" to see your inventory.' }]
            };
          }

          const result = await service.dropItem(context.agentId, itemNameOrId, position);
          if (result.success) {
            return {
              isError: false,
              content: [{
                type: 'text',
                text: `${result.message}\n\nThe object is now in the world. Use spatial "look" to see it, or interact with it using this tool.`
              }]
            };
          }
          return {
            isError: !result.success,
            content: [{ type: 'text', text: result.message }]
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown interact action: ${action}` }]
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
export const tools: ToolDefinition[] = [spatial, interact];
