/**
 * Inventory Service - manages inventory state
 */

import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext, ScopedDatabase } from '../../types/service.js';

interface InventoryState {
  items: string[];
  max_items: number;
}

export class InventoryService implements BaseService {
  private db: ScopedDatabase | null = null;
  private agentId: AgentId | null = null;
  private maxItems: number = 50;
  private items: string[] = [];

  async init(
    agentId: AgentId,
    config: Record<string, unknown>,
    context: ServiceContext
  ): Promise<void> {
    this.agentId = agentId;
    this.db = context.getDB();
    this.maxItems = (config.max_items as number) ?? 50;
    
    // State will be restored via setState if available
    this.items = [];
  }

  async getState(): Promise<Record<string, unknown>> {
    return {
      items: this.items,
      max_items: this.maxItems,
    };
  }

  async setState(state: Record<string, unknown>): Promise<void> {
    this.items = (state.items as string[]) ?? [];
    this.maxItems = (state.max_items as number) ?? this.maxItems;
  }

  async onConfigChange(
    oldConfig: Record<string, unknown>,
    newConfig: Record<string, unknown>
  ): Promise<void> {
    const oldMaxItems = (oldConfig.max_items as number) ?? this.maxItems;
    const newMaxItems = (newConfig.max_items as number) ?? this.maxItems;

    if (newMaxItems !== oldMaxItems) {
      // If new max is smaller, remove excess items
      if (newMaxItems < this.items.length) {
        this.items = this.items.slice(0, newMaxItems);
        // Persist the change
        if (this.db) {
          await this.db.write({
            items: this.items,
            max_items: newMaxItems,
          });
        }
      }
      this.maxItems = newMaxItems;
    }
  }

  /**
   * Add an item to inventory
   */
  async addItem(item: string): Promise<{ success: boolean; message: string }> {
    if (this.items.length >= this.maxItems) {
      return {
        success: false,
        message: `Inventory is full (max ${this.maxItems} items)`,
      };
    }

    if (this.items.includes(item)) {
      return {
        success: false,
        message: `Item "${item}" already exists in inventory`,
      };
    }

    this.items.push(item);
    
    // Persist to database
    if (this.db) {
      await this.db.write({
        items: this.items,
        max_items: this.maxItems,
      });
    }

    return {
      success: true,
      message: `Added "${item}" to inventory`,
    };
  }

  /**
   * Remove an item from inventory
   */
  async removeItem(item: string): Promise<{ success: boolean; message: string }> {
    const index = this.items.indexOf(item);
    if (index === -1) {
      return {
        success: false,
        message: `Item "${item}" not found in inventory`,
      };
    }

    this.items.splice(index, 1);
    
    // Persist to database
    if (this.db) {
      await this.db.write({
        items: this.items,
        max_items: this.maxItems,
      });
    }

    return {
      success: true,
      message: `Removed "${item}" from inventory`,
    };
  }

  /**
   * List all items in inventory
   */
  async listItems(): Promise<string[]> {
    return [...this.items];
  }

  /**
   * Get inventory count
   */
  getCount(): number {
    return this.items.length;
  }

  /**
   * Check if inventory is full
   */
  isFull(): boolean {
    return this.items.length >= this.maxItems;
  }
}

export default InventoryService;

