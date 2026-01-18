/**
 * Service type definitions for Ampelos
 *
 * Services are SINGLETONS - one instance per service type, shared across all agents.
 * Agent-specific state is stored in the database and accessed via StateManager.
 * Methods that need agent context receive agentId as a parameter.
 */

import type { AgentId, AgentMetadata } from './agent.js';
import type { ReactiveState } from '../core/state-manager.js';
import type { LettaToolDefinition } from './tool.js';
import type { LettaManager } from '../core/letta/index.js';
import type { Database } from '../core/database.js';

/**
 * Service context provided to services during initialization
 *
 * This is now a GLOBAL context (not per-agent) that provides access to:
 * - State management (per-agent state via agentId parameter)
 * - Other services (singletons)
 * - Agent registry for metadata lookup
 */
export interface ServiceContext {
  /**
   * Get auto-persisting reactive state for a specific agent and service
   * @param agentId - The agent to get state for
   * @param serviceName - The service name (for state namespacing)
   */
  getState<T>(agentId: AgentId, serviceName: string): ReactiveState<T>;

  /**
   * Get auto-persisting reactive state for global/shared data
   * Use for data shared across agents (e.g., spatial worlds)
   * @param namespace Namespace for the global data
   */
  getGlobalState<T>(namespace: string): ReactiveState<T>;

  /**
   * Access another service (singleton)
   * @param serviceName Name of the service to access
   * @returns The service instance, or throws if not found
   */
  getService(serviceName: string): BaseService;

  /**
   * Get metadata for an agent
   * @param agentId - The agent to get metadata for
   */
  getAgentMetadata(agentId: AgentId): AgentMetadata;

  /**
   * Get all enabled agent IDs
   */
  getEnabledAgentIds(): AgentId[];

  /**
   * Register a Letta agent ID mapping with the MCP server
   * @param lettaAgentId - The Letta agent ID
   * @param ampelosAgentId - The Ampelos agent ID
   */
  registerLettaAgent?(lettaAgentId: string, ampelosAgentId: AgentId): void;

  /**
   * Get all Letta tool definitions from modules assigned to an agent
   * @param agentId - The agent to get tools for
   * @returns Array of Letta tool definitions from all agent modules
   */
  getLettaTools?(agentId: AgentId): LettaToolDefinition[];

  /**
   * Get the LettaManager instance for Letta operations
   * This is the primary way to access Letta functionality
   */
  getLettaManager(): LettaManager;

  /**
   * Get the database instance for direct database operations
   * Use sparingly - prefer getState() for most service state
   */
  getDatabase(): Database;
}

/**
 * Base interface that all services must implement
 *
 * Services are SINGLETONS initialized once at startup.
 * Agent-specific operations receive agentId as parameter.
 */
export interface BaseService {
  /**
   * Initialize the service (called once at startup)
   *
   * This is for global initialization only - NOT per-agent setup.
   * Per-agent initialization happens in initAgent().
   *
   * @param context - Global service context
   */
  init(context: ServiceContext): Promise<void>;

  /**
   * Initialize service state for a specific agent
   *
   * Called when an agent is first set up or needs reconnection.
   *
   * Scenarios:
   * 1. First-time: config provided, no state → create resources, save state
   * 2. Reconnect: no config, state exists → reconnect using state
   * 3. Reconfigure: config provided, state exists → update/recreate
   *
   * @param agentId - Agent identifier
   * @param config - Module config (may be empty {} on reconnect)
   */
  initAgent(agentId: AgentId, config: Record<string, unknown>): Promise<void>;

  /**
   * Check if service can initialize an agent without config
   * Returns true if state exists and is sufficient for reconnect
   *
   * @param agentId - Agent to check
   * @param state - Current state from database
   */
  canReconnect?(agentId: AgentId, state: Record<string, unknown>): boolean;

  /**
   * Handle configuration changes at runtime for an agent
   *
   * @param agentId - Agent being reconfigured
   * @param oldConfig - Previous configuration
   * @param newConfig - New validated configuration
   */
  onConfigChange?(agentId: AgentId, oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>): Promise<void>;

  /**
   * Clean up resources for a specific agent
   *
   * @param agentId - Agent to clean up
   */
  cleanupAgent?(agentId: AgentId): Promise<void>;

  /**
   * Optional cleanup on service shutdown (global)
   */
  cleanup?(): Promise<void>;

  /**
   * Optional: Declare service dependencies
   * @returns Array of service names this service depends on
   */
  dependsOn?(): string[];

  /**
   * Called after ALL services have completed initAgent() and server is listening.
   * Use for deferred work that may trigger agent responses (e.g., firing missed schedules).
   *
   * This hook solves the startup race condition where services call agent tools
   * during initAgent() before other services have finished initializing.
   *
   * @param agentId - Agent identifier
   */
  onStartupComplete?(agentId: AgentId): Promise<void>;
}
