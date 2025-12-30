/**
 * Configuration type definitions for Ampelos
 */

// =============================================================================
// Agent Definition Types (Simplified - configs not stored)
// =============================================================================

/**
 * Agent definition stored in the database.
 * Note: modules field removed - all modules are now available to all agents.
 * Per-agent module configs are stored separately in agent_module_configs table.
 */
export interface AgentDefinition {
  /**
   * Unique agent identifier (e.g., "agent-toula")
   */
  id: string;

  /**
   * Human-readable display name
   */
  name: string;

  /**
   * Whether this agent is enabled
   */
  enabled: boolean;

  /**
   * When the agent was created
   */
  created_at: string;

  /**
   * When the agent was last updated
   */
  updated_at: string;
}

/**
 * Module configuration passed at agent creation or module init
 * This is ephemeral - used once, then discarded
 */
export interface ModuleInitConfig {
  /**
   * Module-specific configuration
   * Structure depends on the module
   */
  [key: string]: unknown;
}

/**
 * Request body for creating an agent.
 * Note: All modules are available to all agents - moduleConfigs is optional
 * and only used to set per-agent overrides at creation time.
 */
export interface CreateAgentRequest {
  /**
   * Agent ID
   */
  id: string;

  /**
   * Display name
   */
  name: string;

  /**
   * Optional per-agent module config overrides.
   * All modules are available without config - this is for customization only.
   */
  moduleConfigs?: Record<string, ModuleInitConfig>;

  /**
   * Whether agent is enabled (default: true)
   */
  enabled?: boolean;
}

/**
 * Request body for setting module config for an agent.
 * All modules are available - this just sets per-agent config overrides.
 */
export interface SetModuleConfigRequest {
  /**
   * Module configuration override for this agent
   */
  config: ModuleInitConfig;
}

/**
 * @deprecated Use SetModuleConfigRequest instead
 */
export type AddModuleRequest = SetModuleConfigRequest;

// =============================================================================
// Template Types
// =============================================================================

/**
 * Template info for discovered file-based templates
 */
export interface TemplateInfo {
  name: string;
  category: 'memory_blocks' | 'system_prompts';
  path: string;
  variables: string[]; // Detected {{variables}} in template
}

/**
 * Cached template data structure
 */
export interface TemplateCacheData {
  memory_blocks: TemplateInfo[];
  system_prompts: TemplateInfo[];
  cached_at: string;
}

/**
 * Template variable definition for agent templates
 */
export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'select';
  description: string;
  required: boolean;
  default?: unknown;
  options?: string[]; // For 'select' type
  path: string; // JSON path where to inject value
}

/**
 * Agent template for quick agent creation
 */
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  modules: Record<string, ModuleInitConfig>;
  variables: TemplateVariable[];
  created_at: string;
}

// =============================================================================
// Server Config
// =============================================================================

/**
 * Server-wide configuration
 */
export interface ServerConfig {
  /**
   * Path to the database file
   * Default: storage/ampelos.db.json
   */
  database_path?: string;

  /**
   * Logging configuration
   */
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
  };

  /**
   * Additional server-specific options
   */
  [key: string]: unknown;
}

// =============================================================================
// DEPRECATED Legacy Types (for migration reference only)
// =============================================================================

/**
 * @deprecated Legacy module config entry - use ModuleInitConfig instead
 */
export interface ModuleConfigEntry {
  enabled: boolean;
  lazy: boolean;
  config: Record<string, unknown>;
}

/**
 * @deprecated Legacy module config
 */
export interface ModuleConfig {
  config_file?: string;
  auto_initialize?: boolean;
  [key: string]: unknown;
}

/**
 * @deprecated Legacy agent config
 */
export interface AgentConfig {
  name: string;
  enabled: boolean;
  modules: Record<string, ModuleConfig>;
}

/**
 * @deprecated Legacy root config
 */
export interface AgentsConfig {
  agents: Record<string, AgentConfig>;
}
