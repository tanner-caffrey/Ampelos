/**
 * Module type definitions for Ampelos
 */

import type { BaseService } from './service.js';
import type { ToolDefinition, LettaToolDefinition } from './tool.js';

/**
 * Module capabilities - what a module provides
 */
export type ModuleCapability = 'tool' | 'service';

/**
 * JSON Schema type for configuration validation
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  default?: unknown;
  [key: string]: unknown;
}

/**
 * Module manifest structure
 */
export interface ModuleManifest {
  /**
   * Module identifier (must be unique)
   */
  name: string;
  
  /**
   * Semantic version
   */
  version: string;
  
  /**
   * What this module provides: 'tool', 'service', or both
   */
  provides: ModuleCapability[];
  
  /**
   * Array of other service names this module depends on
   */
  dependencies?: string[];
  
  /**
   * JSON Schema for validating module configuration
   */
  config_schema?: JSONSchema;
  
  /**
   * If false, tool won't be advertised to Letta
   * Default: true
   */
  advertise?: boolean;
  
  /**
   * Optional description of the module
   */
  description?: string;
}

/**
 * Factory function that creates a service instance
 */
export type ServiceFactory = () => BaseService;

/**
 * Loaded module metadata
 */
export interface LoadedModule {
  /**
   * Module manifest
   */
  manifest: ModuleManifest;
  
  /**
   * Path to the module directory
   */
  path: string;
  
  /**
   * Factory function to create service instances (if module provides service)
   */
  serviceFactory?: ServiceFactory;
  
  /**
   * MCP tool definitions (if module provides tools)
   * These are handled by Ampelos via the MCP protocol
   */
  tools?: ToolDefinition[];

  /**
   * Letta tool definitions (Python tools that run on Letta server)
   * These are created on the Letta server and attached to Letta agents
   */
  lettaTools?: LettaToolDefinition[];

  /**
   * Whether the module was successfully loaded
   */
  loaded: boolean;
  
  /**
   * Error message if loading failed
   */
  error?: string;
}

