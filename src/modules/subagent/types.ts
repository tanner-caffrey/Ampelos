/**
 * Sub-Agent Module Types
 *
 * Types for the sub-agent spawning system that enables agents to create
 * and manage child agents from Letta templates.
 */

import type { LettaBackendType } from '../../core/letta/types.js';

/**
 * Lifecycle options for sub-agents
 */
export type SubagentLifecycle = 'ephemeral' | 'persistent';

/**
 * Status of a sub-agent
 */
export type SubagentStatus = 'active' | 'completed' | 'failed' | 'abandoned';

/**
 * Information about a spawned sub-agent
 */
export interface SubagentInfo {
  /** Unique ID for this sub-agent (Ampelos-side UUID) */
  id: string;

  /** Letta template version used to create this sub-agent */
  template_version: string;

  /** Letta agent ID on the server */
  letta_agent_id: string;

  /** Parent's Letta agent ID (for inter-agent messaging) */
  parent_letta_id: string;

  /** Letta backend where the sub-agent lives */
  backend: LettaBackendType;

  /** Whether sub-agent is deleted after task or kept for reuse */
  lifecycle: SubagentLifecycle;

  /** Current status */
  status: SubagentStatus;

  /** ISO timestamp when created */
  created_at: string;

  /** ISO timestamp when completed (if applicable) */
  completed_at?: string;

  /** ISO timestamp of last activity */
  last_activity_at: string;

  /** Task description passed when spawning */
  task_description: string;

  /** Block IDs shared from parent (for cleanup) */
  shared_block_ids: string[];

  /** Last result from the sub-agent (if completed) */
  result?: string;
}

/**
 * Service state stored per-agent
 */
export interface SubagentServiceState {
  /** Map of sub-agent ID to info */
  subagents: Record<string, SubagentInfo>;
}

/**
 * Options for spawning a sub-agent
 */
export interface SpawnSubagentOptions {
  /** Letta template version ID */
  template_version: string;

  /** Task description (passed as memory_variable) */
  task: string;

  /** Additional memory variables for the template */
  memory_variables?: Record<string, string>;

  /** If true, wait for result; if false, return immediately */
  wait_for_result?: boolean;

  /** Block labels to share with sub-agent */
  shared_blocks?: string[];

  /** Override lifecycle from template default */
  lifecycle?: SubagentLifecycle;
}

/**
 * Result of spawning a sub-agent
 */
export interface SpawnSubagentResult {
  /** Ampelos sub-agent ID */
  subagent_id: string;

  /** Letta agent ID */
  letta_agent_id: string;

  /** Current status */
  status: SubagentStatus;

  /** If sync mode, the result from the sub-agent */
  result?: string;
}

/**
 * Options for messaging a sub-agent
 */
export interface MessageSubagentOptions {
  /** Sub-agent ID to message */
  subagent_id: string;

  /** Message to send */
  message: string;

  /** If true, wait for reply */
  wait_for_reply?: boolean;
}

/**
 * Result of messaging a sub-agent
 */
export interface MessageSubagentResult {
  /** Whether message was delivered */
  delivered: boolean;

  /** Response from sub-agent (if wait_for_reply was true) */
  response?: string;
}

/**
 * Module configuration options
 */
export interface SubagentModuleConfig {
  /** Maximum concurrent sub-agents per parent agent (0 = unlimited) */
  max_subagents?: number;

  /** Default lifecycle for sub-agents if not specified in spawn call */
  default_lifecycle?: SubagentLifecycle;

  /** Timeout in seconds for sync spawn operations */
  sync_timeout_seconds?: number;

  /** Auto-cleanup abandoned sub-agents after this many hours */
  abandoned_timeout_hours?: number;
}
