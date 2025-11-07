/**
 * Service type definitions for Ampelos
 */

import type { AgentId, AgentMetadata } from './agent.js';

/**
 * Scoped database interface for service state access
 * Provides read/write access to a specific agent's service state
 */
export interface ScopedDatabase {
  /**
   * Read the current state
   */
  read<T = unknown>(): Promise<T>;
  
  /**
   * Update the state using a mutator function
   * @param updater Function that receives current state and returns new state
   */
  update<T = unknown>(updater: (state: T) => T | Promise<T>): Promise<T>;
  
  /**
   * Write state directly (replaces entire state)
   */
  write<T = unknown>(state: T): Promise<void>;
  
  /**
   * Get the path this database is scoped to
   */
  getPath(): string;
}

/**
 * Service context provided to services during initialization and operation
 */
export interface ServiceContext {
  /**
   * Get scoped database access for this service
   * Path: states.{agentId}.{serviceName}
   */
  getDB(): ScopedDatabase;
  
  /**
   * Access another service for this agent
   * @param serviceName Name of the service to access
   * @returns The service instance, or throws if not found/initialized
   */
  getService(serviceName: string): BaseService;
  
  /**
   * Get current agent metadata
   */
  getAgentMetadata(): AgentMetadata;
  
  /**
   * Get the agent ID for this context
   */
  getAgentId(): AgentId;
}

/**
 * Base interface that all services must implement
 */
export interface BaseService {
  /**
   * Initialize service for a specific agent
   * 
   * @param agentId - Letta agent identifier
   * @param config - Validated configuration object
   * @param context - Service context (database access, other services)
   */
  init(agentId: AgentId, config: Record<string, unknown>, context: ServiceContext): Promise<void>;
  
  /**
   * Handle configuration changes at runtime
   * 
   * Called when config is hot-reloaded. Service should reconcile
   * any state changes needed (e.g., connection string changed,
   * limits adjusted, features enabled/disabled).
   * 
   * @param oldConfig - Previous configuration
   * @param newConfig - New validated configuration
   */
  onConfigChange?(oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>): Promise<void>;
  
  /**
   * Return current service state for persistence
   * 
   * @returns Object representing complete service state
   */
  getState?(): Promise<Record<string, unknown>>;
  
  /**
   * Restore service state from persistence
   * 
   * @param state - Previously saved state object
   */
  setState?(state: Record<string, unknown>): Promise<void>;
  
  /**
   * Optional cleanup on service shutdown
   * 
   * Release resources, close connections, etc.
   */
  cleanup?(): Promise<void>;
  
  /**
   * Optional: Declare service dependencies
   * 
   * @returns Array of service names this service depends on
   */
  dependsOn?(): string[];
}

