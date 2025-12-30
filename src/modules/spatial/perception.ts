/**
 * Perception Generation
 *
 * Functions for generating location perception data and memory blocks.
 */

import type { World, LocationPerception } from './types.js';
import { getVisibleObjectsInLocation, getAgentsInLocation } from './world-state.js';

/**
 * Generate perception data for an agent at their current location
 */
export function generateLocationPerception(
  world: World,
  agentId: string,
  locationName: string,
  position: string
): LocationPerception | null {
  const location = world.locations[locationName];
  if (!location) {
    return null;
  }

  const visibleObjects = getVisibleObjectsInLocation(world, locationName);
  const agentsPresent = getAgentsInLocation(world, locationName);

  // Format present entities (agents)
  const present: string[] = [];
  for (const id of agentsPresent) {
    if (id === agentId) {
      present.push('you');
    } else if (id === 'user') {
      present.push('user');
    } else {
      present.push(id);
    }
  }

  return {
    location: locationName,
    position,
    description: location.description,
    visible_objects: visibleObjects,
    present,
    adjacent: location.connections
  };
}

/**
 * Format location perception as memory block text
 */
export function formatLocationMemoryBlock(perception: LocationPerception): string {
  const lines: string[] = [];

  lines.push(`Location: ${perception.location}`);
  lines.push(`Position: ${perception.position}`);
  lines.push(`Description: ${perception.description}`);

  if (perception.visible_objects.length > 0) {
    lines.push(`Visible objects: ${perception.visible_objects.join(', ')}`);
  } else {
    lines.push('Visible objects: none');
  }

  if (perception.present.length > 0) {
    lines.push(`Present: ${perception.present.join(', ')}`);
  } else {
    lines.push('Present: you');
  }

  if (perception.adjacent.length > 0) {
    lines.push(`Adjacent: ${perception.adjacent.join(', ')}`);
  } else {
    lines.push('Adjacent: none');
  }

  return lines.join('\n');
}

/**
 * Generate detailed look description (for spatial look action)
 */
export function generateDetailedLook(
  world: World,
  agentId: string,
  locationName: string
): string {
  const location = world.locations[locationName];
  if (!location) {
    return 'You are nowhere.';
  }

  const perception = generateLocationPerception(
    world,
    agentId,
    locationName,
    world.agents[agentId]?.position || 'here'
  );

  if (!perception) {
    return 'You are nowhere.';
  }

  const lines: string[] = [];

  lines.push(`# ${perception.location}`);
  lines.push('');
  lines.push(perception.description);
  lines.push('');

  if (perception.visible_objects.length > 0) {
    lines.push('**Objects here:**');
    for (const objName of perception.visible_objects) {
      lines.push(`- ${objName}`);
    }
    lines.push('');
  }

  if (perception.present.length > 1 || (perception.present.length === 1 && perception.present[0] !== 'you')) {
    const others = perception.present.filter(p => p !== 'you');
    if (others.length > 0) {
      lines.push('**Also present:**');
      for (const entity of others) {
        lines.push(`- ${entity}`);
      }
      lines.push('');
    }
  }

  if (perception.adjacent.length > 0) {
    lines.push('**Connections:**');
    for (const adj of perception.adjacent) {
      lines.push(`- ${adj}`);
    }
  }

  return lines.join('\n');
}
