/**
 * Agent Template Types
 *
 * Defines the schema for local agent templates that can be instantiated
 * on any Letta backend (cloud or self-hosted).
 */

/**
 * Memory block configuration in a template
 */
export interface TemplateMemoryBlock {
  /** Label for this memory block (e.g., "persona", "somatic_patterns") */
  label: string;

  /** Direct value for the block content */
  value?: string;

  /** Template name to load from memory_blocks/ directory */
  template?: string;

  /** Character limit for this block */
  limit?: number;

  /** Description shown to the agent about this block's purpose */
  description?: string;
}

/**
 * Variable definition for template instantiation
 */
export interface TemplateVariable {
  /** Variable name (used as {{name}} in templates) */
  name: string;

  /** Whether this variable must be provided */
  required?: boolean;

  /** Default value if not provided */
  default?: string;

  /** Human-readable description of this variable */
  description?: string;
}

/**
 * Full agent template definition
 */
export interface AgentTemplate {
  /** Template identifier (e.g., "soma-agent") */
  name: string;

  /** Semantic version (e.g., "1.0.0") */
  version: string;

  /** Human-readable description */
  description?: string;

  /** LLM model to use (e.g., "openai/gpt-4o-mini") */
  llm?: string;

  /** Embedding model (e.g., "letta/letta-free") */
  embedding?: string;

  /**
   * System prompt - can be:
   * - Template name (loads from system_prompts/)
   * - Inline string (if contains newlines or special chars)
   */
  system_prompt: string;

  /** Memory blocks to create for this agent */
  memory_blocks: TemplateMemoryBlock[];

  /** Tool names to attach (from available MCP tools) */
  tools?: string[];

  /** Variables that can be injected at instantiation time */
  variables?: TemplateVariable[];

  /** Whether to skip the initial message sequence (default: true for subagents) */
  skip_initial_messages?: boolean;
}

/**
 * Options for instantiating an agent from a template
 */
export interface InstantiateOptions {
  /** Variable values to inject */
  variables?: Record<string, string>;

  /** Override the template's LLM setting */
  llm?: string;

  /** Override the template's embedding setting */
  embedding?: string;

  /** Agent name (defaults to template name + random suffix) */
  name?: string;

  /** Block IDs to attach from another agent (shared blocks) */
  attachBlocks?: string[];

  /** Tool IDs to attach (from primary agent or global tools) */
  attachToolIds?: string[];

  /** Tool names to look up and attach from primary agent */
  attachToolsByName?: string[];

  /** Skip initial message sequence */
  skipInitialMessages?: boolean;
}

/**
 * Result of instantiating an agent
 */
export interface InstantiateResult {
  /** Letta agent ID */
  lettaAgentId: string;

  /** Agent name */
  name: string;

  /** Template used */
  templateName: string;

  /** Template version */
  templateVersion: string;

  /** Memory block IDs created (label -> blockId) */
  blockIds: Record<string, string>;
}
