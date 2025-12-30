/**
 * Template Registry - Discovers and manages file-based templates
 *
 * Scans the Letta module's templates directory for memory blocks and system prompts,
 * extracts variable definitions, and caches the results in SQLite.
 */

import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import type { Database } from './database.js';
import type { TemplateInfo, TemplateCacheData } from '../types/config.js';
import { createComponentLogger } from './logger.js';

const log = createComponentLogger('TemplateRegistry');

// Get module directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default templates directory (Letta core)
const DEFAULT_TEMPLATES_DIR = resolve(__dirname, 'letta', 'templates');

/**
 * Template Registry class
 */
export class TemplateRegistry {
  private db: Database;
  private templatesDir: string;
  private memoryBlockTemplates: Map<string, TemplateInfo> = new Map();
  private systemPromptTemplates: Map<string, TemplateInfo> = new Map();
  private initialized = false;

  constructor(db: Database, templatesDir?: string) {
    this.db = db;
    this.templatesDir = templatesDir ?? DEFAULT_TEMPLATES_DIR;
  }

  /**
   * Initialize the registry by loading from cache or scanning filesystem
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Try to load from cache first
    const cached = this.loadFromCache();
    if (cached) {
      log.info('Loaded templates from cache');
      this.initialized = true;
      return;
    }

    // Scan filesystem and cache
    await this.refresh();
    this.initialized = true;
  }

  /**
   * Refresh templates from filesystem
   */
  async refresh(): Promise<void> {
    log.debug('Scanning templates', { path: this.templatesDir });

    // Clear existing
    this.memoryBlockTemplates.clear();
    this.systemPromptTemplates.clear();

    // Scan memory_blocks directory
    await this.scanDirectory('memory_blocks');

    // Scan system_prompts directory
    await this.scanDirectory('system_prompts');

    // Update cache
    this.saveToCache();

    log.info('Found templates', {
      memoryBlocks: this.memoryBlockTemplates.size,
      systemPrompts: this.systemPromptTemplates.size,
    });
  }

  /**
   * Scan a template directory
   */
  private async scanDirectory(category: 'memory_blocks' | 'system_prompts'): Promise<void> {
    const dirPath = join(this.templatesDir, category);

    try {
      const files = await readdir(dirPath);

      for (const file of files) {
        if (!file.endsWith('.txt')) continue;

        const filePath = join(dirPath, file);
        const name = basename(file, '.txt');

        try {
          const content = await readFile(filePath, 'utf-8');
          const variables = this.extractVariables(content);

          const info: TemplateInfo = {
            name,
            category,
            path: filePath,
            variables,
          };

          if (category === 'memory_blocks') {
            this.memoryBlockTemplates.set(name, info);
          } else {
            this.systemPromptTemplates.set(name, info);
          }

          log.debug('Found template', { category, name, variableCount: variables.length });
        } catch (error) {
          log.error('Error reading template', { file, error: error instanceof Error ? error.message : String(error) });
        }
      }
    } catch (error) {
      // Directory might not exist
      log.debug('Directory not found or empty', { category });
    }
  }

  /**
   * Extract {{variable}} patterns from template content
   */
  private extractVariables(content: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables: Set<string> = new Set();
    let match;

    while ((match = regex.exec(content)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  /**
   * Load templates from database cache
   */
  private loadFromCache(): boolean {
    const cache = this.db.getTemplateCache();
    const lastRefresh = this.db.getTemplateCacheMeta('last_refresh');

    if (!lastRefresh || cache.memory_blocks.length === 0 && cache.system_prompts.length === 0) {
      return false;
    }

    // Check if cache is stale (older than 1 hour)
    const lastRefreshDate = new Date(lastRefresh);
    const now = new Date();
    const ageMs = now.getTime() - lastRefreshDate.getTime();
    const maxAgeMs = 60 * 60 * 1000; // 1 hour

    if (ageMs > maxAgeMs) {
      log.debug('Cache is stale, will refresh');
      return false;
    }

    // Load from cache
    for (const row of cache.memory_blocks) {
      const info: TemplateInfo = {
        name: row.name,
        category: 'memory_blocks',
        path: row.path,
        variables: JSON.parse(row.variables),
      };
      this.memoryBlockTemplates.set(row.name, info);
    }

    for (const row of cache.system_prompts) {
      const info: TemplateInfo = {
        name: row.name,
        category: 'system_prompts',
        path: row.path,
        variables: JSON.parse(row.variables),
      };
      this.systemPromptTemplates.set(row.name, info);
    }

    return true;
  }

  /**
   * Save templates to database cache
   */
  private saveToCache(): void {
    // Save memory blocks
    const memoryBlocks = Array.from(this.memoryBlockTemplates.values()).map(t => ({
      name: t.name,
      path: t.path,
      variables: JSON.stringify(t.variables),
    }));
    this.db.setTemplateCache('memory_blocks', memoryBlocks);

    // Save system prompts
    const systemPrompts = Array.from(this.systemPromptTemplates.values()).map(t => ({
      name: t.name,
      path: t.path,
      variables: JSON.stringify(t.variables),
    }));
    this.db.setTemplateCache('system_prompts', systemPrompts);

    // Save last refresh time
    this.db.setTemplateCacheMeta('last_refresh', new Date().toISOString());
  }

  /**
   * Get all memory block templates
   */
  getMemoryBlockTemplates(): TemplateInfo[] {
    return Array.from(this.memoryBlockTemplates.values());
  }

  /**
   * Get all system prompt templates
   */
  getSystemPromptTemplates(): TemplateInfo[] {
    return Array.from(this.systemPromptTemplates.values());
  }

  /**
   * Get a specific memory block template
   */
  getMemoryBlockTemplate(name: string): TemplateInfo | undefined {
    return this.memoryBlockTemplates.get(name);
  }

  /**
   * Get a specific system prompt template
   */
  getSystemPromptTemplate(name: string): TemplateInfo | undefined {
    return this.systemPromptTemplates.get(name);
  }

  /**
   * Render a memory block template with variables
   */
  async renderMemoryBlock(
    name: string,
    variables: Record<string, unknown>
  ): Promise<string> {
    const info = this.memoryBlockTemplates.get(name);
    if (!info) {
      throw new Error(`Memory block template "${name}" not found`);
    }

    const content = await readFile(info.path, 'utf-8');
    return this.renderTemplate(content, variables);
  }

  /**
   * Render a system prompt template with variables
   */
  async renderSystemPrompt(
    name: string,
    variables: Record<string, unknown>
  ): Promise<string> {
    const info = this.systemPromptTemplates.get(name);
    if (!info) {
      throw new Error(`System prompt template "${name}" not found`);
    }

    const content = await readFile(info.path, 'utf-8');
    return this.renderTemplate(content, variables);
  }

  /**
   * Render template content with variable substitution
   */
  private renderTemplate(
    template: string,
    variables: Record<string, unknown>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key];

      if (value === undefined || value === null) {
        return '';
      }

      if (Array.isArray(value)) {
        return this.formatArray(value);
      }

      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      }

      return String(value);
    });
  }

  /**
   * Format arrays for natural language output
   */
  private formatArray(arr: unknown[]): string {
    if (arr.length === 0) return '';
    if (arr.length === 1) return String(arr[0]);
    if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;

    const allButLast = arr.slice(0, -1).join(', ');
    const last = arr[arr.length - 1];
    return `${allButLast}, and ${last}`;
  }
}

// Re-export TemplateInfo for convenience
export type { TemplateInfo, TemplateCacheData };
