/**
 * Memory Block Builder
 *
 * Builds memory blocks from configuration, handling templates and variables
 */

import { processMemoryBlock, processSystemPrompt, TemplateVariables } from './template-engine.js';
import { MemoryBlock } from '../client.js';

export interface MemoryBlockConfig {
  limit: number;
  value?: string;
  template?: string;
  file?: string;
  customizations?: TemplateVariables;
}

export interface LettaAgentConfig {
  model: string;
  embedding: string;
  memory_blocks: Record<string, MemoryBlockConfig>;
  system_prompt_template: string;
  custom_tools?: string[];
}

/**
 * Build memory blocks from configuration
 */
export async function buildMemoryBlocks(
  config: Record<string, MemoryBlockConfig>
): Promise<MemoryBlock[]> {
  const blocks: MemoryBlock[] = [];

  for (const [name, blockConfig] of Object.entries(config)) {
    const value = await processMemoryBlock(blockConfig);

    blocks.push({
      name,
      value,
      limit: blockConfig.limit
    });
  }

  return blocks;
}

/**
 * Build complete agent configuration from config
 */
export async function buildAgentConfig(
  agentName: string,
  config: LettaAgentConfig
): Promise<{
  name: string;
  model: string;
  embedding_model: string;
  system_prompt: string;
  memory_blocks: MemoryBlock[];
  tools: string[];
}> {
  // Build memory blocks
  const memoryBlocks = await buildMemoryBlocks(config.memory_blocks);

  // Build system prompt
  const systemPrompt = await processSystemPrompt(config.system_prompt_template, {
    agent_name: agentName
  });

  return {
    name: agentName,
    model: config.model,
    embedding_model: config.embedding,
    system_prompt: systemPrompt,
    memory_blocks: memoryBlocks,
    tools: config.custom_tools || []
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
