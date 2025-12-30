/**
 * Body and Inventory Service (Singleton)
 *
 * Manages body parts and inventory with Letta memory integration.
 * Per-agent state: body parts, inventory items
 */

import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import type { LettaManager } from '../../core/letta/index.js';
import { createComponentLogger } from '../../core/logger.js';

const log = createComponentLogger('BodyAndInventory');
import {
  BodyPart,
  BodyAndInventoryState,
  BodyAndInventoryConfig,
  ConfigSchema,
  InventoryItem
} from './types.js';

const SERVICE_NAME = 'body_and_inventory';

const DEFAULT_STATE: BodyAndInventoryState = {
  body: { parts: {} },
  inventory: { items: {} },
  letta_memory_block_created: false
};

class BodyAndInventoryService implements BaseService {
  private context?: ServiceContext;
  private agentConfigs: Map<AgentId, BodyAndInventoryConfig> = new Map();

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
      throw new Error('BodyAndInventory service not initialized');
    }

    // Validate and parse config
    const parseResult = ConfigSchema.safeParse(config);
    if (!parseResult.success) {
      throw new Error(`Invalid body_and_inventory configuration: ${parseResult.error.message}`);
    }
    this.agentConfigs.set(agentId, parseResult.data);

    // Get or initialize agent state
    const state = this.getAgentState(agentId);
    if (!state.body || Object.keys(state.body.parts).length === 0) {
      // Initialize new state with default body parts
      const newState: BodyAndInventoryState = {
        body: {
          parts: this.initializeDefaultBodyParts(parseResult.data)
        },
        inventory: {
          items: {}
        },
        letta_memory_block_created: false
      };
      this.saveAgentState(agentId, newState);
    }

    // Ensure Letta memory block exists
    await this.ensureLettaMemoryBlock(agentId);

    log.info(`Initialized for agent ${agentId}`);
  }

  /**
   * Check if an agent can reconnect
   */
  canReconnect(_agentId: AgentId, state: Record<string, unknown>): boolean {
    const bodyState = state as unknown as BodyAndInventoryState;
    return !!bodyState.body && !!bodyState.inventory;
  }

  /**
   * Clean up agent-specific resources
   */
  async cleanupAgent(agentId: AgentId): Promise<void> {
    this.agentConfigs.delete(agentId);
    log.info(`Cleanup complete for agent ${agentId}`);
  }

  async cleanup(): Promise<void> {
    this.agentConfigs.clear();
    log.info('Cleanup complete');
  }

  /**
   * Get agent-specific state
   */
  private getAgentState(agentId: AgentId): BodyAndInventoryState {
    if (!this.context) {
      return DEFAULT_STATE;
    }
    const state = this.context.getState<BodyAndInventoryState>(agentId, SERVICE_NAME);
    return state.get() || DEFAULT_STATE;
  }

  /**
   * Save agent-specific state
   */
  private saveAgentState(agentId: AgentId, newState: BodyAndInventoryState): void {
    if (!this.context) return;
    const state = this.context.getState<BodyAndInventoryState>(agentId, SERVICE_NAME);
    state.set(newState);
  }

  /**
   * Get config for an agent
   */
  private getConfig(agentId: AgentId): BodyAndInventoryConfig {
    return this.agentConfigs.get(agentId) || { default_body_parts: {}, max_inventory_items: 100 };
  }

  /**
   * Get LettaManager if available
   */
  private getLettaManager(): LettaManager | undefined {
    if (!this.context) return undefined;
    return this.context.getLettaManager?.();
  }

  private initializeDefaultBodyParts(config: BodyAndInventoryConfig): Record<string, BodyPart> {
    const parts: Record<string, BodyPart> = {};
    for (const [partName, partConfig] of Object.entries(config.default_body_parts)) {
      parts[partName] = {
        name: partName,
        descriptors: { ...partConfig.descriptors },
        states: []
      };
    }
    return parts;
  }

  private async ensureLettaMemoryBlock(agentId: AgentId): Promise<void> {
    const state = this.getAgentState(agentId);
    if (state.letta_memory_block_created) {
      return;
    }

    const lettaManager = this.getLettaManager();
    if (!lettaManager) return;

    const lettaContext = lettaManager.getAgentContext(agentId);
    if (!lettaContext) {
      log.warn(`Letta agent not yet created for ${agentId}`);
      return;
    }

    try {
      const existingBlocks = await lettaContext.getMemory();

      if (!existingBlocks.body_and_inventory) {
        const initialContent = this.formatMemoryBlock(agentId);
        await lettaContext.updateMemory('body_and_inventory', initialContent);
        log.info(`Created memory block for agent ${agentId}`);
      }

      state.letta_memory_block_created = true;
      this.saveAgentState(agentId, state);
    } catch (error: any) {
      log.error(`Failed to ensure Letta memory block`, { error: error.message });
    }
  }

  private formatMemoryBlock(agentId: AgentId): string {
    const state = this.getAgentState(agentId);
    const lines: string[] = [];

    // Body section
    const bodyParts = Object.values(state.body.parts).filter(
      part => Object.keys(part.descriptors).length > 0 || part.states.length > 0
    );

    if (bodyParts.length > 0) {
      lines.push('BODY:');
      for (const part of bodyParts) {
        const descriptorStr = Object.entries(part.descriptors)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        const stateStr = part.states.length > 0 ? ` [${part.states.join(', ')}]` : '';
        const fullDesc = descriptorStr + stateStr;
        if (fullDesc) {
          lines.push(`  ${part.name}: ${fullDesc}`);
        }
      }
    }

    // Equipped items section
    const equippedItems = Object.values(state.inventory.items).filter(
      item => item.equipped_slot
    );

    if (equippedItems.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('EQUIPPED:');
      for (const item of equippedItems) {
        const descriptorStr = Object.entries(item.descriptors)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        lines.push(`  ${item.equipped_slot}: ${item.name}${descriptorStr ? ` (${descriptorStr})` : ''}`);
      }
    }

    // Marked items section
    const markedItems = Object.values(state.inventory.items).filter(
      item => item.show_in_memory && !item.equipped_slot
    );

    if (markedItems.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('NOTABLE ITEMS:');
      for (const item of markedItems) {
        const descriptorStr = Object.entries(item.descriptors)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        lines.push(`  ${item.name}${descriptorStr ? ` (${descriptorStr})` : ''}`);
      }
    }

    // Count other items (not equipped and not marked as notable)
    const otherItemsCount = Object.values(state.inventory.items).filter(
      item => !item.equipped_slot && !item.show_in_memory
    ).length;

    if (otherItemsCount > 0) {
      if (lines.length > 0) lines.push('');
      lines.push(`${otherItemsCount} other item${otherItemsCount === 1 ? '' : 's'} in inventory. Use manage_inventory for details.`);
    }

    return lines.length > 0 ? lines.join('\n') : 'No notable body features or items.';
  }

  async updateLettaMemoryBlock(agentId: AgentId): Promise<void> {
    const lettaManager = this.getLettaManager();
    if (!lettaManager) return;

    const lettaContext = lettaManager.getAgentContext(agentId);
    if (!lettaContext) return;

    try {
      const content = this.formatMemoryBlock(agentId);
      await lettaContext.updateMemory('body_and_inventory', content);
    } catch (error: any) {
      log.error(`Failed to update Letta memory block`, { error: error.message });
    }
  }

  // ===== Body Management Methods =====

  async createBodyPart(agentId: AgentId, partName: string): Promise<{ success: boolean; message: string }> {
    const state = this.getAgentState(agentId);

    if (state.body.parts[partName]) {
      return { success: false, message: `Body part '${partName}' already exists` };
    }

    state.body.parts[partName] = {
      name: partName,
      descriptors: {},
      states: []
    };

    this.saveAgentState(agentId, state);
    await this.updateLettaMemoryBlock(agentId);

    return { success: true, message: `Created body part '${partName}'` };
  }

  async createBodyPartsBulk(
    agentId: AgentId,
    parts: Array<{
      name: string;
      descriptors?: Record<string, string>;
      states?: string[];
    }>
  ): Promise<{ success: boolean; message: string; parts?: BodyPart[]; skipped?: string[] }> {
    const state = this.getAgentState(agentId);
    const createdParts: BodyPart[] = [];
    const skippedParts: string[] = [];

    for (const partData of parts) {
      if (state.body.parts[partData.name]) {
        skippedParts.push(partData.name);
        continue;
      }

      const part: BodyPart = {
        name: partData.name,
        descriptors: partData.descriptors || {},
        states: partData.states || []
      };

      state.body.parts[partData.name] = part;
      createdParts.push(part);
    }

    if (createdParts.length > 0) {
      this.saveAgentState(agentId, state);
      await this.updateLettaMemoryBlock(agentId);
    }

    const messages: string[] = [];
    if (createdParts.length > 0) {
      messages.push(`Created ${createdParts.length} body part${createdParts.length === 1 ? '' : 's'}`);
    }
    if (skippedParts.length > 0) {
      messages.push(`Skipped ${skippedParts.length} existing part${skippedParts.length === 1 ? '' : 's'}: ${skippedParts.join(', ')}`);
    }

    return {
      success: createdParts.length > 0,
      message: messages.join('. '),
      parts: createdParts,
      skipped: skippedParts
    };
  }

  async addBodyDescriptor(agentId: AgentId, partName: string, key: string, value: string): Promise<{ success: boolean; message: string }> {
    const state = this.getAgentState(agentId);
    const part = state.body.parts[partName];

    if (!part) {
      return { success: false, message: `Body part '${partName}' not found. Create it first.` };
    }

    part.descriptors[key] = value;
    this.saveAgentState(agentId, state);
    await this.updateLettaMemoryBlock(agentId);

    return { success: true, message: `Added descriptor ${key}='${value}' to ${partName}` };
  }

  async removeBodyDescriptor(agentId: AgentId, partName: string, key: string): Promise<{ success: boolean; message: string }> {
    const state = this.getAgentState(agentId);
    const part = state.body.parts[partName];

    if (!part) {
      return { success: false, message: `Body part '${partName}' not found` };
    }

    if (!part.descriptors[key]) {
      return { success: false, message: `Descriptor '${key}' not found on ${partName}` };
    }

    delete part.descriptors[key];
    this.saveAgentState(agentId, state);
    await this.updateLettaMemoryBlock(agentId);

    return { success: true, message: `Removed descriptor '${key}' from ${partName}` };
  }

  async addBodyState(agentId: AgentId, partName: string, bodyState: string): Promise<{ success: boolean; message: string }> {
    const state = this.getAgentState(agentId);
    const part = state.body.parts[partName];

    if (!part) {
      return { success: false, message: `Body part '${partName}' not found. Create it first.` };
    }

    if (part.states.includes(bodyState)) {
      return { success: false, message: `State '${bodyState}' already exists on ${partName}` };
    }

    part.states.push(bodyState);
    this.saveAgentState(agentId, state);
    await this.updateLettaMemoryBlock(agentId);

    return { success: true, message: `Added state '${bodyState}' to ${partName}` };
  }

  async removeBodyState(agentId: AgentId, partName: string, bodyState: string): Promise<{ success: boolean; message: string }> {
    const state = this.getAgentState(agentId);
    const part = state.body.parts[partName];

    if (!part) {
      return { success: false, message: `Body part '${partName}' not found` };
    }

    const index = part.states.indexOf(bodyState);
    if (index === -1) {
      return { success: false, message: `State '${bodyState}' not found on ${partName}` };
    }

    part.states.splice(index, 1);
    this.saveAgentState(agentId, state);
    await this.updateLettaMemoryBlock(agentId);

    return { success: true, message: `Removed state '${bodyState}' from ${partName}` };
  }

  async getBodyPart(agentId: AgentId, partName: string): Promise<BodyPart | null> {
    const state = this.getAgentState(agentId);
    return state.body.parts[partName] || null;
  }

  async listBodyParts(agentId: AgentId): Promise<BodyPart[]> {
    const state = this.getAgentState(agentId);
    return Object.values(state.body.parts);
  }

  // ===== Inventory Management Methods =====

  async addInventoryItem(
    agentId: AgentId,
    name: string,
    description?: string,
    descriptors?: Record<string, string>,
    properties?: Record<string, any>
  ): Promise<{ success: boolean; message: string; item?: InventoryItem }> {
    const state = this.getAgentState(agentId);
    const config = this.getConfig(agentId);

    const itemCount = Object.keys(state.inventory.items).length;
    if (itemCount >= config.max_inventory_items) {
      return {
        success: false,
        message: `Inventory full (max ${config.max_inventory_items} items)`
      };
    }

    const id = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const item: InventoryItem = {
      id,
      name,
      description,
      descriptors: descriptors || {},
      properties: properties || {},
      show_in_memory: false
    };

    state.inventory.items[id] = item;
    this.saveAgentState(agentId, state);

    return { success: true, message: `Added item '${name}' (ID: ${id})`, item };
  }

  async addInventoryItemsBulk(
    agentId: AgentId,
    items: Array<{
      name: string;
      description?: string;
      descriptors?: Record<string, string>;
      properties?: Record<string, any>;
    }>
  ): Promise<{ success: boolean; message: string; items?: InventoryItem[]; failed?: number }> {
    const state = this.getAgentState(agentId);
    const config = this.getConfig(agentId);

    const currentItemCount = Object.keys(state.inventory.items).length;
    const availableSlots = config.max_inventory_items - currentItemCount;

    if (items.length > availableSlots) {
      return {
        success: false,
        message: `Cannot add ${items.length} items. Only ${availableSlots} slots available (max ${config.max_inventory_items})`
      };
    }

    const addedItems: InventoryItem[] = [];

    for (const itemData of items) {
      const id = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const item: InventoryItem = {
        id,
        name: itemData.name,
        description: itemData.description,
        descriptors: itemData.descriptors || {},
        properties: itemData.properties || {},
        show_in_memory: false
      };

      state.inventory.items[id] = item;
      addedItems.push(item);

      // Small delay to ensure unique IDs
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    this.saveAgentState(agentId, state);

    return {
      success: true,
      message: `Added ${addedItems.length} item${addedItems.length === 1 ? '' : 's'} to inventory`,
      items: addedItems,
      failed: 0
    };
  }

  async removeInventoryItem(agentId: AgentId, itemId: string): Promise<{ success: boolean; message: string }> {
    const state = this.getAgentState(agentId);
    const item = state.inventory.items[itemId];

    if (!item) {
      return { success: false, message: `Item '${itemId}' not found` };
    }

    const wasVisible = item.equipped_slot || item.show_in_memory;
    delete state.inventory.items[itemId];
    this.saveAgentState(agentId, state);

    if (wasVisible) {
      await this.updateLettaMemoryBlock(agentId);
    }

    return { success: true, message: `Removed item '${item.name}'` };
  }

  async equipInventoryItem(agentId: AgentId, itemId: string, slot: string): Promise<{ success: boolean; message: string }> {
    const state = this.getAgentState(agentId);
    const item = state.inventory.items[itemId];

    if (!item) {
      return { success: false, message: `Item '${itemId}' not found` };
    }

    // Unequip any item currently in that slot
    for (const otherItem of Object.values(state.inventory.items)) {
      if (otherItem.equipped_slot === slot) {
        delete otherItem.equipped_slot;
      }
    }

    item.equipped_slot = slot;
    this.saveAgentState(agentId, state);
    await this.updateLettaMemoryBlock(agentId);

    return { success: true, message: `Equipped '${item.name}' to ${slot}` };
  }

  async unequipInventoryItem(agentId: AgentId, itemId: string): Promise<{ success: boolean; message: string }> {
    const state = this.getAgentState(agentId);
    const item = state.inventory.items[itemId];

    if (!item) {
      return { success: false, message: `Item '${itemId}' not found` };
    }

    if (!item.equipped_slot) {
      return { success: false, message: `Item '${item.name}' is not equipped` };
    }

    delete item.equipped_slot;
    this.saveAgentState(agentId, state);
    await this.updateLettaMemoryBlock(agentId);

    return { success: true, message: `Unequipped '${item.name}'` };
  }

  async modifyInventoryItem(
    agentId: AgentId,
    itemId: string,
    updates: {
      name?: string;
      description?: string;
      descriptors?: Record<string, string>;
      properties?: Record<string, any>;
    }
  ): Promise<{ success: boolean; message: string }> {
    const state = this.getAgentState(agentId);
    const item = state.inventory.items[itemId];

    if (!item) {
      return { success: false, message: `Item '${itemId}' not found` };
    }

    if (updates.name !== undefined) item.name = updates.name;
    if (updates.description !== undefined) item.description = updates.description;
    if (updates.descriptors !== undefined) item.descriptors = updates.descriptors;
    if (updates.properties !== undefined) item.properties = updates.properties;

    this.saveAgentState(agentId, state);

    if (item.equipped_slot || item.show_in_memory) {
      await this.updateLettaMemoryBlock(agentId);
    }

    return { success: true, message: `Modified item '${item.name}'` };
  }

  async markItemForMemory(agentId: AgentId, itemId: string, show: boolean): Promise<{ success: boolean; message: string }> {
    const state = this.getAgentState(agentId);
    const item = state.inventory.items[itemId];

    if (!item) {
      return { success: false, message: `Item '${itemId}' not found` };
    }

    item.show_in_memory = show;
    this.saveAgentState(agentId, state);
    await this.updateLettaMemoryBlock(agentId);

    return {
      success: true,
      message: show ? `Marked '${item.name}' to show in memory` : `Unmarked '${item.name}' from memory`
    };
  }

  async getInventoryItem(agentId: AgentId, itemId: string): Promise<InventoryItem | null> {
    const state = this.getAgentState(agentId);
    return state.inventory.items[itemId] || null;
  }

  /**
   * Find an inventory item by name or ID
   * Tries ID first, then name (case-insensitive)
   */
  async findInventoryItem(agentId: AgentId, nameOrId: string): Promise<InventoryItem | null> {
    const state = this.getAgentState(agentId);

    // Try ID first
    if (state.inventory.items[nameOrId]) {
      return state.inventory.items[nameOrId];
    }

    // Try name match (case-insensitive)
    const lowerName = nameOrId.toLowerCase();
    const item = Object.values(state.inventory.items).find(
      item => item.name.toLowerCase() === lowerName
    );
    return item || null;
  }

  async listInventoryItems(agentId: AgentId): Promise<InventoryItem[]> {
    const state = this.getAgentState(agentId);
    return Object.values(state.inventory.items);
  }

  // ===== Journal Support Methods (used by JournalService) =====

  /**
   * Get all journal items from inventory
   */
  async getJournals(agentId: AgentId): Promise<InventoryItem[]> {
    const state = this.getAgentState(agentId);
    return Object.values(state.inventory.items).filter(item => item.type === 'journal');
  }

  /**
   * Find a journal by title or ID
   */
  async findJournal(agentId: AgentId, journalRef: string): Promise<InventoryItem | null> {
    const state = this.getAgentState(agentId);
    const items = Object.values(state.inventory.items);

    // First try exact ID match
    const byId = items.find(item => item.id === journalRef && item.type === 'journal');
    if (byId) return byId;

    // Then try title match (case-insensitive)
    const byTitle = items.find(
      item => item.type === 'journal' &&
        (item.name.toLowerCase() === journalRef.toLowerCase() ||
         item.journal_data?.title.toLowerCase() === journalRef.toLowerCase())
    );
    return byTitle || null;
  }

  /**
   * Receive an item (used for creating journals or receiving items from other agents)
   */
  async receiveItem(agentId: AgentId, item: InventoryItem): Promise<{ success: boolean; message: string; item?: InventoryItem }> {
    const state = this.getAgentState(agentId);
    const config = this.getConfig(agentId);

    const itemCount = Object.keys(state.inventory.items).length;
    if (itemCount >= config.max_inventory_items) {
      return {
        success: false,
        message: `Inventory full (max ${config.max_inventory_items} items)`
      };
    }

    state.inventory.items[item.id] = item;
    this.saveAgentState(agentId, state);

    if (item.show_in_memory || item.equipped_slot) {
      await this.updateLettaMemoryBlock(agentId);
    }

    return { success: true, message: `Received item '${item.name}'`, item };
  }
}

export default BodyAndInventoryService;
