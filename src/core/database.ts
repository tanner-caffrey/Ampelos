/**
 * Database layer - SQLite for persistent storage
 *
 * This is the unified data layer for Ampelos. All data lives here:
 * - Agent definitions and configurations
 * - Service runtime state
 * - Global shared state
 * - Templates and tool attachments
 *
 * Replaces the old LowDB + config file dual-storage approach.
 */

// Re-export SQLiteDatabase as Database
export { SQLiteDatabase as Database } from './sqlite-database.js';
export type {
  SQLiteDatabaseOptions,
  AgentRow,
  AgentModuleRow,
  LettaConfigRow,
  LettaStateRow,
  AgentTemplateRow,
  ToolAttachmentRow,
  TemplateCacheRow,
  CreateAgentInput,
  UpdateAgentInput,
} from './sqlite-database.js';

// ============================================================
// Legacy Types (for migration from old JSON format)
// ============================================================

import type {
  AgentDefinition,
  AgentTemplate,
  TemplateInfo,
} from '../types/config.js';

/**
 * @deprecated Legacy schema version constant
 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * @deprecated Legacy template cache data structure
 */
export interface TemplateCacheData {
  memory_blocks: TemplateInfo[];
  system_prompts: TemplateInfo[];
  last_refresh: string;
}

/**
 * @deprecated Legacy tool attachment record
 */
export interface ToolAttachment {
  tool_id: string;
  module_name: string;
  tool_name: string;
  is_letta_tool: boolean;
  attached_at: string;
}

/**
 * @deprecated Legacy database schema (for reading old JSON files during migration)
 */
export interface LegacyDatabaseSchema {
  schema_version?: number;
  agents: Record<string, AgentDefinition>;
  state: Record<string, Record<string, unknown>>;
  configs?: Record<string, Record<string, Record<string, unknown>>>;
  global?: Record<string, unknown>;
  agent_templates?: Record<string, AgentTemplate>;
  template_cache?: TemplateCacheData;
  tool_attachments?: Record<string, ToolAttachment[]>;
}

// Keep DatabaseSchema as alias for backward compatibility during transition
export type DatabaseSchema = LegacyDatabaseSchema;
