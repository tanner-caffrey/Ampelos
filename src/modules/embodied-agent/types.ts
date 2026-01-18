/**
 * Types for the Embodied Agent module
 */

/**
 * Soma agent configuration
 */
export interface SomaConfig {
  enabled: boolean;
  template: string;                    // Letta template version
  model?: string;                      // LLM model (e.g., "openai/gpt-4o-mini")
  memory_variables?: Record<string, string>;
  shared_blocks?: string[];            // Memory blocks to attach from primary
}

/**
 * Reflection agent configuration
 */
export interface ReflectionConfig {
  enabled: boolean;
  template: string;                    // Letta template version
  model?: string;                      // LLM model (e.g., "openai/gpt-4o")
  memory_variables?: Record<string, string>;
  interval_minutes: number;
  shared_blocks?: string[];            // Memory blocks to attach from primary
}

/**
 * Body daemon configuration
 */
export interface BodyDaemonConfig {
  enabled: boolean;
  tick_interval_seconds: number;
  idle_threshold_seconds: number;
}

/**
 * Full embodied agent configuration (per-agent)
 */
export interface EmbodiedAgentConfig {
  soma?: SomaConfig;
  reflection?: ReflectionConfig;
  body_daemon?: BodyDaemonConfig;
}

/**
 * Roles within an embodied agent group
 */
export type EmbodiedRole = 'primary' | 'soma' | 'reflection';

/**
 * State of an embodied agent instance
 */
export interface EmbodiedAgentState {
  group_id: string;
  primary_agent_id: string;
  soma_agent_id?: string;
  soma_letta_id?: string;
  reflection_agent_id?: string;
  reflection_letta_id?: string;
  body_daemon_active: boolean;
  last_activity_at?: string;
  last_reflection_at?: string;
  initialized: boolean;
}

/**
 * Context passed to soma agent after primary chat
 */
export interface ChatCompleteContext {
  stimulus: string;              // The message that triggered the response
  response: string;              // The agent's response text
  role: 'user' | 'system';       // Who sent the stimulus
  timestamp: string;
}

/**
 * Body daemon tick event
 */
export interface BodyDaemonTick {
  agent_id: string;
  tick_number: number;
  idle_duration_seconds: number;
  last_activity_at: string | null;
}

/**
 * Decay rule for body states
 */
export interface StateDecayRule {
  state: string;
  decay_after_seconds: number;
  decay_to?: string;             // State to transition to (undefined = clear)
}
