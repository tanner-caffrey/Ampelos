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
  memory_blocks: z.record(MemoryBlockConfigSchema).refine(
    (blocks) => Object.keys(blocks).length > 0,
    {
      message: 'At least one memory block must be specified'
    }
  ),
  system_prompt_template: z.string().min(1, 'System prompt template must be specified'),
  custom_tools: z.array(z.string()).optional()
});

// Letta server configuration schema
export const LettaServerConfigSchema = z.object({
  base_url: z.string().url('Invalid Letta server URL'),
  token: z.string().optional()
});

// Module configuration schema (for manifest)
export const LettaModuleConfigSchema = z.object({
  server: LettaServerConfigSchema,
  letta_agent_config: LettaAgentConfigSchema.optional()
});

export type MemoryBlockConfig = z.infer<typeof MemoryBlockConfigSchema>;
export type LettaAgentConfig = z.infer<typeof LettaAgentConfigSchema>;
export type LettaServerConfig = z.infer<typeof LettaServerConfigSchema>;
export type LettaModuleConfig = z.infer<typeof LettaModuleConfigSchema>;
