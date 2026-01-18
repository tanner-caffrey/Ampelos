/**
 * Letta Core Infrastructure
 *
 * Exports for Letta integration in Ampelos core.
 */

// Main classes
export { LettaManager, LettaAgentContext, lettaManager } from './letta-manager.js';
export type { LettaManagerContext, RegisterLettaAgentFn } from './letta-manager.js';

// Client
export { LettaClientWrapper } from './letta-client.js';
export type {
  LettaConfig,
  MemoryBlock,
  MemoryBlockDetailed,
  CreateAgentOptions,
  AgentInfo,
  GroupManagerType,
  GroupInfo,
  CreateGroupOptions,
  ChatResponse,
} from './letta-client.js';

// Re-export Letta SDK client type for modules that need direct SDK access
export type { Letta } from '@letta-ai/letta-client';

// Types
export type {
  LettaState,
  AgentBlockInfo,
  ChatCompleteCallback,
  ChatCompleteContext,
  ChatCompleteCallbackWithContext,
  ChatOptions,
  ILettaAgentContext,
  LettaAgentConfig,
  MemoryBlockConfig,
} from './types.js';

// Tools
export { getLettaCoreTools, tools as lettaTools } from './letta-tools.js';

// Utilities
export { buildAgentConfig, buildMemoryBlocks, validateLettaConfig, validateMemoryBlockConfig } from './utils/memory-builder.js';
export { loadTemplate, renderTemplate, processMemoryBlock, processSystemPrompt } from './utils/template-engine.js';
export type { TemplateVariables } from './utils/template-engine.js';
export { inferLLMDefaults, inferEmbeddingDefaults, applyLLMDefaults, applyEmbeddingDefaults } from './utils/model-defaults.js';
export { LettaAgentConfigSchema, MemoryBlockConfigSchema } from './utils/config-validator.js';

// Agent Templates
export {
  AgentTemplateManager,
  getAgentTemplateManager,
  initializeAgentTemplates,
} from './templates/index.js';
export type {
  AgentTemplate,
  TemplateMemoryBlock,
  TemplateVariable,
  InstantiateOptions,
  InstantiateResult,
} from './templates/index.js';
