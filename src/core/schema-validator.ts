/**
 * Schema Validator - validates configurations using Zod
 */

import { z } from 'zod';
import type { JSONSchema } from '../types/module.js';

/**
 * Convert JSON Schema to Zod schema
 * This is a simplified converter - full JSON Schema support would be more complex
 */
export function jsonSchemaToZod(jsonSchema: JSONSchema): z.ZodTypeAny {
  if (!jsonSchema.type) {
    return z.any();
  }

  switch (jsonSchema.type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'integer':
      return z.number().int();
    case 'boolean':
      return z.boolean();
    case 'array':
      if (jsonSchema.items && typeof jsonSchema.items === 'object') {
        return z.array(jsonSchemaToZod(jsonSchema.items as JSONSchema));
      }
      return z.array(z.any());
    case 'object':
      if (jsonSchema.properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const [key, propSchema] of Object.entries(jsonSchema.properties)) {
          let zodType = jsonSchemaToZod(propSchema as JSONSchema);
          
          // Check if field is required
          const isRequired = jsonSchema.required?.includes(key) ?? false;
          if (!isRequired) {
            zodType = zodType.optional();
          }
          
          shape[key] = zodType;
        }
        return z.object(shape);
      }
      return z.record(z.any());
    default:
      return z.any();
  }
}

/**
 * Validate configuration against JSON Schema
 */
export function validateConfig(
  config: unknown,
  schema: JSONSchema
): { valid: boolean; errors?: string[]; data?: unknown } {
  try {
    const zodSchema = jsonSchemaToZod(schema);
    const result = zodSchema.safeParse(config);
    
    if (result.success) {
      return { valid: true, data: result.data };
    } else {
      const errors = result.error.errors.map(err => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });
      return { valid: false, errors };
    }
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Validate module manifest structure
 */
export function validateManifest(manifest: unknown): { valid: boolean; errors?: string[] } {
  const manifestSchema = z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    provides: z.array(z.enum(['tool', 'service'])).min(1),
    dependencies: z.array(z.string()).optional(),
    config_schema: z.any().optional(),
    advertise: z.boolean().optional(),
    description: z.string().optional(),
  });

  const result = manifestSchema.safeParse(manifest);
  
  if (result.success) {
    return { valid: true };
  } else {
    const errors = result.error.errors.map(err => {
      const path = err.path.join('.');
      return `${path}: ${err.message}`;
    });
    return { valid: false, errors };
  }
}

