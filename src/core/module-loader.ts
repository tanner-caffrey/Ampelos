/**
 * Module Loader - discovers, loads, and validates modules
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ModuleManifest, LoadedModule, ServiceFactory } from '../types/module.js';
import type { BaseService } from '../types/service.js';
import type { ToolDefinition } from '../types/tool.js';
import { validateManifest } from './schema-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Module Loader class
 */
export class ModuleLoader {
  private modulesPath: string;
  private loadedModules: Map<string, LoadedModule> = new Map();

  constructor(modulesPath?: string) {
    // Default to src/modules relative to project root
    this.modulesPath = modulesPath ?? join(process.cwd(), 'src', 'modules');
  }

  /**
   * Discover and load all modules
   */
  async loadAllModules(): Promise<Map<string, LoadedModule>> {
    this.loadedModules.clear();

    // Load modules from three locations:
    // 1. src/modules/tools/ - standalone tools
    // 2. src/modules/services/ - standalone services
    // 3. src/modules/*/ - paired modules (direct children)

    await this.loadStandaloneTools();
    await this.loadStandaloneServices();
    await this.loadPairedModules();

    return this.loadedModules;
  }

  /**
   * Load standalone tools from src/modules/tools/
   */
  private async loadStandaloneTools(): Promise<void> {
    const toolsPath = join(this.modulesPath, 'tools');
    try {
      const entries = await readdir(toolsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.loadModule(join(toolsPath, entry.name), 'tool');
        }
      }
    } catch (error) {
      // Directory might not exist, that's okay
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Load standalone services from src/modules/services/
   */
  private async loadStandaloneServices(): Promise<void> {
    const servicesPath = join(this.modulesPath, 'services');
    try {
      const entries = await readdir(servicesPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.loadModule(join(servicesPath, entry.name), 'service');
        }
      }
    } catch (error) {
      // Directory might not exist, that's okay
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Load paired modules from src/modules/ (direct children, not in tools/ or services/)
   */
  private async loadPairedModules(): Promise<void> {
    try {
      const entries = await readdir(this.modulesPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'tools' && entry.name !== 'services') {
          await this.loadModule(join(this.modulesPath, entry.name), 'both');
        }
      }
    } catch (error) {
      // Directory might not exist, that's okay
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Load a single module from a directory
   */
  private async loadModule(modulePath: string, expectedType: 'tool' | 'service' | 'both'): Promise<void> {
    try {
      // Load manifest
      const manifestPath = join(modulePath, 'manifest.json');
      const manifestContent = await readFile(manifestPath, 'utf-8');
      const manifest: ModuleManifest = JSON.parse(manifestContent);

      // Validate manifest structure
      const validation = validateManifest(manifest);
      if (!validation.valid) {
        throw new Error(`Invalid manifest: ${validation.errors?.join(', ')}`);
      }

      // Check if module provides what we expect
      if (expectedType === 'tool' && !manifest.provides.includes('tool')) {
        console.warn(`Module ${manifest.name} in tools/ but doesn't provide tool`);
        return;
      }
      if (expectedType === 'service' && !manifest.provides.includes('service')) {
        console.warn(`Module ${manifest.name} in services/ but doesn't provide service`);
        return;
      }

      const loadedModule: LoadedModule = {
        manifest,
        path: modulePath,
        loaded: false,
      };

      // Load service factory if module provides service
      if (manifest.provides.includes('service')) {
        try {
          const serviceModule = await import(join(modulePath, 'service.ts'));
          if (serviceModule.default && typeof serviceModule.default === 'function') {
            loadedModule.serviceFactory = () => new serviceModule.default() as BaseService;
          } else if (serviceModule.Service) {
            loadedModule.serviceFactory = () => new serviceModule.Service() as BaseService;
          } else {
            throw new Error('Service module must export a default class or Service class');
          }
        } catch (error) {
          loadedModule.error = `Failed to load service: ${error instanceof Error ? error.message : String(error)}`;
          this.loadedModules.set(manifest.name, loadedModule);
          return;
        }
      }

      // Load tools if module provides tools
      if (manifest.provides.includes('tool')) {
        try {
          const toolModule = await import(join(modulePath, 'tool.ts'));
          if (toolModule.tools && Array.isArray(toolModule.tools)) {
            loadedModule.tools = toolModule.tools as ToolDefinition[];
          } else if (toolModule.default && Array.isArray(toolModule.default)) {
            loadedModule.tools = toolModule.default as ToolDefinition[];
          } else {
            throw new Error('Tool module must export a tools array or default array');
          }
        } catch (error) {
          loadedModule.error = `Failed to load tools: ${error instanceof Error ? error.message : String(error)}`;
          this.loadedModules.set(manifest.name, loadedModule);
          return;
        }
      }

      loadedModule.loaded = true;
      this.loadedModules.set(manifest.name, loadedModule);
    } catch (error) {
      // Try to get module name from path
      const moduleName = modulePath.split(/[/\\]/).pop() ?? 'unknown';
      const loadedModule: LoadedModule = {
        manifest: {
          name: moduleName,
          version: '0.0.0',
          provides: [],
        },
        path: modulePath,
        loaded: false,
        error: error instanceof Error ? error.message : String(error),
      };
      this.loadedModules.set(moduleName, loadedModule);
    }
  }


  /**
   * Get a loaded module by name
   */
  getModule(name: string): LoadedModule | undefined {
    return this.loadedModules.get(name);
  }

  /**
   * Get all loaded modules
   */
  getAllModules(): Map<string, LoadedModule> {
    return this.loadedModules;
  }

  /**
   * Get all successfully loaded modules
   */
  getLoadedModules(): LoadedModule[] {
    return Array.from(this.loadedModules.values()).filter(m => m.loaded);
  }
}

