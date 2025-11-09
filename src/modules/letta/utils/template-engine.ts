/**
 * Template Engine for Letta Agent Framework
 *
 * Supports:
 * - Template files with {{variable}} substitution
 * - Direct string values
 * - File path references
 * - Array formatting (e.g., core_traits: ["a", "b", "c"] -> "a, b, and c")
 */

import { readFile } from 'fs/promises';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Base path for templates
const TEMPLATES_DIR = resolve(__dirname, '..', 'templates');

export interface TemplateVariables {
  [key: string]: string | string[] | number | boolean | TemplateVariables;
}

/**
 * Load a template file by name
 */
export async function loadTemplate(
  category: 'memory_blocks' | 'system_prompts',
  name: string
): Promise<string> {
  const templatePath = join(TEMPLATES_DIR, category, `${name}.txt`);
  try {
    return await readFile(templatePath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to load template "${name}" from ${category}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Format arrays for natural language output
 * Examples:
 * - ["a"] -> "a"
 * - ["a", "b"] -> "a and b"
 * - ["a", "b", "c"] -> "a, b, and c"
 */
function formatArray(arr: unknown[]): string {
  if (arr.length === 0) return '';
  if (arr.length === 1) return String(arr[0]);
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;

  const allButLast = arr.slice(0, -1).join(', ');
  const last = arr[arr.length - 1];
  return `${allButLast}, and ${last}`;
}

/**
 * Resolve a variable value for substitution
 */
function resolveVariable(variables: TemplateVariables, key: string): string {
  const value = variables[key];

  if (value === undefined || value === null) {
    return '';
  }

  if (Array.isArray(value)) {
    return formatArray(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

/**
 * Render a template with variable substitution
 *
 * Supports {{variable}} syntax
 * Handles arrays, objects, and primitives
 */
export function renderTemplate(template: string, variables: TemplateVariables = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return resolveVariable(variables, key);
  });
}

/**
 * Process a memory block configuration
 *
 * Supports three modes:
 * 1. Direct value: { value: "string content" }
 * 2. Template file: { template: "template_name", customizations: {...} }
 * 3. File reference: { file: "/path/to/file.txt" }
 */
export async function processMemoryBlock(
  config: {
    value?: string;
    template?: string;
    file?: string;
    customizations?: TemplateVariables;
  }
): Promise<string> {
  // Mode 1: Direct value
  if (config.value) {
    return config.value;
  }

  // Mode 2: Template file
  if (config.template) {
    const template = await loadTemplate('memory_blocks', config.template);
    return renderTemplate(template, config.customizations || {});
  }

  // Mode 3: File reference
  if (config.file) {
    try {
      return await readFile(config.file, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to load memory block from file "${config.file}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new Error(
    'Memory block config must specify one of: value, template, or file'
  );
}

/**
 * Process a system prompt configuration
 *
 * Supports:
 * 1. Template name: "template_name"
 * 2. Direct string: custom prompt text
 * 3. File path: "/path/to/prompt.txt"
 */
export async function processSystemPrompt(
  config: string,
  variables: TemplateVariables = {}
): Promise<string> {
  // Check if it's a template name (no path separators)
  if (!config.includes('/') && !config.includes('\\')) {
    try {
      const template = await loadTemplate('system_prompts', config);
      return renderTemplate(template, variables);
    } catch (error) {
      // If template doesn't exist, treat as direct string
      return renderTemplate(config, variables);
    }
  }

  // Check if it's a file path
  try {
    const content = await readFile(config, 'utf-8');
    return renderTemplate(content, variables);
  } catch {
    // If file doesn't exist, treat as direct string
    return renderTemplate(config, variables);
  }
}
