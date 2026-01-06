/**
 * Admin Dashboard type definitions
 * Mirrors backend API types from src/core/api/types.ts
 *
 * New architecture:
 * - Agent definitions store only id, name, enabled, module list
 * - Module configs are passed at creation time
 * - Module state is stored separately
 */

// =============================================================================
// Module Types
// =============================================================================

export interface ModuleInitConfig {
  [key: string]: unknown;
}

// =============================================================================
// Agent Types
// =============================================================================

export interface AgentDefinition {
  id: string;
  name: string;
  enabled: boolean;
  modules: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateAgentRequest {
  id: string;
  name: string;
  enabled?: boolean;
  modules?: string[];
  module_configs?: Record<string, ModuleInitConfig>;
}

export interface CreateAgentFromTemplateRequest {
  template: string;
  variables: {
    agent_id: string;
    agent_name: string;
    [key: string]: unknown;
  };
}

export interface UpdateAgentRequest {
  name?: string;
  enabled?: boolean;
}

// =============================================================================
// Module Types
// =============================================================================

export interface AvailableModule {
  name: string;
  version: string;
  description?: string;
  provides: ('tool' | 'service')[];
  dependencies?: string[];
  configSchema?: Record<string, unknown>;
}

// =============================================================================
// Template Types
// =============================================================================

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'select';
  description: string;
  required: boolean;
  default?: unknown;
  options?: string[];
  path: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  modules: Record<string, ModuleInitConfig>;
  variables: TemplateVariable[];
  created_at: string;
}

export interface TemplateInfo {
  name: string;
  category: 'memory_blocks' | 'system_prompts';
  path: string;
  variables: string[];
}

export interface CreateAgentTemplateRequest {
  id: string;
  name: string;
  description: string;
  modules: Record<string, ModuleInitConfig>;
  variables: TemplateVariable[];
}

// =============================================================================
// Memory Block Types
// =============================================================================

export interface MemoryBlockDetail {
  id: string;
  label: string;
  value: string;
  limit: number;
}

export interface CreateMemoryBlockRequest {
  label: string;
  value: string;
  limit?: number;
}

// =============================================================================
// Health Types
// =============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  schemaVersion: number;
  agents: {
    total: number;
    enabled: number;
  };
}

// =============================================================================
// API Response Types
// =============================================================================

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
