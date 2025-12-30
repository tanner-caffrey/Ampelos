/**
 * Admin API type definitions
 */

import type { AgentDefinition, ModuleInitConfig, AgentTemplate, TemplateInfo } from '../../types/config.js';

// =============================================================================
// Common Types
// =============================================================================

/**
 * Standard API response envelope
 */
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  offset?: number;
  limit?: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

// =============================================================================
// Agent Types
// =============================================================================

/**
 * Request to create a new agent
 */
export interface CreateAgentRequest {
  id: string;
  name: string;
  enabled?: boolean;
  modules?: string[];
  module_configs?: Record<string, ModuleInitConfig>;
}

/**
 * Request to create agent from template
 */
export interface CreateAgentFromTemplateRequest {
  template: string;
  variables: {
    agent_id: string;
    agent_name: string;
    [key: string]: unknown;
  };
}

/**
 * Request to update an agent
 */
export interface UpdateAgentRequest {
  name?: string;
  enabled?: boolean;
}

/**
 * Agent list response
 */
export interface AgentListResponse {
  agents: AgentDefinition[];
}

/**
 * Agent detail response
 */
export interface AgentDetailResponse {
  agent: AgentDefinition;
}

// =============================================================================
// Module Types
// =============================================================================

/**
 * Request to add a module
 */
export interface AddModuleRequest {
  enabled?: boolean;
  lazy?: boolean;
  config?: Record<string, unknown>;
}

/**
 * Request to update a module
 */
export interface UpdateModuleRequest {
  enabled?: boolean;
  lazy?: boolean;
  config?: Record<string, unknown>;
}

/**
 * Module list response
 */
export interface ModuleListResponse {
  modules: string[];
}

/**
 * Available module info (from loaded modules)
 */
export interface AvailableModuleInfo {
  name: string;
  version: string;
  description?: string;
  provides: ('tool' | 'service')[];
  dependencies?: string[];
  configSchema?: Record<string, unknown>;
}

/**
 * Available modules response
 */
export interface AvailableModulesResponse {
  modules: AvailableModuleInfo[];
}

// =============================================================================
// Template Types
// =============================================================================

/**
 * Memory block templates response
 */
export interface MemoryBlockTemplatesResponse {
  templates: TemplateInfo[];
}

/**
 * System prompt templates response
 */
export interface SystemPromptTemplatesResponse {
  templates: TemplateInfo[];
}

/**
 * Agent templates response
 */
export interface AgentTemplatesResponse {
  templates: AgentTemplate[];
}

/**
 * Request to create an agent template
 */
export interface CreateAgentTemplateRequest {
  id: string;
  name: string;
  description: string;
  modules: Record<string, ModuleInitConfig>;
  variables: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'select';
    description: string;
    required: boolean;
    default?: unknown;
    options?: string[];
    path: string;
  }>;
}

// =============================================================================
// Health Types
// =============================================================================

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  schemaVersion: number;
  agents: {
    total: number;
    enabled: number;
  };
}
