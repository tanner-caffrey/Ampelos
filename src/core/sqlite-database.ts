/**
 * SQLite Database - Core database layer for Ampelos
 *
 * Replaces LowDB with SQLite for:
 * - ACID transactions
 * - Better query capabilities
 * - Schema enforcement
 * - Single source of truth (no more config file duplication)
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { createComponentLogger } from './logger.js';

const log = createComponentLogger('SQLite');

export interface SQLiteDatabaseOptions {
  path?: string;
  verbose?: boolean;
}

const SCHEMA_VERSION = 2;

/**
 * SQL schema for Ampelos database
 */
const SCHEMA_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_info (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ============================================================
-- CORE TABLES (Typed, Normalized)
-- ============================================================

-- Agent definitions (single source of truth)
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Agent-module relationships (which modules an agent uses)
CREATE TABLE IF NOT EXISTS agent_modules (
    agent_id TEXT NOT NULL,
    module_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    lazy INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL,
    PRIMARY KEY (agent_id, module_name),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Letta configuration per agent
CREATE TABLE IF NOT EXISTS agent_letta_configs (
    agent_id TEXT PRIMARY KEY,
    model TEXT,
    embedding TEXT,
    enable_sleeptime INTEGER NOT NULL DEFAULT 1,
    system_prompt_template TEXT,
    memory_blocks TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Module configuration per agent-module pair
CREATE TABLE IF NOT EXISTS agent_module_configs (
    agent_id TEXT NOT NULL,
    module_name TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (agent_id, module_name),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- ============================================================
-- STATE TABLES
-- ============================================================

-- Letta state per agent (frequently queried, simple structure)
CREATE TABLE IF NOT EXISTS letta_state (
    agent_id TEXT PRIMARY KEY,
    letta_agent_id TEXT,
    backend TEXT CHECK (backend IN ('cloud', 'self-hosted')),
    initialized INTEGER NOT NULL DEFAULT 0,
    created_at TEXT,
    attached_agent_blocks TEXT DEFAULT '{}',
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Per-agent service state (JSON blob per module)
CREATE TABLE IF NOT EXISTS agent_service_state (
    agent_id TEXT NOT NULL,
    module_name TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (agent_id, module_name),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Global shared state (for cross-agent data like spatial worlds)
CREATE TABLE IF NOT EXISTS global_state (
    namespace TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
);

-- ============================================================
-- SUPPORTING TABLES
-- ============================================================

-- Agent templates for quick creation
CREATE TABLE IF NOT EXISTS agent_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    modules TEXT NOT NULL DEFAULT '{}',
    variables TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
);

-- Template cache (memory blocks and system prompts from filesystem)
CREATE TABLE IF NOT EXISTS template_cache (
    category TEXT NOT NULL CHECK (category IN ('memory_blocks', 'system_prompts')),
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    variables TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (category, name)
);

CREATE TABLE IF NOT EXISTS template_cache_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Tool attachments per agent
CREATE TABLE IF NOT EXISTS tool_attachments (
    agent_id TEXT NOT NULL,
    tool_id TEXT NOT NULL,
    module_name TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    is_letta_tool INTEGER NOT NULL DEFAULT 0,
    attached_at TEXT NOT NULL,
    PRIMARY KEY (agent_id, tool_id),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- ============================================================
-- AGENT GROUPS (for embodied agents and multi-agent systems)
-- ============================================================

-- Groups of agents that form one logical entity
CREATE TABLE IF NOT EXISTS agent_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_type TEXT NOT NULL,  -- e.g., 'embodied', 'multi-persona', etc.
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Members of a group with their roles
CREATE TABLE IF NOT EXISTS agent_group_members (
    group_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    letta_agent_id TEXT,       -- Letta's agent ID
    role TEXT NOT NULL,        -- 'primary', 'soma', 'reflection', etc.
    template_version TEXT,     -- e.g., 'my-project/soma:latest'
    visible INTEGER NOT NULL DEFAULT 0, -- 0 = hidden, 1 = visible in lists
    created_at TEXT NOT NULL,
    PRIMARY KEY (group_id, agent_id),
    FOREIGN KEY (group_id) REFERENCES agent_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- ============================================================
-- INDEXES FOR COMMON QUERIES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_agents_enabled ON agents(enabled);
CREATE INDEX IF NOT EXISTS idx_agent_modules_module ON agent_modules(module_name);
CREATE INDEX IF NOT EXISTS idx_agent_service_state_updated ON agent_service_state(updated_at);
CREATE INDEX IF NOT EXISTS idx_letta_state_letta_id ON letta_state(letta_agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_attachments_module ON tool_attachments(module_name);
CREATE INDEX IF NOT EXISTS idx_agent_group_members_agent ON agent_group_members(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_group_members_role ON agent_group_members(group_id, role);
`;

/**
 * SQLite Database wrapper for Ampelos
 */
export class SQLiteDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(options: SQLiteDatabaseOptions = {}) {
    this.dbPath = options.path ?? join(process.cwd(), 'storage', 'ampelos.db');

    // Ensure storage directory exists
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Open database with WAL mode for better concurrency
    this.db = new Database(this.dbPath, {
      verbose: options.verbose ? console.log : undefined,
    });

    // Enable WAL mode and foreign keys
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  /**
   * Initialize the database (create schema if needed)
   */
  initialize(): void {
    const version = this.getSchemaVersionInternal();

    if (version === 0) {
      // Fresh database - create schema
      this.db.exec(SCHEMA_SQL);
      this.setSchemaInfo('schema_version', String(SCHEMA_VERSION));
      log.info('Database initialized with schema version', { version: SCHEMA_VERSION });
    } else if (version < SCHEMA_VERSION) {
      // Run migrations
      this.runMigrations(version);
    } else {
      log.info('Database ready', { version });
    }
  }

  /**
   * Get current schema version (internal)
   */
  private getSchemaVersionInternal(): number {
    try {
      const row = this.db.prepare(
        "SELECT value FROM schema_info WHERE key = 'schema_version'"
      ).get() as { value: string } | undefined;
      return row ? parseInt(row.value, 10) : 0;
    } catch {
      // Table doesn't exist yet
      return 0;
    }
  }

  /**
   * Get current schema version (public API)
   */
  getSchemaVersion(): number {
    return this.getSchemaVersionInternal();
  }

  /**
   * Set schema info value
   */
  private setSchemaInfo(key: string, value: string): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO schema_info (key, value) VALUES (?, ?)'
    ).run(key, value);
  }

  /**
   * Run schema migrations
   */
  private runMigrations(fromVersion: number): void {
    log.info('Migrating database', { fromVersion, toVersion: SCHEMA_VERSION });

    // Migration to v2: Add agent_groups tables for embodied agent architecture
    if (fromVersion < 2) {
      log.info('Running migration v2: Adding agent_groups tables');
      this.db.exec(`
        -- Groups of agents that form one logical entity
        CREATE TABLE IF NOT EXISTS agent_groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            group_type TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Members of a group with their roles
        CREATE TABLE IF NOT EXISTS agent_group_members (
            group_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            letta_agent_id TEXT,
            role TEXT NOT NULL,
            template_version TEXT,
            visible INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            PRIMARY KEY (group_id, agent_id),
            FOREIGN KEY (group_id) REFERENCES agent_groups(id) ON DELETE CASCADE,
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
        );

        -- Indexes for agent groups
        CREATE INDEX IF NOT EXISTS idx_agent_group_members_agent ON agent_group_members(agent_id);
        CREATE INDEX IF NOT EXISTS idx_agent_group_members_role ON agent_group_members(group_id, role);
      `);
      log.info('Migration v2 complete: agent_groups tables created');
    }

    this.setSchemaInfo('schema_version', String(SCHEMA_VERSION));
    log.info('Migration complete');
  }

  // ============================================================
  // Transaction Support
  // ============================================================

  /**
   * Run a function in a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ============================================================
  // Type-Safe Query Helpers
  // ============================================================

  /**
   * Get a single row
   */
  getOne<T>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  /**
   * Get all rows
   */
  getAll<T>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  /**
   * Run a statement (INSERT, UPDATE, DELETE)
   */
  run(sql: string, ...params: unknown[]): Database.RunResult {
    return this.db.prepare(sql).run(...params);
  }

  /**
   * Execute raw SQL (for schema changes)
   */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Prepare a statement for reuse
   */
  prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }

  // ============================================================
  // Agent Operations
  // ============================================================

  /**
   * Get all agents
   */
  getAllAgents(): AgentRow[] {
    return this.getAll<AgentRow>('SELECT * FROM agents ORDER BY name');
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentRow | undefined {
    return this.getOne<AgentRow>('SELECT * FROM agents WHERE id = ?', agentId);
  }

  /**
   * Create a new agent
   */
  createAgent(agent: CreateAgentInput): AgentRow {
    const now = new Date().toISOString();
    this.run(
      'INSERT INTO agents (id, name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      agent.id, agent.name, agent.enabled !== false ? 1 : 0, now, now
    );
    return this.getAgent(agent.id)!;
  }

  /**
   * Update an agent
   */
  updateAgent(agentId: string, updates: UpdateAgentInput): void {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      params.push(updates.name);
    }
    if (updates.enabled !== undefined) {
      sets.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }

    if (sets.length > 0) {
      sets.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(agentId);
      this.run(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`, ...params);
    }
  }

  /**
   * Delete an agent (CASCADE will clean up related data)
   */
  deleteAgent(agentId: string): boolean {
    const result = this.run('DELETE FROM agents WHERE id = ?', agentId);
    return result.changes > 0;
  }

  // ============================================================
  // Agent Module Operations
  // ============================================================

  /**
   * Get modules for an agent
   */
  getAgentModules(agentId: string): AgentModuleRow[] {
    return this.getAll<AgentModuleRow>(
      'SELECT * FROM agent_modules WHERE agent_id = ?',
      agentId
    );
  }

  /**
   * Add a module to an agent
   */
  addAgentModule(agentId: string, moduleName: string, options: { enabled?: boolean; lazy?: boolean } = {}): void {
    this.run(
      'INSERT OR REPLACE INTO agent_modules (agent_id, module_name, enabled, lazy, added_at) VALUES (?, ?, ?, ?, ?)',
      agentId, moduleName, options.enabled !== false ? 1 : 0, options.lazy ? 1 : 0, new Date().toISOString()
    );
  }

  /**
   * Remove a module from an agent
   */
  removeAgentModule(agentId: string, moduleName: string): boolean {
    const result = this.run(
      'DELETE FROM agent_modules WHERE agent_id = ? AND module_name = ?',
      agentId, moduleName
    );
    return result.changes > 0;
  }

  // ============================================================
  // Module Config Operations
  // ============================================================

  /**
   * Get module config for an agent
   */
  getModuleConfig(agentId: string, moduleName: string): Record<string, unknown> | undefined {
    const row = this.getOne<{ config: string }>(
      'SELECT config FROM agent_module_configs WHERE agent_id = ? AND module_name = ?',
      agentId, moduleName
    );
    return row ? JSON.parse(row.config) : undefined;
  }

  /**
   * Set module config for an agent
   */
  setModuleConfig(agentId: string, moduleName: string, config: Record<string, unknown>): void {
    this.run(
      'INSERT OR REPLACE INTO agent_module_configs (agent_id, module_name, config, updated_at) VALUES (?, ?, ?, ?)',
      agentId, moduleName, JSON.stringify(config), new Date().toISOString()
    );
  }

  // ============================================================
  // Letta Config Operations
  // ============================================================

  /**
   * Get Letta config for an agent
   */
  getLettaConfig(agentId: string): LettaConfigRow | undefined {
    return this.getOne<LettaConfigRow>(
      'SELECT * FROM agent_letta_configs WHERE agent_id = ?',
      agentId
    );
  }

  /**
   * Set Letta config for an agent
   */
  setLettaConfig(agentId: string, config: Omit<LettaConfigRow, 'agent_id'>): void {
    this.run(
      `INSERT OR REPLACE INTO agent_letta_configs
       (agent_id, model, embedding, enable_sleeptime, system_prompt_template, memory_blocks)
       VALUES (?, ?, ?, ?, ?, ?)`,
      agentId,
      config.model ?? null,
      config.embedding ?? null,
      config.enable_sleeptime ? 1 : 0,
      config.system_prompt_template ?? null,
      typeof config.memory_blocks === 'string' ? config.memory_blocks : JSON.stringify(config.memory_blocks ?? {})
    );
  }

  // ============================================================
  // State Operations
  // ============================================================

  /**
   * Get Letta state for an agent
   */
  getLettaState(agentId: string): LettaStateRow | undefined {
    return this.getOne<LettaStateRow>(
      'SELECT * FROM letta_state WHERE agent_id = ?',
      agentId
    );
  }

  /**
   * Set Letta state for an agent
   */
  setLettaState(agentId: string, state: Partial<Omit<LettaStateRow, 'agent_id'>>): void {
    const existing = this.getLettaState(agentId);

    if (existing) {
      const sets: string[] = [];
      const params: unknown[] = [];

      if (state.letta_agent_id !== undefined) {
        sets.push('letta_agent_id = ?');
        params.push(state.letta_agent_id);
      }
      if (state.backend !== undefined) {
        sets.push('backend = ?');
        params.push(state.backend);
      }
      if (state.initialized !== undefined) {
        sets.push('initialized = ?');
        params.push(state.initialized ? 1 : 0);
      }
      if (state.created_at !== undefined) {
        sets.push('created_at = ?');
        params.push(state.created_at);
      }
      if (state.attached_agent_blocks !== undefined) {
        sets.push('attached_agent_blocks = ?');
        params.push(typeof state.attached_agent_blocks === 'string'
          ? state.attached_agent_blocks
          : JSON.stringify(state.attached_agent_blocks));
      }

      if (sets.length > 0) {
        params.push(agentId);
        this.run(`UPDATE letta_state SET ${sets.join(', ')} WHERE agent_id = ?`, ...params);
      }
    } else {
      this.run(
        `INSERT INTO letta_state (agent_id, letta_agent_id, backend, initialized, created_at, attached_agent_blocks)
         VALUES (?, ?, ?, ?, ?, ?)`,
        agentId,
        state.letta_agent_id ?? null,
        state.backend ?? null,
        state.initialized ? 1 : 0,
        state.created_at ?? null,
        typeof state.attached_agent_blocks === 'string'
          ? state.attached_agent_blocks
          : JSON.stringify(state.attached_agent_blocks ?? {})
      );
    }
  }

  /**
   * Get service state for an agent
   */
  getServiceState(agentId: string, moduleName: string): Record<string, unknown> | undefined {
    const row = this.getOne<{ state: string }>(
      'SELECT state FROM agent_service_state WHERE agent_id = ? AND module_name = ?',
      agentId, moduleName
    );
    return row ? JSON.parse(row.state) : undefined;
  }

  /**
   * Set service state for an agent
   */
  setServiceState(agentId: string, moduleName: string, state: Record<string, unknown>): void {
    this.run(
      'INSERT OR REPLACE INTO agent_service_state (agent_id, module_name, state, updated_at) VALUES (?, ?, ?, ?)',
      agentId, moduleName, JSON.stringify(state), new Date().toISOString()
    );
  }

  /**
   * Delete service state for an agent
   */
  deleteServiceState(agentId: string, moduleName: string): void {
    this.run(
      'DELETE FROM agent_service_state WHERE agent_id = ? AND module_name = ?',
      agentId, moduleName
    );
  }

  /**
   * Get all service states for an agent
   */
  getAllServiceStates(agentId: string): Record<string, Record<string, unknown>> {
    const rows = this.getAll<{ module_name: string; state: string }>(
      'SELECT module_name, state FROM agent_service_state WHERE agent_id = ?',
      agentId
    );
    const result: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      result[row.module_name] = JSON.parse(row.state);
    }
    return result;
  }

  /**
   * Get all agent IDs that have service state for a specific module.
   * Used for eager initialization of timer-based modules on startup.
   */
  getAgentsWithServiceState(moduleName: string): string[] {
    const rows = this.getAll<{ agent_id: string }>(
      'SELECT DISTINCT agent_id FROM agent_service_state WHERE module_name = ?',
      moduleName
    );
    return rows.map(row => row.agent_id);
  }

  /**
   * Get global state
   */
  getGlobalState(namespace: string): Record<string, unknown> | undefined {
    const row = this.getOne<{ state: string }>(
      'SELECT state FROM global_state WHERE namespace = ?',
      namespace
    );
    return row ? JSON.parse(row.state) : undefined;
  }

  /**
   * Set global state
   */
  setGlobalState(namespace: string, state: Record<string, unknown>): void {
    this.run(
      'INSERT OR REPLACE INTO global_state (namespace, state, updated_at) VALUES (?, ?, ?)',
      namespace, JSON.stringify(state), new Date().toISOString()
    );
  }

  // ============================================================
  // Template Operations
  // ============================================================

  /**
   * Get all agent templates
   */
  getAllTemplates(): AgentTemplateRow[] {
    return this.getAll<AgentTemplateRow>('SELECT * FROM agent_templates ORDER BY name');
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): AgentTemplateRow | undefined {
    return this.getOne<AgentTemplateRow>(
      'SELECT * FROM agent_templates WHERE id = ?',
      templateId
    );
  }

  /**
   * Create a template
   */
  createTemplate(template: AgentTemplateRow): void {
    this.run(
      'INSERT INTO agent_templates (id, name, description, modules, variables, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      template.id, template.name, template.description ?? null,
      typeof template.modules === 'string' ? template.modules : JSON.stringify(template.modules),
      typeof template.variables === 'string' ? template.variables : JSON.stringify(template.variables),
      template.created_at
    );
  }

  /**
   * Delete a template
   */
  deleteTemplate(templateId: string): boolean {
    const result = this.run('DELETE FROM agent_templates WHERE id = ?', templateId);
    return result.changes > 0;
  }

  // ============================================================
  // Tool Attachment Operations
  // ============================================================

  /**
   * Get tool attachments for an agent
   */
  getToolAttachments(agentId: string): ToolAttachmentRow[] {
    return this.getAll<ToolAttachmentRow>(
      'SELECT * FROM tool_attachments WHERE agent_id = ?',
      agentId
    );
  }

  /**
   * Attach a tool to an agent
   */
  attachTool(attachment: ToolAttachmentRow): void {
    this.run(
      `INSERT OR REPLACE INTO tool_attachments
       (agent_id, tool_id, module_name, tool_name, is_letta_tool, attached_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      attachment.agent_id, attachment.tool_id, attachment.module_name,
      attachment.tool_name, attachment.is_letta_tool ? 1 : 0, attachment.attached_at
    );
  }

  /**
   * Detach a tool from an agent
   */
  detachTool(agentId: string, toolId: string): boolean {
    const result = this.run(
      'DELETE FROM tool_attachments WHERE agent_id = ? AND tool_id = ?',
      agentId, toolId
    );
    return result.changes > 0;
  }

  // ============================================================
  // Template Cache Operations
  // ============================================================

  /**
   * Get template cache
   */
  getTemplateCache(): { memory_blocks: TemplateCacheRow[]; system_prompts: TemplateCacheRow[] } {
    const memoryBlocks = this.getAll<TemplateCacheRow>(
      "SELECT * FROM template_cache WHERE category = 'memory_blocks'"
    );
    const systemPrompts = this.getAll<TemplateCacheRow>(
      "SELECT * FROM template_cache WHERE category = 'system_prompts'"
    );
    return { memory_blocks: memoryBlocks, system_prompts: systemPrompts };
  }

  /**
   * Set template cache
   */
  setTemplateCache(category: 'memory_blocks' | 'system_prompts', templates: Omit<TemplateCacheRow, 'category'>[]): void {
    // Clear existing cache for this category
    this.run('DELETE FROM template_cache WHERE category = ?', category);

    // Insert new entries
    const stmt = this.prepare(
      'INSERT INTO template_cache (category, name, path, variables) VALUES (?, ?, ?, ?)'
    );
    for (const template of templates) {
      stmt.run(
        category,
        template.name,
        template.path,
        typeof template.variables === 'string' ? template.variables : JSON.stringify(template.variables)
      );
    }
  }

  /**
   * Get template cache metadata
   */
  getTemplateCacheMeta(key: string): string | undefined {
    const row = this.getOne<{ value: string }>(
      'SELECT value FROM template_cache_meta WHERE key = ?',
      key
    );
    return row?.value;
  }

  /**
   * Set template cache metadata
   */
  setTemplateCacheMeta(key: string, value: string): void {
    this.run(
      'INSERT OR REPLACE INTO template_cache_meta (key, value) VALUES (?, ?)',
      key, value
    );
  }

  // ============================================================
  // Agent Group Operations
  // ============================================================

  /**
   * Create an agent group
   */
  createAgentGroup(input: CreateAgentGroupInput): AgentGroupRow {
    const now = new Date().toISOString();
    this.run(
      'INSERT INTO agent_groups (id, name, group_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      input.id, input.name, input.group_type, now, now
    );
    return this.getAgentGroup(input.id)!;
  }

  /**
   * Get an agent group by ID
   */
  getAgentGroup(groupId: string): AgentGroupRow | undefined {
    return this.getOne<AgentGroupRow>(
      'SELECT * FROM agent_groups WHERE id = ?',
      groupId
    );
  }

  /**
   * Get all agent groups
   */
  getAllAgentGroups(): AgentGroupRow[] {
    return this.getAll<AgentGroupRow>('SELECT * FROM agent_groups ORDER BY name');
  }

  /**
   * Get agent groups by type
   */
  getAgentGroupsByType(groupType: string): AgentGroupRow[] {
    return this.getAll<AgentGroupRow>(
      'SELECT * FROM agent_groups WHERE group_type = ? ORDER BY name',
      groupType
    );
  }

  /**
   * Delete an agent group (CASCADE deletes members)
   */
  deleteAgentGroup(groupId: string): boolean {
    const result = this.run('DELETE FROM agent_groups WHERE id = ?', groupId);
    return result.changes > 0;
  }

  /**
   * Add a member to an agent group
   */
  addGroupMember(input: AddGroupMemberInput): AgentGroupMemberRow {
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO agent_group_members
       (group_id, agent_id, letta_agent_id, role, template_version, visible, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      input.group_id,
      input.agent_id,
      input.letta_agent_id ?? null,
      input.role,
      input.template_version ?? null,
      input.visible ? 1 : 0,
      now
    );
    return this.getGroupMember(input.group_id, input.agent_id)!;
  }

  /**
   * Get a specific group member
   */
  getGroupMember(groupId: string, agentId: string): AgentGroupMemberRow | undefined {
    return this.getOne<AgentGroupMemberRow>(
      'SELECT * FROM agent_group_members WHERE group_id = ? AND agent_id = ?',
      groupId, agentId
    );
  }

  /**
   * Get all members of a group
   */
  getGroupMembers(groupId: string): AgentGroupMemberRow[] {
    return this.getAll<AgentGroupMemberRow>(
      'SELECT * FROM agent_group_members WHERE group_id = ? ORDER BY role',
      groupId
    );
  }

  /**
   * Get group membership for an agent (if any)
   */
  getAgentGroupMembership(agentId: string): AgentGroupMemberRow | undefined {
    return this.getOne<AgentGroupMemberRow>(
      'SELECT * FROM agent_group_members WHERE agent_id = ?',
      agentId
    );
  }

  /**
   * Get the group an agent belongs to (if any)
   */
  getGroupForAgent(agentId: string): AgentGroupRow | undefined {
    const membership = this.getAgentGroupMembership(agentId);
    if (!membership) return undefined;
    return this.getAgentGroup(membership.group_id);
  }

  /**
   * Get a group member by role
   */
  getGroupMemberByRole(groupId: string, role: string): AgentGroupMemberRow | undefined {
    return this.getOne<AgentGroupMemberRow>(
      'SELECT * FROM agent_group_members WHERE group_id = ? AND role = ?',
      groupId, role
    );
  }

  /**
   * Update a group member's Letta agent ID
   */
  updateGroupMemberLettaId(groupId: string, agentId: string, lettaAgentId: string): void {
    this.run(
      'UPDATE agent_group_members SET letta_agent_id = ? WHERE group_id = ? AND agent_id = ?',
      lettaAgentId, groupId, agentId
    );
  }

  /**
   * Remove a member from a group
   */
  removeGroupMember(groupId: string, agentId: string): boolean {
    const result = this.run(
      'DELETE FROM agent_group_members WHERE group_id = ? AND agent_id = ?',
      groupId, agentId
    );
    return result.changes > 0;
  }

  /**
   * Check if an agent is visible (not hidden in a group)
   * Returns true if agent is not in any group, or if visible=1 in their group membership
   */
  isAgentVisible(agentId: string): boolean {
    const membership = this.getAgentGroupMembership(agentId);
    if (!membership) return true; // Not in a group = visible
    return membership.visible === 1;
  }

  /**
   * Get all visible agents (filters out hidden group members)
   */
  getVisibleAgents(): AgentRow[] {
    return this.getAll<AgentRow>(`
      SELECT a.* FROM agents a
      LEFT JOIN agent_group_members m ON a.id = m.agent_id
      WHERE m.agent_id IS NULL OR m.visible = 1
      ORDER BY a.name
    `);
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get the database file path
   */
  getPath(): string {
    return this.dbPath;
  }
}

// ============================================================
// Row Types
// ============================================================

export interface AgentRow {
  id: string;
  name: string;
  enabled: number; // SQLite boolean
  created_at: string;
  updated_at: string;
}

/**
 * Input type for creating agents (accepts boolean for enabled)
 */
export interface CreateAgentInput {
  id: string;
  name: string;
  enabled?: boolean;
}

/**
 * Input type for updating agents (accepts boolean for enabled)
 */
export interface UpdateAgentInput {
  name?: string;
  enabled?: boolean;
}

export interface AgentModuleRow {
  agent_id: string;
  module_name: string;
  enabled: number;
  lazy: number;
  added_at: string;
}

export interface LettaConfigRow {
  agent_id: string;
  model: string | null;
  embedding: string | null;
  enable_sleeptime: number;
  system_prompt_template: string | null;
  memory_blocks: string; // JSON
}

export interface LettaStateRow {
  agent_id: string;
  letta_agent_id: string | null;
  backend: 'cloud' | 'self-hosted' | null;
  initialized: number;
  created_at: string | null;
  attached_agent_blocks: string; // JSON
}

export interface AgentTemplateRow {
  id: string;
  name: string;
  description: string | null;
  modules: string; // JSON
  variables: string; // JSON
  created_at: string;
}

export interface ToolAttachmentRow {
  agent_id: string;
  tool_id: string;
  module_name: string;
  tool_name: string;
  is_letta_tool: number;
  attached_at: string;
}

export interface TemplateCacheRow {
  category: 'memory_blocks' | 'system_prompts';
  name: string;
  path: string;
  variables: string; // JSON array of variable names
}

// ============================================================
// Agent Group Row Types
// ============================================================

export interface AgentGroupRow {
  id: string;
  name: string;
  group_type: string;
  created_at: string;
  updated_at: string;
}

export interface AgentGroupMemberRow {
  group_id: string;
  agent_id: string;
  letta_agent_id: string | null;
  role: string;
  template_version: string | null;
  visible: number; // SQLite boolean (0 = hidden, 1 = visible)
  created_at: string;
}

export interface CreateAgentGroupInput {
  id: string;
  name: string;
  group_type: string;
}

export interface AddGroupMemberInput {
  group_id: string;
  agent_id: string;
  letta_agent_id?: string;
  role: string;
  template_version?: string;
  visible?: boolean;
}
