/**
 * Configuration Validator
 *
 * Zod schemas for Letta agent configuration
 */

import { z } from 'zod';

// Memory block configuration schema
export const MemoryBlockConfigSchema = z.object({
  limit: z.number().positive(),
  value: z.string().optional(),
  template: z.string().optional(),
  file: z.string().optional(),
  customizations: z.record(z.any()).optional()
}).refine(
  (data) => {
    const modes = [data.value, data.template, data.file].filter(Boolean);
    return modes.length === 1;
  },
  {
    message: 'Memory block must specify exactly one of: value, template, or file'
  }
);

// Letta agent configuration schema
export const LettaAgentConfigSchema = z.object({
  model: z.string().min(1, 'Model must be specified'),
  embedding: z.string().min(1, 'Embedding model must be specified'),
  // Optional SDK v1.0+ fields (smart defaults applied if not specified)
  model_endpoint_type: z.string().optional(),
  context_window: z.number().positive().optional(),
  embedding_endpoint_type: z.string().optional(),
  embedding_dim: z.number().positive().optional(),
  // Memory and system configuration
  memory_blocks: z.record(MemoryBlockConfigSchema).refine(
    (blocks) => Object.keys(blocks).length > 0,
    {
      message: 'At least one memory block must be specified'
    }
  ),
  system_prompt_template: z.string().min(1, 'System prompt template must be specified'),
  custom_tools: z.array(z.string()).optional(),
  enable_sleeptime: z.boolean().optional()
});

export type MemoryBlockConfig = z.infer<typeof MemoryBlockConfigSchema>;
export type LettaAgentConfig = z.infer<typeof LettaAgentConfigSchema>;
