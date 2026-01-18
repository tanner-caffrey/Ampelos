/**
 * Agent Templates Module
 *
 * Provides local agent templates that work on any Letta backend.
 */

export {
  AgentTemplateManager,
  getAgentTemplateManager,
  initializeAgentTemplates,
} from './agent-template-manager.js';

export type {
  AgentTemplate,
  TemplateMemoryBlock,
  TemplateVariable,
  InstantiateOptions,
  InstantiateResult,
} from './types.js';
