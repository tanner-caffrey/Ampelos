/**
 * Types for Spatial Module
 *
 * Defines spatial awareness and embodiment for agents in digital spaces.
 */

import { z } from 'zod';
import type { AgentId } from '../../types/agent.js';

// ===== Core Spatial Types =====

/**
 * A location in the world
 */
export interface Location {
  description: string; // 1-3 sentence description
  connections: string[]; // Adjacent location names
  part_of?: string; // Parent container (optional)
}

/**
 * An object in the world
 */
export interface SpatialObject {
  type: string; // Object type (furniture, item, etc.)
  name: string; // Display name
  location: string; // Location name where object exists
  container: string | null; // If inside another object, its ID (null = in room)
  position: string; // Descriptive position ("on the bed", "against the wall")
  visible: boolean; // Is object visible in location listing?
  state: Record<string, any>; // Freeform state data
}

/**
 * Agent position in world
 */
export interface AgentPosition {
  location: string; // Location name
  position: string; // Descriptive position in location
}

/**
 * World definition
 */
export interface World {
  name: string; // Display name
  description: string; // Brief description
  default_location: string; // Where agents spawn
  locations: Record<string, Location>; // Location definitions
  objects: Record<string, SpatialObject>; // Objects in world (keyed by ID)
  agents: Record<string, AgentPosition>; // Agent positions (keyed by agent ID)
}

/**
 * Module state (persisted globally across all agents)
 */
export interface SpatialState {
  worlds: Record<string, World>; // All worlds (keyed by world ID)
}

/**
 * Per-agent state (stored in agent's DB)
 */
export interface AgentSpatialState {
  world_id: string; // Which world agent is in
  current_location: string; // Current location name
  current_position: string; // Current position in location
}

// ===== Configuration Schema =====

const LocationSchema = z.object({
  description: z.string(),
  connections: z.array(z.string()).optional().default([]),
  part_of: z.string().optional()
});

const WorldSchema = z.object({
  name: z.string(),
  description: z.string(),
  default_location: z.string(),
  locations: z.record(LocationSchema)
});

export const ConfigSchema = z.object({
  worlds: z.record(WorldSchema).optional().default({
    void: {
      name: 'The Void',
      description: 'An empty space, waiting to be shaped',
      default_location: 'void',
      locations: {
        void: {
          description: 'An empty expanse of digital nothingness, full of potential',
          connections: []
        }
      }
    }
  })
});

export type SpatialConfig = z.infer<typeof ConfigSchema>;

// ===== Tool Action Types =====

export type SpatialAction =
  | 'look'
  | 'move'
  | 'locate'
  | 'create_location'
  | 'modify_location'
  | 'remove_location'
  | 'switch_world'
  | 'list_locations';

export type InteractAction =
  | 'examine'
  | 'modify'
  | 'move'
  | 'create'
  | 'remove'
  | 'pickup'
  | 'drop';

// ===== Tool Parameter Types =====

export interface LocationCreate {
  name: string;
  description: string;
  parent?: string;
  connections?: string[];
}

export interface LocationModify {
  location: string;
  description?: string;
  add_connections?: string[];
  remove_connections?: string[];
}

export interface ObjectCreate {
  type: string;
  name: string;
  location: string;
  container?: string | null;
  position?: string;
  visible?: boolean;
  state?: Record<string, any>;
}

export interface ObjectModify {
  object: string;
  state?: Record<string, any>;
  visible?: boolean;
  container?: string | null;
  position?: string;
}

export interface ObjectMove {
  object: string;
  to_location?: string;
  to_container?: string | null;
  position?: string;
}

// ===== Helper Types =====

export interface LocationPerception {
  location: string;
  position: string;
  description: string;
  visible_objects: string[];
  present: string[]; // Agent IDs present
  adjacent: string[];
}
