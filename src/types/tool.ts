/**
 * Tool type definitions for Ampelos
 */

import type { AgentId, AgentMetadata } from './agent.js';
import type { BaseService } from './service.js';
import type { AgentStore } from '../core/agent-store.js';
import type { ServiceManager } from '../core/service-manager.js';
import type { AgentRegistry } from '../core/agent-registry.js';
import type { ModuleLoader } from '../core/module-loader.js';
import type { LettaManager } from '../core/letta/index.js';

/**
 * MCP tool result content item
 */
export interface ToolResultContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

/**
 * Result returned by a tool handler
 */
export interface ToolResult {
  content: ToolResultContent[];
  isError?: boolean;
}

/**
 * Context provided to tool handlers
 *
 * With singleton services, the context provides:
 * - The agentId for this tool call
 * - Access to service singletons (tool passes agentId to service methods)
 * - Agent metadata lookup
 */
export interface ToolContext {
  /**
   * The agent ID making this tool call
   */
  agentId: AgentId;

  /**
   * Get metadata for the current agent
   */
  getAgentMetadata(): AgentMetadata;

  /**
   * Get metadata for any agent
   * @param agentId - The agent to get metadata for
   */
  getAgentMetadataFor(agentId: AgentId): AgentMetadata | null;

  /**
   * Access a service singleton
   * @param serviceName Name of the service to access
   * @returns The service instance (singleton)
   */
  getService<T extends BaseService = BaseService>(serviceName: string): T;

  /**
   * Check if a service is available
   * @param serviceName Name of the service to check
   */
  hasService(serviceName: string): boolean;

  /**
   * Check if an agent has been initialized with a service
   * @param agentId - The agent to check
   * @param serviceName - Name of the service
   */
  isAgentInitialized(agentId: AgentId, serviceName: string): boolean;

  /**
   * Get the LettaManager instance for Letta operations
   * This is the primary way to access Letta functionality
   */
  getLettaManager?(): LettaManager | undefined;
}

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  params: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolResult>;

/**
 * Tool definition
 */
export interface ToolDefinition {
  /**
   * Tool name (must be unique across all modules)
   */
  name: string;

  /**
   * Tool description
   */
  description: string;

  /**
   * JSON Schema for tool input parameters
   */
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };

  /**
   * Handler function for this tool
   */
  handler: ToolHandler;

  /**
   * If true, this tool can be called without an agent context.
   * Global tools receive a GlobalToolContext instead of ToolContext.
   * Used for admin/bootstrap operations like agent registration.
   */
  global?: boolean;
}

/**
 * Handler function signature for global tools
 */
export type GlobalToolHandler = (
  params: Record<string, unknown>,
  context: GlobalToolContext
) => Promise<ToolResult>;

/**
 * Context provided to global tool handlers.
 * Global tools operate without an agent context and have access to
 * core system components for admin/bootstrap operations.
 */
export interface GlobalToolContext {
  /**
   * Access the agent store for CRUD operations on agents
   */
  getAgentStore(): AgentStore;

  /**
   * Access the service manager for initializing agent services
   */
  getServiceManager(): ServiceManager;

  /**
   * Access the agent registry for cache operations
   */
  getAgentRegistry(): AgentRegistry;

  /**
   * Access the module loader to get loaded modules
   */
  getModuleLoader(): ModuleLoader;

  /**
   * Access a service singleton
   * @param serviceName Name of the service to access
   * @returns The service instance (singleton)
   */
  getService<T extends BaseService = BaseService>(serviceName: string): T;

  /**
   * Get the LettaManager instance for Letta operations
   * This is the primary way to access Letta functionality
   */
  getLettaManager?(): LettaManager | undefined;
}

/**
 * Letta tool definition - Python tools that run on the Letta server
 *
 * These tools are created on the Letta server and attached to Letta agents.
 * They run in Letta's Python sandbox, NOT in Ampelos.
 *
 * The source_code should be a Python function with a Google-style docstring
 * that describes the function's arguments and return value.
 *
 * Example:
 * ```python
 * def get_weather(location: str) -> str:
 *     \"\"\"Get the current weather for a location.
 *
 *     Args:
 *         location (str): The city and state, e.g. "San Francisco, CA"
 *
 *     Returns:
 *         str: A description of the current weather
 *     \"\"\"
 *     # Implementation here
 *     return f"The weather in {location} is sunny"
 * ```
 */
export interface LettaToolDefinition {
  /**
   * Tool name - must be unique. If not provided, derived from function name.
   */
  name?: string;

  /**
   * Python source code for the tool.
   * Must be a function with a Google-style docstring.
   * The last function in the source becomes the tool.
   */
  source_code: string;

  /**
   * Optional description override (normally parsed from docstring)
   */
  description?: string;

  /**
   * Optional tags for categorization
   */
  tags?: string[];
}

