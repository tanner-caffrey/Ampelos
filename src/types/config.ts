/**
 * Configuration type definitions for Ampelos
 */

/**
 * Configuration for a single module within an agent
 */
export interface ModuleConfig {
  /**
   * Path to external configuration file (optional)
   * If provided, this file will be loaded and merged with inline config
   */
  config_file?: string;
  
  /**
   * Whether to auto-initialize service if not already initialized
   * Default: false (explicit error if service not initialized)
   */
  auto_initialize?: boolean;
  
  /**
   * Module-specific configuration options
   * These are validated against the module's config_schema
   */
  [key: string]: unknown;
}

/**
 * Configuration for a single agent
 */
export interface AgentConfig {
  /**
   * Human-readable display name for the agent
   * NOT used for data access - agent_id is the primary key
   */
  name: string;
  
  /**
   * Whether this agent is enabled
   * Disabled agents' tools are not advertised and services are not initialized
   */
  enabled: boolean;
  
  /**
   * Module configurations keyed by module name
   */
  modules: Record<string, ModuleConfig>;
}

/**
 * Root agent configuration structure
 */
export interface AgentsConfig {
  agents: Record<string, AgentConfig>;
}

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
   * Path to agents configuration file
   * Default: configs/agents.json
   */
  agents_config_path?: string;
  
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

