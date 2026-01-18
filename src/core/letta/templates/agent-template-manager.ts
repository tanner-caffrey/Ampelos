/**
 * Agent Template Manager
 *
 * Loads local agent templates and instantiates them on any Letta backend.
 * Works with both Letta Cloud and self-hosted servers.
 */

import { readFile, readdir } from 'fs/promises';
import { join, basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createComponentLogger } from '../../logger.js';
import { renderTemplate, loadTemplate } from '../utils/template-engine.js';
import { applyLLMDefaults, applyEmbeddingDefaults } from '../utils/model-defaults.js';
import type { LettaClientWrapper } from '../letta-client.js';
import type {
  AgentTemplate,
  InstantiateOptions,
  InstantiateResult,
  TemplateMemoryBlock,
} from './types.js';

const log = createComponentLogger('AgentTemplateManager');

// Get module directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Templates directory (where this file lives is templates/, agents/ is a subdirectory)
const AGENTS_DIR = resolve(__dirname, 'agents');

/**
 * Manages local agent templates
 */
export class AgentTemplateManager {
  private templates: Map<string, AgentTemplate> = new Map();
  private initialized = false;

  /**
   * Initialize the manager by scanning the templates/agents/ directory
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.loadTemplates();
    this.initialized = true;
  }

  /**
   * Load all agent templates from disk
   */
  private async loadTemplates(): Promise<void> {
    try {
      const files = await readdir(AGENTS_DIR);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = join(AGENTS_DIR, file);
        const name = basename(file, '.json');

        try {
          const content = await readFile(filePath, 'utf-8');
          const template = JSON.parse(content) as AgentTemplate;

          // Ensure name matches filename if not specified
          if (!template.name) {
            template.name = name;
          }

          this.templates.set(template.name, template);
          log.debug('Loaded agent template', { name: template.name, version: template.version });
        } catch (error) {
          log.error('Failed to load agent template', {
            file,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      log.info('Agent templates loaded', { count: this.templates.size });
    } catch (error) {
      // Directory might not exist yet
      log.debug('No agent templates directory found', { path: AGENTS_DIR });
    }
  }

  /**
   * Refresh templates from disk
   */
  async refresh(): Promise<void> {
    this.templates.clear();
    await this.loadTemplates();
  }

  /**
   * Get a template by name
   */
  getTemplate(name: string): AgentTemplate | undefined {
    return this.templates.get(name);
  }

  /**
   * Get all available templates
   */
  getAllTemplates(): AgentTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * List template names
   */
  listTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Instantiate an agent from a template
   *
   * @param templateName Name of the template to use
   * @param client Letta client to create the agent with
   * @param options Instantiation options (variables, overrides, etc.)
   */
  async instantiate(
    templateName: string,
    client: LettaClientWrapper,
    options: InstantiateOptions = {}
  ): Promise<InstantiateResult> {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Agent template "${templateName}" not found`);
    }

    // Validate required variables
    this.validateVariables(template, options.variables || {});

    // Merge variables with defaults
    const variables = this.mergeVariables(template, options.variables || {});

    // Render system prompt
    const systemPrompt = await this.renderSystemPrompt(template.system_prompt, variables);

    // Render memory blocks
    const memoryBlocks = await this.renderMemoryBlocks(template.memory_blocks, variables);

    // Generate agent name
    const agentName = options.name || `${template.name}-${Date.now().toString(36)}`;

    // Get model string and derive config with smart defaults
    const modelString = options.llm || template.llm || 'openai/gpt-4o-mini';
    const embeddingString = options.embedding || template.embedding || 'letta/letta-free';

    const llmConfig = applyLLMDefaults({ model: modelString });
    const embeddingConfig = applyEmbeddingDefaults({ embedding: embeddingString });

    log.info('Creating agent from template', {
      template: templateName,
      version: template.version,
      name: agentName,
      model: modelString,
    });

    // Create the agent via wrapper (handles proper SDK params)
    const lettaAgentId = await client.createAgent({
      name: agentName,
      model: llmConfig.model,
      modelEndpointType: llmConfig.model_endpoint_type,
      contextWindow: llmConfig.context_window,
      embedding: embeddingConfig.embedding,
      embeddingEndpointType: embeddingConfig.embedding_endpoint_type,
      embeddingDim: embeddingConfig.embedding_dim,
      memoryBlocks: memoryBlocks.map((block) => ({
        label: block.label,
        value: block.value || '',
        limit: block.limit || 5000,
      })),
    });

    // TODO: Set system prompt - the wrapper doesn't support it yet
    // For now, we'll update it after creation
    if (systemPrompt) {
      try {
        await client.sdk.agents.update(lettaAgentId, { system: systemPrompt });
      } catch (error) {
        log.warn('Failed to set system prompt', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Build block ID map by querying the created agent's blocks
    const blockIds: Record<string, string> = {};
    try {
      const blocks = await client.getMemoryBlocksDetailed(lettaAgentId);
      for (const block of blocks) {
        if (block.label && block.id) {
          blockIds[block.label] = block.id;
        }
      }
    } catch (error) {
      log.warn('Failed to get block IDs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Attach shared blocks if specified
    if (options.attachBlocks && options.attachBlocks.length > 0) {
      for (const blockId of options.attachBlocks) {
        try {
          await client.sdk.agents.blocks.attach(blockId, { agent_id: lettaAgentId });
          log.debug('Attached shared block', { blockId, agentId: lettaAgentId });
        } catch (error) {
          log.warn('Failed to attach shared block', {
            blockId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Attach tools by ID if specified
    if (options.attachToolIds && options.attachToolIds.length > 0) {
      for (const toolId of options.attachToolIds) {
        try {
          await client.attachTool(lettaAgentId, toolId);
          log.debug('Attached tool by ID', { toolId, agentId: lettaAgentId });
        } catch (error) {
          log.warn('Failed to attach tool', {
            toolId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Log if template specifies tools but none were provided
    if (template.tools && template.tools.length > 0 && !options.attachToolIds?.length) {
      log.warn('Template specifies tools but none were attached', {
        template: templateName,
        requiredTools: template.tools,
        hint: 'Pass attachToolIds or attachToolsByName in options',
      });
    }

    log.info('Agent created from template', {
      lettaAgentId,
      name: agentName,
      template: templateName,
    });

    return {
      lettaAgentId,
      name: agentName,
      templateName: template.name,
      templateVersion: template.version,
      blockIds,
    };
  }

  /**
   * Validate that required variables are provided
   */
  private validateVariables(
    template: AgentTemplate,
    provided: Record<string, string>
  ): void {
    if (!template.variables) return;

    const missing: string[] = [];

    for (const variable of template.variables) {
      if (variable.required && !provided[variable.name] && !variable.default) {
        missing.push(variable.name);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing required variables for template "${template.name}": ${missing.join(', ')}`
      );
    }
  }

  /**
   * Merge provided variables with defaults
   */
  private mergeVariables(
    template: AgentTemplate,
    provided: Record<string, string>
  ): Record<string, string> {
    const merged: Record<string, string> = { ...provided };

    if (template.variables) {
      for (const variable of template.variables) {
        if (merged[variable.name] === undefined && variable.default !== undefined) {
          merged[variable.name] = variable.default;
        }
      }
    }

    return merged;
  }

  /**
   * Render the system prompt (from template file or inline)
   */
  private async renderSystemPrompt(
    promptConfig: string,
    variables: Record<string, string>
  ): Promise<string> {
    // Check if it's a template name (no newlines, no path separators)
    if (!promptConfig.includes('\n') && !promptConfig.includes('/')) {
      try {
        const template = await loadTemplate('system_prompts', promptConfig);
        return renderTemplate(template, variables);
      } catch {
        // Not a template file, treat as inline
      }
    }

    // Inline prompt - just render variables
    return renderTemplate(promptConfig, variables);
  }

  /**
   * Render memory blocks from template config
   */
  private async renderMemoryBlocks(
    blocks: TemplateMemoryBlock[],
    variables: Record<string, string>
  ): Promise<Array<{ label: string; value: string; limit?: number }>> {
    const rendered: Array<{ label: string; value: string; limit?: number }> = [];

    for (const block of blocks) {
      let value: string;

      if (block.template) {
        // Load from template file
        try {
          const template = await loadTemplate('memory_blocks', block.template);
          value = renderTemplate(template, variables);
        } catch (error) {
          log.warn('Failed to load memory block template', {
            template: block.template,
            error: error instanceof Error ? error.message : String(error),
          });
          value = block.value || '';
        }
      } else {
        // Use direct value with variable substitution
        value = renderTemplate(block.value || '', variables);
      }

      rendered.push({
        label: block.label,
        value,
        limit: block.limit,
      });
    }

    return rendered;
  }
}

// Singleton instance
let instance: AgentTemplateManager | null = null;

/**
 * Get the singleton AgentTemplateManager instance
 */
export function getAgentTemplateManager(): AgentTemplateManager {
  if (!instance) {
    instance = new AgentTemplateManager();
  }
  return instance;
}

/**
 * Initialize the agent template manager
 */
export async function initializeAgentTemplates(): Promise<AgentTemplateManager> {
  const manager = getAgentTemplateManager();
  await manager.initialize();
  return manager;
}
