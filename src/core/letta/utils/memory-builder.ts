/**
 * Memory Block Builder
 *
 * Builds memory blocks from configuration, handling templates and variables
 */

import { processMemoryBlock, TemplateVariables } from './template-engine.js';
import type { MemoryBlock } from '../letta-client.js';
import { applyLLMDefaults, applyEmbeddingDefaults } from './model-defaults.js';
import type { LettaAgentConfig, MemoryBlockConfig } from './config-validator.js';

export type { MemoryBlockConfig, LettaAgentConfig };

/**
 * Build memory blocks from configuration
 */
export async function buildMemoryBlocks(
  config: Record<string, MemoryBlockConfig>
): Promise<MemoryBlock[]> {
  const blocks: MemoryBlock[] = [];

  for (const [label, blockConfig] of Object.entries(config)) {
    const value = await processMemoryBlock(blockConfig);

    blocks.push({
      label,
      value,
      limit: blockConfig.limit
    });
  }

  return blocks;
}

/**
 * Build complete agent configuration from config
 * Returns params ready for Letta SDK createAgent()
 */
export async function buildAgentConfig(
  agentName: string,
  config: LettaAgentConfig
): Promise<{
  name: string;
  model: string;
  embedding: string;
  modelEndpointType: string;
  contextWindow: number;
  embeddingEndpointType: string;
  embeddingDim: number;
  memoryBlocks: MemoryBlock[];
  tools?: string[];
  enableSleeptime?: boolean;
}> {
  // Build memory blocks
  const memoryBlocks = await buildMemoryBlocks(config.memory_blocks);

  // Apply smart defaults for LLM config (with user overrides)
  const llmConfig = applyLLMDefaults({
    model: config.model,
    model_endpoint_type: config.model_endpoint_type,
    context_window: config.context_window
  });

  // Apply smart defaults for embedding config (with user overrides)
  const embeddingConfig = applyEmbeddingDefaults({
    embedding: config.embedding,
    embedding_endpoint_type: config.embedding_endpoint_type,
    embedding_dim: config.embedding_dim
  });

  return {
    name: agentName,
    model: llmConfig.model,
    embedding: embeddingConfig.embedding,
    modelEndpointType: llmConfig.model_endpoint_type,
    contextWindow: llmConfig.context_window,
    embeddingEndpointType: embeddingConfig.embedding_endpoint_type,
    embeddingDim: embeddingConfig.embedding_dim,
    memoryBlocks,
    tools: config.custom_tools && config.custom_tools.length > 0 ? config.custom_tools : undefined,
    enableSleeptime: config.enable_sleeptime
  };
}

/**
 * Validate memory block configuration
 */
export function validateMemoryBlockConfig(config: MemoryBlockConfig): void {
  if (!config.limit || config.limit <= 0) {
    throw new Error('Memory block must have a positive limit');
  }

  const modes = [config.value, config.template, config.file].filter(Boolean);
  if (modes.length === 0) {
    throw new Error('Memory block must specify one of: value, template, or file');
  }
  if (modes.length > 1) {
    throw new Error('Memory block can only specify one of: value, template, or file');
  }
}

/**
 * Validate Letta agent configuration
 */
export function validateLettaConfig(config: LettaAgentConfig): void {
  if (!config.model) {
    throw new Error('Agent config must specify a model');
  }

  if (!config.embedding) {
    throw new Error('Agent config must specify an embedding model');
  }

  if (!config.memory_blocks || Object.keys(config.memory_blocks).length === 0) {
    throw new Error('Agent config must specify at least one memory block');
  }

  if (!config.system_prompt_template) {
    throw new Error('Agent config must specify a system_prompt_template');
  }

  // Validate each memory block
  for (const [name, blockConfig] of Object.entries(config.memory_blocks)) {
    try {
      validateMemoryBlockConfig(blockConfig);
    } catch (error) {
      throw new Error(`Invalid memory block "${name}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
