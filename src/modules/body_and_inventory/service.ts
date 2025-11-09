/**
 * Body and Inventory Service
 *
 * Manages body parts and inventory with Letta memory integration
 */

import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import type { LettaService } from '../letta/service.js';
import {
  BodyPart,
  BodyState,
  InventoryItem,
  InventoryState,
  BodyAndInventoryState,
  BodyAndInventoryConfig,
  ConfigSchema
} from './types.js';

export class BodyAndInventoryService implements BaseService {
  private agentId!: AgentId;
  private config!: BodyAndInventoryConfig;
  private context!: ServiceContext;
  private state!: BodyAndInventoryState;
  private lettaService?: LettaService;

  async init(agentId: AgentId, config: Record<string, unknown>, context: ServiceContext): Promise<void> {
    this.agentId = agentId;
    this.context = context;

    // Validate and parse config
    const parseResult = ConfigSchema.safeParse(config);
    if (!parseResult.success) {
      throw new Error(`Invalid body_and_inventory configuration: ${parseResult.error.message}`);
    }
    this.config = parseResult.data;

    // Try to get Letta service if available
    try {
      this.lettaService = context.getService('letta') as LettaService;
    } catch (error) {
      // Letta service not available, that's OK
      this.lettaService = undefined;
    }

    // Initialize or restore state
    const savedState = await context.getDB().read<BodyAndInventoryState>();
    if (savedState && savedState.body && savedState.inventory) {
      this.state = savedState;
    } else {
      // Initialize new state with default body parts
      this.state = {
        body: {
          parts: this.initializeDefaultBodyParts()
        },
        inventory: {
          items: {}
        },
        letta_memory_block_created: false
      };
      await context.getDB().write(this.state);
    }

    // Ensure Letta memory block exists if Letta service is available
    if (this.lettaService) {
      await this.ensureLettaMemoryBlock();
    }
  }

  async getState(): Promise<Record<string, unknown>> {
    return this.state as unknown as Record<string, unknown>;
  }

  async setState(state: Record<string, unknown>): Promise<void> {
    this.state = state as unknown as BodyAndInventoryState;
    await this.context.getDB().write(this.state);
  }

  private initializeDefaultBodyParts(): Record<string, BodyPart> {
    const parts: Record<string, BodyPart> = {};
    for (const [partName, partConfig] of Object.entries(this.config.default_body_parts)) {
      parts[partName] = {
        name: partName,
        descriptors: { ...partConfig.descriptors },
        states: []
      };
    }
    return parts;
  }

  private async saveState(): Promise<void> {
    await this.context.getDB().write(this.state);
  }

  private async ensureLettaMemoryBlock(): Promise<void> {
    if (!this.lettaService || this.state.letta_memory_block_created) {
      return;
    }

    try {
      // Get Letta agent ID from Letta service state
      const lettaState = await this.lettaService.getState();
      const lettaAgentId = lettaState.letta_agent_id;

      if (!lettaAgentId) {
        console.warn(`[body_and_inventory] Letta agent not yet created for ${this.agentId}`);
        return;
      }

      // Create the memory block
      const client = (this.lettaService as any).client;
      if (!client) {
        console.warn(`[body_and_inventory] Letta client not available`);
        return;
      }

      // Check if block already exists
      const existingBlocks = await client.getMemoryBlocks(lettaAgentId);
      if (!existingBlocks.body_and_inventory) {
        // Create new block with initial content
        const initialContent = this.formatMemoryBlock();
        await client.updateMemoryBlock(lettaAgentId, 'body_and_inventory', initialContent);
        console.log(`[body_and_inventory] Created memory block for agent ${this.agentId}`);
      }

      this.state.letta_memory_block_created = true;
      await this.saveState();
    } catch (error: any) {
      console.error(`[body_and_inventory] Failed to ensure Letta memory block:`, error.message);
    }
  }

  private formatMemoryBlock(): string {
    const lines: string[] = [];

    // Body section
    const bodyParts = Object.values(this.state.body.parts).filter(
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
    const equippedItems = Object.values(this.state.inventory.items).filter(
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
    const markedItems = Object.values(this.state.inventory.items).filter(
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

    return lines.length > 0 ? lines.join('\n') : 'No notable body features or items.';
  }

  async updateLettaMemoryBlock(): Promise<void> {
    if (!this.lettaService) {
      return;
    }

    try {
      const lettaState = await this.lettaService.getState();
      const lettaAgentId = lettaState.letta_agent_id;

      if (!lettaAgentId) {
        return;
      }

      const client = (this.lettaService as any).client;
      if (!client) {
        return;
      }

      const content = this.formatMemoryBlock();
      await client.updateMemoryBlock(lettaAgentId, 'body_and_inventory', content);
    } catch (error: any) {
      console.error(`[body_and_inventory] Failed to update Letta memory block:`, error.message);
    }
  }

  // ===== Body Management Methods =====

  async createBodyPart(partName: string): Promise<{ success: boolean; message: string }> {
    if (this.state.body.parts[partName]) {
      return { success: false, message: `Body part '${partName}' already exists` };
    }

    this.state.body.parts[partName] = {
      name: partName,
      descriptors: {},
      states: []
    };

    await this.saveState();
    await this.updateLettaMemoryBlock();

    return { success: true, message: `Created body part '${partName}'` };
  }

  async addBodyDescriptor(partName: string, key: string, value: string): Promise<{ success: boolean; message: string }> {
    const part = this.state.body.parts[partName];
    if (!part) {
      return { success: false, message: `Body part '${partName}' not found. Create it first.` };
    }

    part.descriptors[key] = value;
    await this.saveState();
    await this.updateLettaMemoryBlock();

    return { success: true, message: `Added descriptor ${key}='${value}' to ${partName}` };
  }

  async removeBodyDescriptor(partName: string, key: string): Promise<{ success: boolean; message: string }> {
    const part = this.state.body.parts[partName];
    if (!part) {
      return { success: false, message: `Body part '${partName}' not found` };
    }

    if (!part.descriptors[key]) {
      return { success: false, message: `Descriptor '${key}' not found on ${partName}` };
    }

    delete part.descriptors[key];
    await this.saveState();
    await this.updateLettaMemoryBlock();

    return { success: true, message: `Removed descriptor '${key}' from ${partName}` };
  }

  async addBodyState(partName: string, state: string): Promise<{ success: boolean; message: string }> {
    const part = this.state.body.parts[partName];
    if (!part) {
      return { success: false, message: `Body part '${partName}' not found. Create it first.` };
    }

    if (part.states.includes(state)) {
      return { success: false, message: `State '${state}' already exists on ${partName}` };
    }

    part.states.push(state);
    await this.saveState();
    await this.updateLettaMemoryBlock();

    return { success: true, message: `Added state '${state}' to ${partName}` };
  }

  async removeBodyState(partName: string, state: string): Promise<{ success: boolean; message: string }> {
    const part = this.state.body.parts[partName];
    if (!part) {
      return { success: false, message: `Body part '${partName}' not found` };
    }

    const index = part.states.indexOf(state);
    if (index === -1) {
      return { success: false, message: `State '${state}' not found on ${partName}` };
    }

    part.states.splice(index, 1);
    await this.saveState();
    await this.updateLettaMemoryBlock();

    return { success: true, message: `Removed state '${state}' from ${partName}` };
  }

  async getBodyPart(partName: string): Promise<BodyPart | null> {
    return this.state.body.parts[partName] || null;
  }

  async listBodyParts(): Promise<BodyPart[]> {
    return Object.values(this.state.body.parts);
  }

  // ===== Inventory Management Methods =====

  async addInventoryItem(
    name: string,
    description?: string,
    descriptors?: Record<string, string>,
    properties?: Record<string, any>
  ): Promise<{ success: boolean; message: string; item?: InventoryItem }> {
    const itemCount = Object.keys(this.state.inventory.items).length;
    if (itemCount >= this.config.max_inventory_items) {
      return {
        success: false,
        message: `Inventory full (max ${this.config.max_inventory_items} items)`
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

    this.state.inventory.items[id] = item;
    await this.saveState();
    // Don't update memory block unless item is marked or equipped

    return { success: true, message: `Added item '${name}' (ID: ${id})`, item };
  }

  async removeInventoryItem(itemId: string): Promise<{ success: boolean; message: string }> {
    const item = this.state.inventory.items[itemId];
    if (!item) {
      return { success: false, message: `Item '${itemId}' not found` };
    }

    const wasVisible = item.equipped_slot || item.show_in_memory;
    delete this.state.inventory.items[itemId];
    await this.saveState();

    if (wasVisible) {
      await this.updateLettaMemoryBlock();
    }

    return { success: true, message: `Removed item '${item.name}'` };
  }

  async equipInventoryItem(itemId: string, slot: string): Promise<{ success: boolean; message: string }> {
    const item = this.state.inventory.items[itemId];
    if (!item) {
      return { success: false, message: `Item '${itemId}' not found` };
    }

    // Unequip any item currently in that slot
    for (const otherItem of Object.values(this.state.inventory.items)) {
      if (otherItem.equipped_slot === slot) {
        delete otherItem.equipped_slot;
      }
    }

    item.equipped_slot = slot;
    await this.saveState();
    await this.updateLettaMemoryBlock();

    return { success: true, message: `Equipped '${item.name}' to ${slot}` };
  }

  async unequipInventoryItem(itemId: string): Promise<{ success: boolean; message: string }> {
    const item = this.state.inventory.items[itemId];
    if (!item) {
      return { success: false, message: `Item '${itemId}' not found` };
    }

    if (!item.equipped_slot) {
      return { success: false, message: `Item '${item.name}' is not equipped` };
    }

    delete item.equipped_slot;
    await this.saveState();
    await this.updateLettaMemoryBlock();

    return { success: true, message: `Unequipped '${item.name}'` };
  }

  async modifyInventoryItem(
    itemId: string,
    updates: {
      name?: string;
      description?: string;
      descriptors?: Record<string, string>;
      properties?: Record<string, any>;
    }
  ): Promise<{ success: boolean; message: string }> {
    const item = this.state.inventory.items[itemId];
    if (!item) {
      return { success: false, message: `Item '${itemId}' not found` };
    }

    if (updates.name !== undefined) item.name = updates.name;
    if (updates.description !== undefined) item.description = updates.description;
    if (updates.descriptors !== undefined) item.descriptors = updates.descriptors;
    if (updates.properties !== undefined) item.properties = updates.properties;

    await this.saveState();

    // Update memory if item is visible
    if (item.equipped_slot || item.show_in_memory) {
      await this.updateLettaMemoryBlock();
    }

    return { success: true, message: `Modified item '${item.name}'` };
  }

  async markItemForMemory(itemId: string, show: boolean): Promise<{ success: boolean; message: string }> {
    const item = this.state.inventory.items[itemId];
    if (!item) {
      return { success: false, message: `Item '${itemId}' not found` };
    }

    item.show_in_memory = show;
    await this.saveState();
    await this.updateLettaMemoryBlock();

    return {
      success: true,
      message: show ? `Marked '${item.name}' to show in memory` : `Unmarked '${item.name}' from memory`
    };
  }

  async getInventoryItem(itemId: string): Promise<InventoryItem | null> {
    return this.state.inventory.items[itemId] || null;
  }

  async listInventoryItems(): Promise<InventoryItem[]> {
    return Object.values(this.state.inventory.items);
  }
}
