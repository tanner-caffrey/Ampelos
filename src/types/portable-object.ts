/**
 * Portable Object Types
 *
 * Unified data model for objects that can exist in both
 * agent inventory and spatial worlds.
 */

import type { AgentId } from './agent.js';

/**
 * Spatial data for objects placed in worlds
 */
export interface SpatialData {
  location: string;
  position: string;
  container: string | null;
  visible: boolean;
}

/**
 * Journal entry within a journal-type object
 */
export interface JournalEntry {
  id: string;
  content: string;
  author_agent?: AgentId;
  created_at: string;
  updated_at: string;
}

/**
 * Journal data payload for journal-type objects
 */
export interface JournalPayload {
  title: string;
  entries: JournalEntry[];
}

/**
 * Unified portable object that can exist in inventory or world
 *
 * Key principle: An object exists in exactly ONE state:
 * - In Inventory: `spatial` is undefined
 * - In World: `spatial` is defined
 *
 * The ID is preserved across inventory↔world transitions.
 */
export interface PortableObject {
  // Identity
  id: string;
  name: string;
  description?: string;
  type: string; // "journal", "tool", "furniture", "clothing", etc.

  // Appearance & Properties
  descriptors: Record<string, string>;
  properties: Record<string, unknown>;

  // Inventory-specific (only relevant when in inventory)
  equipped_slot?: string;
  show_in_memory: boolean;

  // Spatial-specific (only present when in world)
  spatial?: SpatialData;

  // Journal payload (only for type: "journal")
  journal_data?: JournalPayload;

  // Metadata
  created_at: string;
  updated_at: string;
  origin_agent?: AgentId;
}

/**
 * Location state for a portable object
 */
export type ObjectLocationState =
  | { type: 'inventory'; agentId: AgentId }
  | { type: 'world'; worldId: string; location: string }
  | { type: 'container'; worldId: string; containerId: string };

/**
 * Result type for place/pickup operations
 */
export interface PlacePickupResult {
  success: boolean;
  message: string;
  object?: PortableObject;
}

/**
 * Generate a unique ID for a portable object
 */
export function generatePortableObjectId(type: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${type}_${timestamp}_${random}`;
}

/**
 * Check if an object is a journal
 */
export function isJournal(obj: PortableObject): boolean {
  return obj.type === 'journal' && obj.journal_data !== undefined;
}

/**
 * Check if an object is in a world (has spatial data)
 */
export function isInWorld(obj: PortableObject): boolean {
  return obj.spatial !== undefined;
}

/**
 * Check if an object is in inventory (no spatial data)
 */
export function isInInventory(obj: PortableObject): boolean {
  return obj.spatial === undefined;
}
