/**
 * Agent type definitions for Ampelos
 * 
 * Critical: agent_id is the primary key for all operations.
 * agent_name is for display/logging only and MUST NOT be used for data access.
 */

/**
 * Branded type for agent_id to prevent mixing with agent_name
 */
export type AgentId = string & { readonly __brand: 'AgentId' };

/**
 * Branded type for agent_name to prevent mixing with agent_id
 */
export type AgentName = string & { readonly __brand: 'AgentName' };

/**
 * Helper function to create a validated AgentId
 */
export function createAgentId(id: string): AgentId {
  if (!id || typeof id !== 'string') {
    throw new Error('agent_id must be a non-empty string');
  }
  return id as AgentId;
}

/**
 * Helper function to create a validated AgentName
 */
export function createAgentName(name: string): AgentName {
  if (!name || typeof name !== 'string') {
    throw new Error('agent_name must be a non-empty string');
  }
  return name as AgentName;
}

/**
 * Agent identity - enforces distinction between id and name
 */
export interface AgentIdentity {
  /**
   * Unique identifier from Letta (primary key for all operations)
   * MUST be used for all data access and state management
   */
  agent_id: AgentId;
  
  /**
   * Human-readable display name
   * Used for logging and display only - NOT for data access
   */
  agent_name: AgentName;
}

/**
 * Agent metadata tracked by the system
 */
export interface AgentMetadata {
  /**
   * Unique identifier from Letta
   */
  agent_id: AgentId;
  
  /**
   * Human-readable display name
   */
  agent_name: AgentName;
  
  /**
   * Whether the agent is currently enabled
   */
  enabled: boolean;
  
  /**
   * Timestamp of last request from this agent
   */
  last_request_time?: Date;
  
  /**
   * Timestamp of last response to this agent
   */
  last_response_time?: Date;
  
  /**
   * List of module names configured for this agent
   */
  modules: string[];
  
  /**
   * Additional statistics and metadata
   */
  stats?: {
    total_requests?: number;
    total_errors?: number;
    [key: string]: unknown;
  };
}

