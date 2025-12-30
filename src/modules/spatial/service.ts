/**
 * Spatial Service (Singleton)
 *
 * Manages spatial awareness and embodiment for agents.
 * Global state: worlds (shared across agents)
 * Per-agent state: current world, location, position
 */

import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import type { LettaManager } from '../../core/letta/index.js';
import { createComponentLogger } from '../../core/logger.js';
import {
  SpatialState,
  AgentSpatialState,
  SpatialConfig,
  ConfigSchema,
  World,
  LocationCreate,
  LocationModify,
  ObjectCreate,
  ObjectModify,
  ObjectMove,
  SpatialObject
} from './types.js';
import * as WorldState from './world-state.js';
import type BodyAndInventoryService from '../embodiment/service.js';
import type { InventoryItem } from '../embodiment/types.js';
import { generateLocationPerception, formatLocationMemoryBlock, generateDetailedLook } from './perception.js';

const SERVICE_NAME = 'spatial';
const log = createComponentLogger('Spatial');

const DEFAULT_AGENT_STATE: AgentSpatialState = {
  world_id: '',
  current_location: '',
  current_position: 'here'
};

class SpatialService implements BaseService {
  private context?: ServiceContext;
  private agentConfigs: Map<AgentId, SpatialConfig> = new Map();

  /**
   * Initialize the service (global, once at startup)
   */
  async init(context: ServiceContext): Promise<void> {
    this.context = context;
    log.info('Service initialized (global singleton)');
  }

  /**
   * Initialize for a specific agent
   */
  async initAgent(agentId: AgentId, config: Record<string, unknown>): Promise<void> {
    if (!this.context) {
      throw new Error('Spatial service not initialized');
    }

    // Validate and parse config
    const parseResult = ConfigSchema.safeParse(config);
    if (!parseResult.success) {
      throw new Error(`Invalid spatial configuration: ${parseResult.error.message}`);
    }
    this.agentConfigs.set(agentId, parseResult.data);

    // Initialize or ensure world state exists
    await this.initializeWorldState(parseResult.data);

    // Get or initialize agent state
    const agentState = this.getAgentState(agentId);
    if (!agentState.world_id || !agentState.current_location) {
      // Initialize new agent in default world
      const defaultWorldId = Object.keys(parseResult.data.worlds)[0];
      const worlds = this.getGlobalState();
      const defaultWorld = worlds.worlds[defaultWorldId];

      if (!defaultWorld) {
        throw new Error('No worlds configured for spatial module');
      }

      const newState: AgentSpatialState = {
        world_id: defaultWorldId,
        current_location: defaultWorld.default_location,
        current_position: 'here'
      };

      // Add agent to world
      defaultWorld.agents[agentId] = {
        location: newState.current_location,
        position: newState.current_position
      };

      this.saveAgentState(agentId, newState);
      await this.saveGlobalState(worlds);
    }

    // Update Letta memory block
    await this.updateLettaMemoryBlock(agentId);

    log.info('Initialized for agent', { agentId });
  }

  /**
   * Check if an agent can reconnect
   */
  canReconnect(_agentId: AgentId, state: Record<string, unknown>): boolean {
    const spatialState = state as unknown as AgentSpatialState;
    return !!spatialState.world_id && !!spatialState.current_location;
  }

  /**
   * Clean up agent-specific resources
   */
  async cleanupAgent(agentId: AgentId): Promise<void> {
    // Remove agent from world
    const agentState = this.getAgentState(agentId);
    if (agentState.world_id) {
      const worlds = this.getGlobalState();
      const world = worlds.worlds[agentState.world_id];
      if (world) {
        delete world.agents[agentId];
        await this.saveGlobalState(worlds);
      }
    }

    this.agentConfigs.delete(agentId);
    log.info('Cleanup complete for agent', { agentId });
  }

  async cleanup(): Promise<void> {
    this.agentConfigs.clear();
    log.info('Cleanup complete');
  }

  /**
   * Get global state (shared worlds)
   */
  private getGlobalState(): SpatialState {
    if (!this.context) {
      return { worlds: {} };
    }
    const state = this.context.getGlobalState<SpatialState>(SERVICE_NAME);
    return state.get() || { worlds: {} };
  }

  /**
   * Save global state (with immediate flush to prevent data loss)
   */
  private async saveGlobalState(newState: SpatialState): Promise<void> {
    if (!this.context) return;
    const state = this.context.getGlobalState<SpatialState>(SERVICE_NAME);
    state.set(newState);
    // Flush immediately to prevent data loss on crash
    await state.flush();
  }

  /**
   * Get agent-specific state
   */
  private getAgentState(agentId: AgentId): AgentSpatialState {
    if (!this.context) {
      return DEFAULT_AGENT_STATE;
    }
    const state = this.context.getState<AgentSpatialState>(agentId, SERVICE_NAME);
    return state.get() || DEFAULT_AGENT_STATE;
  }

  /**
   * Save agent-specific state
   */
  private saveAgentState(agentId: AgentId, newState: AgentSpatialState): void {
    if (!this.context) return;
    const state = this.context.getState<AgentSpatialState>(agentId, SERVICE_NAME);
    state.set(newState);
  }

  /**
   * Initialize world state from config if not already present
   */
  private async initializeWorldState(config: SpatialConfig): Promise<void> {
    const globalState = this.getGlobalState();

    // Add any worlds from config that don't already exist
    for (const [worldId, worldDef] of Object.entries(config.worlds)) {
      if (!globalState.worlds[worldId]) {
        globalState.worlds[worldId] = {
          name: worldDef.name,
          description: worldDef.description,
          default_location: worldDef.default_location,
          locations: worldDef.locations,
          objects: {},
          agents: {}
        };
      }
    }

    await this.saveGlobalState(globalState);
  }

  /**
   * Get world by ID
   */
  private getWorld(worldId: string): World | null {
    const globalState = this.getGlobalState();
    return globalState.worlds[worldId] || null;
  }

  /**
   * Get current world for an agent
   */
  private getCurrentWorld(agentId: AgentId): World {
    const agentState = this.getAgentState(agentId);
    const world = this.getWorld(agentState.world_id);
    if (!world) {
      throw new Error(`World '${agentState.world_id}' not found`);
    }
    return world;
  }

  /**
   * Get LettaManager if available
   */
  private getLettaManager(): LettaManager | undefined {
    if (!this.context) return undefined;
    return this.context.getLettaManager?.();
  }

  /**
   * Get BodyAndInventory service if available
   */
  private getInventoryService(): BodyAndInventoryService | null {
    if (!this.context) return null;
    try {
      return this.context.getService('body_and_inventory') as BodyAndInventoryService;
    } catch {
      return null;
    }
  }

  /**
   * Update Letta memory block with current location
   */
  private async updateLettaMemoryBlock(agentId: AgentId): Promise<void> {
    const lettaManager = this.getLettaManager();
    if (!lettaManager) return;

    const lettaContext = lettaManager.getAgentContext(agentId);
    if (!lettaContext) return;

    const agentState = this.getAgentState(agentId);
    const world = this.getCurrentWorld(agentId);
    const perception = generateLocationPerception(
      world,
      agentId,
      agentState.current_location,
      agentState.current_position
    );

    if (!perception) return;

    const content = formatLocationMemoryBlock(perception);

    try {
      await lettaContext.updateMemory('current_location', content);
    } catch (error: any) {
      log.warn('Failed to update memory block', { error: error.message });
    }
  }

  // ===== Public Methods (called by tools) =====

  /**
   * Look around current location
   */
  async look(agentId: AgentId, detailed: boolean = false): Promise<string> {
    const agentState = this.getAgentState(agentId);
    const world = this.getCurrentWorld(agentId);

    if (detailed) {
      return generateDetailedLook(world, agentId, agentState.current_location);
    } else {
      const perception = generateLocationPerception(
        world,
        agentId,
        agentState.current_location,
        agentState.current_position
      );
      return perception ? formatLocationMemoryBlock(perception) : 'You are nowhere.';
    }
  }

  /**
   * Move to a new location
   */
  async moveTo(agentId: AgentId, location: string, position: string = 'here'): Promise<{ success: boolean; message: string }> {
    const agentState = this.getAgentState(agentId);
    const globalState = this.getGlobalState();
    const world = globalState.worlds[agentState.world_id];

    if (!world) {
      return { success: false, message: `World '${agentState.world_id}' not found` };
    }

    const result = WorldState.moveAgent(world, agentId, location, position);
    if (!result.success) {
      return result;
    }

    // Update agent state
    const newAgentState: AgentSpatialState = {
      world_id: agentState.world_id,
      current_location: location,
      current_position: position
    };

    this.saveAgentState(agentId, newAgentState);
    await this.saveGlobalState(globalState);

    // Update Letta memory block
    await this.updateLettaMemoryBlock(agentId);

    return result;
  }

  /**
   * Locate an entity (agent or user)
   */
  async locate(agentId: AgentId, target: string): Promise<{ found: boolean; location?: string; distance?: string }> {
    const world = this.getCurrentWorld(agentId);
    return WorldState.locateEntity(world, target, agentId);
  }

  /**
   * Create new location(s)
   */
  async createLocations(agentId: AgentId, locations: LocationCreate[]): Promise<{ success: boolean; message: string; created?: string[] }> {
    const agentState = this.getAgentState(agentId);
    const globalState = this.getGlobalState();
    const world = globalState.worlds[agentState.world_id];

    if (!world) {
      return { success: false, message: `World '${agentState.world_id}' not found` };
    }

    const result = WorldState.createLocations(world, locations);
    if (result.success) {
      await this.saveGlobalState(globalState);
    }

    return result;
  }

  /**
   * Modify existing location(s)
   */
  async modifyLocations(agentId: AgentId, modifications: LocationModify[]): Promise<{ success: boolean; message: string }> {
    const agentState = this.getAgentState(agentId);
    const globalState = this.getGlobalState();
    const world = globalState.worlds[agentState.world_id];

    if (!world) {
      return { success: false, message: `World '${agentState.world_id}' not found` };
    }

    const result = WorldState.modifyLocations(world, modifications);
    if (result.success) {
      await this.saveGlobalState(globalState);
    }

    return result;
  }

  /**
   * Remove location(s)
   */
  async removeLocations(agentId: AgentId, locationNames: string[]): Promise<{ success: boolean; message: string }> {
    const agentState = this.getAgentState(agentId);
    const globalState = this.getGlobalState();
    const world = globalState.worlds[agentState.world_id];

    if (!world) {
      return { success: false, message: `World '${agentState.world_id}' not found` };
    }

    const result = WorldState.removeLocations(world, locationNames);
    if (result.success) {
      await this.saveGlobalState(globalState);
    }

    return result;
  }

  /**
   * List all locations in current world
   */
  async listLocations(agentId: AgentId): Promise<string[]> {
    const world = this.getCurrentWorld(agentId);
    return Object.keys(world.locations);
  }

  /**
   * Switch to a different world
   */
  async switchWorld(agentId: AgentId, worldId: string): Promise<{ success: boolean; message: string }> {
    const globalState = this.getGlobalState();
    const world = globalState.worlds[worldId];

    if (!world) {
      return { success: false, message: `World '${worldId}' not found` };
    }

    // Get current agent state
    const agentState = this.getAgentState(agentId);

    // Remove agent from old world
    const oldWorld = globalState.worlds[agentState.world_id];
    if (oldWorld) {
      delete oldWorld.agents[agentId];
    }

    // Add agent to new world at default location
    world.agents[agentId] = {
      location: world.default_location,
      position: 'here'
    };

    // Update agent state
    const newAgentState: AgentSpatialState = {
      world_id: worldId,
      current_location: world.default_location,
      current_position: 'here'
    };

    this.saveAgentState(agentId, newAgentState);
    await this.saveGlobalState(globalState);

    // Update Letta memory block
    await this.updateLettaMemoryBlock(agentId);

    return { success: true, message: `Switched to world '${world.name}'` };
  }

  /**
   * Examine an object
   */
  async examineObject(agentId: AgentId, objectName: string): Promise<{ success: boolean; message?: string; object?: any }> {
    const world = this.getCurrentWorld(agentId);
    const result = WorldState.getObjectByName(world, objectName);

    if (!result) {
      return { success: false, message: `Object '${objectName}' not found` };
    }

    const { obj } = result;
    const containedObjects = WorldState.getObjectsInContainer(world, objectName);

    return {
      success: true,
      object: {
        name: obj.name,
        type: obj.type,
        position: obj.position,
        location: obj.location,
        state: obj.state,
        contains: containedObjects.map(o => o.name)
      }
    };
  }

  /**
   * Create object(s)
   */
  async createObjects(agentId: AgentId, objects: ObjectCreate[]): Promise<{ success: boolean; message: string; created?: SpatialObject[] }> {
    const agentState = this.getAgentState(agentId);
    const globalState = this.getGlobalState();
    const world = globalState.worlds[agentState.world_id];

    if (!world) {
      return { success: false, message: `World '${agentState.world_id}' not found` };
    }

    const result = WorldState.createObjects(world, objects);
    if (result.success) {
      await this.saveGlobalState(globalState);
    }

    return result;
  }

  /**
   * Modify object(s)
   */
  async modifyObjects(agentId: AgentId, modifications: ObjectModify[]): Promise<{ success: boolean; message: string }> {
    const agentState = this.getAgentState(agentId);
    const globalState = this.getGlobalState();
    const world = globalState.worlds[agentState.world_id];

    if (!world) {
      return { success: false, message: `World '${agentState.world_id}' not found` };
    }

    const result = WorldState.modifyObjects(world, modifications);
    if (result.success) {
      await this.saveGlobalState(globalState);
    }

    return result;
  }

  /**
   * Move object(s)
   */
  async moveObjects(agentId: AgentId, movements: ObjectMove[]): Promise<{ success: boolean; message: string }> {
    const agentState = this.getAgentState(agentId);
    const globalState = this.getGlobalState();
    const world = globalState.worlds[agentState.world_id];

    if (!world) {
      return { success: false, message: `World '${agentState.world_id}' not found` };
    }

    const result = WorldState.moveObjects(world, movements);
    if (result.success) {
      await this.saveGlobalState(globalState);
    }

    return result;
  }

  /**
   * Remove object(s)
   */
  async removeObjects(agentId: AgentId, objectNames: string[]): Promise<{ success: boolean; message: string }> {
    const agentState = this.getAgentState(agentId);
    const globalState = this.getGlobalState();
    const world = globalState.worlds[agentState.world_id];

    if (!world) {
      return { success: false, message: `World '${agentState.world_id}' not found` };
    }

    const result = WorldState.removeObjects(world, objectNames);
    if (result.success) {
      await this.saveGlobalState(globalState);
    }

    return result;
  }

  /**
   * Pick up an object from the world into inventory
   * Removes the object from spatial world and adds it to agent's inventory
   */
  async pickupObject(agentId: AgentId, objectName: string): Promise<{ success: boolean; message: string; item?: InventoryItem }> {
    const inventoryService = this.getInventoryService();
    if (!inventoryService) {
      return { success: false, message: 'Inventory service not available' };
    }

    const agentState = this.getAgentState(agentId);
    const globalState = this.getGlobalState();
    const world = globalState.worlds[agentState.world_id];

    if (!world) {
      return { success: false, message: `World '${agentState.world_id}' not found` };
    }

    // Check if object is in agent's current location
    const found = WorldState.getObjectByName(world, objectName);
    if (!found) {
      return { success: false, message: `Object '${objectName}' not found` };
    }

    if (found.obj.location !== agentState.current_location) {
      return { success: false, message: `Object '${objectName}' is not in your current location` };
    }

    // Remove from world
    const pickupResult = WorldState.removeObjectForPickup(world, objectName);
    if (!pickupResult.success || !pickupResult.object) {
      return { success: false, message: pickupResult.message };
    }

    // Convert SpatialObject to InventoryItem
    const spatialObj = pickupResult.object;
    const inventoryItem: InventoryItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: spatialObj.name,
      type: spatialObj.type,
      description: `Picked up from ${spatialObj.location}`,
      descriptors: {},
      properties: {
        ...spatialObj.state,
        _spatial_origin: {
          location: spatialObj.location,
          position: spatialObj.position
        }
      },
      show_in_memory: false
    };

    // Add to inventory
    const addResult = await inventoryService.receiveItem(agentId, inventoryItem);
    if (!addResult.success) {
      // Rollback: re-add to world
      WorldState.addObjectFromDrop(world, spatialObj, spatialObj.location, spatialObj.position);
      return { success: false, message: `Failed to add to inventory: ${addResult.message}` };
    }

    await this.saveGlobalState(globalState);
    return {
      success: true,
      message: `Picked up '${spatialObj.name}' (inventory ID: ${inventoryItem.id})`,
      item: inventoryItem
    };
  }

  /**
   * Drop an inventory item into the world
   * Removes the item from inventory and creates it as a spatial object
   */
  async dropItem(
    agentId: AgentId,
    itemNameOrId: string,
    position?: string
  ): Promise<{ success: boolean; message: string; objectName?: string }> {
    const inventoryService = this.getInventoryService();
    if (!inventoryService) {
      return { success: false, message: 'Inventory service not available' };
    }

    // Find the item by name or ID
    const item = await inventoryService.findInventoryItem(agentId, itemNameOrId);
    if (!item) {
      return { success: false, message: `Item '${itemNameOrId}' not found in inventory` };
    }

    // Check if item is equipped - must unequip first
    if (item.equipped_slot) {
      return { success: false, message: `Cannot drop '${item.name}' - it is currently equipped to ${item.equipped_slot}. Unequip it first.` };
    }

    const agentState = this.getAgentState(agentId);
    const globalState = this.getGlobalState();
    const world = globalState.worlds[agentState.world_id];

    if (!world) {
      return { success: false, message: `World '${agentState.world_id}' not found` };
    }

    // Convert InventoryItem to SpatialObject
    const spatialObj: SpatialObject = {
      type: item.type || 'item',
      name: item.name,
      location: agentState.current_location,
      container: null,
      position: position || 'here',
      visible: true,
      state: {
        ...item.properties,
        _inventory_origin: {
          item_id: item.id,
          descriptors: item.descriptors
        }
      }
    };

    // Remove the _spatial_origin from state if it exists (was previously picked up)
    delete spatialObj.state._spatial_origin;

    // Add to world
    const dropResult = WorldState.addObjectFromDrop(
      world,
      spatialObj,
      agentState.current_location,
      position
    );

    if (!dropResult.success) {
      return { success: false, message: dropResult.message };
    }

    // Remove from inventory (use item.id since we looked up by name)
    const removeResult = await inventoryService.removeInventoryItem(agentId, item.id);
    if (!removeResult.success) {
      // Rollback: remove from world
      WorldState.removeObjects(world, [item.name]);
      return { success: false, message: `Failed to remove from inventory: ${removeResult.message}` };
    }

    await this.saveGlobalState(globalState);
    return {
      success: true,
      message: `Dropped '${item.name}' at ${agentState.current_location}`,
      objectName: item.name
    };
  }
}

export default SpatialService;
