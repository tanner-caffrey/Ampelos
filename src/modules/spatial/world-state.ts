/**
 * World State Management
 *
 * Functions for managing world graph structure, locations, objects, and agents.
 */

import type {
  World,
  Location,
  SpatialObject,
  AgentPosition,
  LocationCreate,
  LocationModify,
  ObjectCreate,
  ObjectModify,
  ObjectMove
} from './types.js';

/**
 * Normalize "null" string to actual null
 * Agents sometimes send the literal string "null" instead of null/undefined
 */
function normalizeNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "null") {
    return null;
  }
  return value;
}

// ===== Location Management =====

/**
 * Create new location(s) in a world
 */
export function createLocations(
  world: World,
  locations: LocationCreate[]
): { success: boolean; message: string; created?: string[] } {
  const created: string[] = [];

  for (const loc of locations) {
    if (world.locations[loc.name]) {
      return { success: false, message: `Location '${loc.name}' already exists` };
    }

    world.locations[loc.name] = {
      description: loc.description,
      connections: loc.connections || [],
      part_of: loc.parent
    };

    created.push(loc.name);
  }

  return {
    success: true,
    message: `Created ${created.length} location${created.length === 1 ? '' : 's'}: ${created.join(', ')}`,
    created
  };
}

/**
 * Modify existing location(s)
 */
export function modifyLocations(
  world: World,
  modifications: LocationModify[]
): { success: boolean; message: string } {
  for (const mod of modifications) {
    const location = world.locations[mod.location];
    if (!location) {
      return { success: false, message: `Location '${mod.location}' not found` };
    }

    if (mod.description) {
      location.description = mod.description;
    }

    if (mod.add_connections) {
      for (const conn of mod.add_connections) {
        if (!location.connections.includes(conn)) {
          location.connections.push(conn);
        }
      }
    }

    if (mod.remove_connections) {
      for (const conn of mod.remove_connections) {
        location.connections = location.connections.filter(c => c !== conn);
      }
    }
  }

  return { success: true, message: `Modified ${modifications.length} location${modifications.length === 1 ? '' : 's'}` };
}

/**
 * Remove location(s) from world
 */
export function removeLocations(
  world: World,
  locationNames: string[]
): { success: boolean; message: string } {
  for (const name of locationNames) {
    if (!world.locations[name]) {
      return { success: false, message: `Location '${name}' not found` };
    }

    // Remove connections to this location from other locations
    for (const loc of Object.values(world.locations)) {
      loc.connections = loc.connections.filter(c => c !== name);
    }

    // Remove objects in this location
    for (const [objId, obj] of Object.entries(world.objects)) {
      if (obj.location === name) {
        delete world.objects[objId];
      }
    }

    // Check if any agents are in this location
    for (const [agentId, agentPos] of Object.entries(world.agents)) {
      if (agentPos.location === name) {
        return {
          success: false,
          message: `Cannot remove location '${name}': agent ${agentId} is currently there`
        };
      }
    }

    delete world.locations[name];
  }

  return { success: true, message: `Removed ${locationNames.length} location${locationNames.length === 1 ? '' : 's'}` };
}

// ===== Object Management =====

/**
 * Generate unique object ID
 */
function generateObjectId(type: string): string {
  return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create new object(s) in world
 */
export function createObjects(
  world: World,
  objects: ObjectCreate[]
): { success: boolean; message: string; created?: SpatialObject[] } {
  const created: SpatialObject[] = [];

  for (const objData of objects) {
    // Validate location exists
    if (!world.locations[objData.location]) {
      return { success: false, message: `Location '${objData.location}' not found` };
    }

    // Normalize container (treat "null" string as null)
    const container = normalizeNull(objData.container);

    // Validate container exists if specified
    if (container && !world.objects[container]) {
      return { success: false, message: `Container object '${container}' not found` };
    }

    const id = generateObjectId(objData.type);
    const obj: SpatialObject = {
      type: objData.type,
      name: objData.name,
      location: objData.location,
      container: container,
      position: objData.position || 'here',
      visible: objData.visible !== undefined ? objData.visible : (container ? false : true),
      state: objData.state || {}
    };

    world.objects[id] = obj;
    created.push(obj);
  }

  return {
    success: true,
    message: `Created ${created.length} object${created.length === 1 ? '' : 's'}`,
    created
  };
}

/**
 * Modify existing object(s)
 */
export function modifyObjects(
  world: World,
  modifications: ObjectModify[]
): { success: boolean; message: string } {
  for (const mod of modifications) {
    // Try lookup by ID first, then by name
    let obj = world.objects[mod.object];
    if (!obj) {
      const found = getObjectByName(world, mod.object);
      if (found) {
        obj = found.obj;
      }
    }
    if (!obj) {
      return { success: false, message: `Object '${mod.object}' not found` };
    }

    if (mod.state) {
      obj.state = { ...obj.state, ...mod.state };
    }

    if (mod.visible !== undefined) {
      obj.visible = mod.visible;
    }

    if (mod.container !== undefined) {
      // Normalize container (treat "null" string as null)
      const container = normalizeNull(mod.container);
      // Validate container exists if specified
      if (container && !world.objects[container]) {
        return { success: false, message: `Container object '${container}' not found` };
      }
      obj.container = container;
    }

    if (mod.position !== undefined) {
      obj.position = mod.position;
    }
  }

  return { success: true, message: `Modified ${modifications.length} object${modifications.length === 1 ? '' : 's'}` };
}

/**
 * Move object(s) in world
 */
export function moveObjects(
  world: World,
  movements: ObjectMove[]
): { success: boolean; message: string } {
  for (const move of movements) {
    // Try lookup by ID first, then by name
    let obj = world.objects[move.object];
    if (!obj) {
      const found = getObjectByName(world, move.object);
      if (found) {
        obj = found.obj;
      }
    }
    if (!obj) {
      return { success: false, message: `Object '${move.object}' not found` };
    }

    if (move.to_location) {
      if (!world.locations[move.to_location]) {
        return { success: false, message: `Location '${move.to_location}' not found` };
      }
      obj.location = move.to_location;
    }

    if (move.to_container !== undefined) {
      // Normalize container (treat "null" string as null)
      const toContainer = normalizeNull(move.to_container);
      // Validate container exists if specified
      if (toContainer && !world.objects[toContainer]) {
        return { success: false, message: `Container object '${toContainer}' not found` };
      }
      obj.container = toContainer;
    }

    if (move.position !== undefined) {
      obj.position = move.position;
    }
  }

  return { success: true, message: `Moved ${movements.length} object${movements.length === 1 ? '' : 's'}` };
}

/**
 * Remove object(s) from world
 */
export function removeObjects(
  world: World,
  objectNames: string[]
): { success: boolean; message: string } {
  for (const name of objectNames) {
    // Find object by name (not ID)
    const objId = Object.keys(world.objects).find(id => world.objects[id].name === name);
    if (!objId) {
      return { success: false, message: `Object '${name}' not found` };
    }

    // Remove objects that are contained in this object
    for (const [id, obj] of Object.entries(world.objects)) {
      if (obj.container === objId) {
        delete world.objects[id];
      }
    }

    delete world.objects[objId];
  }

  return { success: true, message: `Removed ${objectNames.length} object${objectNames.length === 1 ? '' : 's'}` };
}

/**
 * Get object by name
 */
export function getObjectByName(world: World, name: string): { id: string; obj: SpatialObject } | null {
  for (const [id, obj] of Object.entries(world.objects)) {
    if (obj.name === name) {
      return { id, obj };
    }
  }
  return null;
}

/**
 * Get all objects in a location (visible only)
 */
export function getVisibleObjectsInLocation(world: World, locationName: string): string[] {
  return Object.values(world.objects)
    .filter(obj => obj.location === locationName && obj.visible && obj.container === null)
    .map(obj => obj.name);
}

/**
 * Get objects inside a container
 */
export function getObjectsInContainer(world: World, containerName: string): SpatialObject[] {
  const container = getObjectByName(world, containerName);
  if (!container) return [];

  return Object.values(world.objects)
    .filter(obj => obj.container === container.id);
}

/**
 * Remove an object from the world and return its data
 * Used when picking up an object into inventory
 */
export function removeObjectForPickup(
  world: World,
  objectName: string
): { success: boolean; message: string; object?: SpatialObject; objectId?: string } {
  const found = getObjectByName(world, objectName);
  if (!found) {
    return { success: false, message: `Object '${objectName}' not found` };
  }

  const { id, obj } = found;

  // Check if object contains other objects
  const containedObjects = Object.entries(world.objects).filter(
    ([_, o]) => o.container === id
  );
  if (containedObjects.length > 0) {
    return {
      success: false,
      message: `Cannot pick up '${objectName}' - it contains other objects: ${containedObjects.map(([_, o]) => o.name).join(', ')}`
    };
  }

  // Remove from world and return the object data
  delete world.objects[id];

  return {
    success: true,
    message: `Picked up '${obj.name}'`,
    object: obj,
    objectId: id
  };
}

/**
 * Add an object to the world (used when dropping from inventory)
 */
export function addObjectFromDrop(
  world: World,
  object: SpatialObject,
  location: string,
  position?: string
): { success: boolean; message: string; objectId?: string } {
  // Validate location exists
  if (!world.locations[location]) {
    return { success: false, message: `Location '${location}' not found` };
  }

  const id = generateObjectId(object.type);
  const droppedObj: SpatialObject = {
    ...object,
    location,
    container: null,
    position: position || 'here',
    visible: true
  };

  world.objects[id] = droppedObj;

  return {
    success: true,
    message: `Dropped '${object.name}' at ${location}`,
    objectId: id
  };
}

// ===== Agent Management =====

/**
 * Move agent to new location
 */
export function moveAgent(
  world: World,
  agentId: string,
  location: string,
  position: string
): { success: boolean; message: string } {
  if (!world.locations[location]) {
    return { success: false, message: `Location '${location}' not found` };
  }

  world.agents[agentId] = { location, position };
  return { success: true, message: `Moved to ${location}` };
}

/**
 * Get agents in a location
 */
export function getAgentsInLocation(world: World, locationName: string): string[] {
  return Object.entries(world.agents)
    .filter(([_, pos]) => pos.location === locationName)
    .map(([agentId]) => agentId);
}

/**
 * Find entity (agent or user) in world
 */
export function locateEntity(
  world: World,
  target: string,
  currentAgentId: string
): { found: boolean; location?: string; distance?: string } {
  // Check if target is an agent
  const agentPos = world.agents[target];
  if (agentPos) {
    const currentPos = world.agents[currentAgentId];
    const distance = agentPos.location === currentPos?.location ? 'same' : 'adjacent';
    return { found: true, location: agentPos.location, distance };
  }

  // Check if target is "user" (special entity)
  if (target.toLowerCase() === 'user') {
    const userPos = world.agents['user'];
    if (userPos) {
      const currentPos = world.agents[currentAgentId];
      const distance = userPos.location === currentPos?.location ? 'same' : 'adjacent';
      return { found: true, location: userPos.location, distance };
    }
  }

  return { found: false };
}
