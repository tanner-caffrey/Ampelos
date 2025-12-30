/**
 * Types for Body and Inventory Module
 */

import { z } from 'zod';

// ===== Body Types =====

export interface BodyPart {
  name: string;
  descriptors: Record<string, string>; // e.g., { color: "brown", length: "long" }
  states: string[]; // e.g., ["cleaned", "injured"]
}

export interface BodyState {
  parts: Record<string, BodyPart>; // keyed by part name
}

// ===== Inventory Types =====

export interface JournalEntry {
  id: string;
  content: string;
  author_agent?: string;
  created_at: string;
  updated_at: string;
}

export interface JournalPayload {
  title: string;
  entries: JournalEntry[];
}

export interface InventoryItem {
  id: string; // unique identifier
  name: string;
  description?: string;
  type?: string; // e.g., "journal", "weapon", "tool"
  descriptors: Record<string, string>; // e.g., { material: "leather", color: "brown" }
  properties: Record<string, any>; // e.g., { durability: 100, weight: 2.5 }
  equipped_slot?: string; // e.g., "head", "hands", null if not equipped
  show_in_memory: boolean; // whether to include in memory block summary
  journal_data?: JournalPayload; // only for type: "journal"
  created_at?: string;
  updated_at?: string;
  origin_agent?: string; // which agent created/originated this item
}

export interface InventoryState {
  items: Record<string, InventoryItem>; // keyed by item id
}

// ===== Combined Module State =====

export interface BodyAndInventoryState {
  body: BodyState;
  inventory: InventoryState;
  letta_memory_block_created: boolean;
}

// ===== Configuration Schema =====

export const ConfigSchema = z.object({
  default_body_parts: z.record(
    z.object({
      descriptors: z.record(z.string()).optional().default({})
    })
  ).optional().default({
    head: { descriptors: {} },
    face: { descriptors: {} },
    eyes: { descriptors: {} },
    hair: { descriptors: {} },
    torso: { descriptors: {} },
    arms: { descriptors: {} },
    hands: { descriptors: {} },
    legs: { descriptors: {} },
    feet: { descriptors: {} }
  }),
  max_inventory_items: z.number().min(1).max(1000).optional().default(100)
});

export type BodyAndInventoryConfig = z.infer<typeof ConfigSchema>;

// ===== Tool Action Types =====

export type BodyAction =
  | 'create_part'
  | 'create_parts_bulk'
  | 'add_descriptor'
  | 'remove_descriptor'
  | 'add_state'
  | 'remove_state'
  | 'get_part'
  | 'list_parts';

export type InventoryAction =
  | 'add_item'
  | 'add_items_bulk'
  | 'remove_item'
  | 'equip_item'
  | 'unequip_item'
  | 'modify_item'
  | 'get_item'
  | 'list_items'
  | 'mark_for_memory'
  | 'unmark_for_memory';
