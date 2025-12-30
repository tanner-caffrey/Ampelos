/**
 * Template API Handlers
 *
 * Template listing and management operations
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentStore } from '../../agent-store.js';
import type { TemplateRegistry } from '../../template-registry.js';
import type { AgentTemplate, TemplateVariable } from '../../../types/config.js';
import type {
  APIResponse,
  MemoryBlockTemplatesResponse,
  SystemPromptTemplatesResponse,
  AgentTemplatesResponse,
  CreateAgentTemplateRequest,
} from '../types.js';

/**
 * Template API Handler
 */
export class TemplateAPIHandler {
  private store: AgentStore;
  private templateRegistry: TemplateRegistry;

  constructor(store: AgentStore, templateRegistry: TemplateRegistry) {
    this.store = store;
    this.templateRegistry = templateRegistry;
  }

  /**
   * Send JSON response
   */
  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Send error response
   */
  private sendError(res: ServerResponse, status: number, message: string): void {
    this.sendJson(res, status, { success: false, error: message });
  }

  /**
   * GET /api/admin/templates/memory-blocks - List memory block templates
   */
  async handleListMemoryBlockTemplates(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      await this.templateRegistry.initialize();
      const templates = this.templateRegistry.getMemoryBlockTemplates();

      const response: APIResponse<MemoryBlockTemplatesResponse> = {
        success: true,
        data: { templates },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * GET /api/admin/templates/system-prompts - List system prompt templates
   */
  async handleListSystemPromptTemplates(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      await this.templateRegistry.initialize();
      const templates = this.templateRegistry.getSystemPromptTemplates();

      const response: APIResponse<SystemPromptTemplatesResponse> = {
        success: true,
        data: { templates },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * POST /api/admin/templates/refresh - Refresh template cache from filesystem
   */
  async handleRefreshTemplates(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      await this.templateRegistry.refresh();

      const response: APIResponse = {
        success: true,
        message: 'Template cache refreshed',
        data: {
          memoryBlocks: this.templateRegistry.getMemoryBlockTemplates().length,
          systemPrompts: this.templateRegistry.getSystemPromptTemplates().length,
        },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * GET /api/admin/templates/agents - List agent templates
   */
  async handleListAgentTemplates(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const templates = await this.store.getAllTemplates();

      const response: APIResponse<AgentTemplatesResponse> = {
        success: true,
        data: { templates },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * GET /api/admin/templates/agents/:id - Get agent template
   */
  async handleGetAgentTemplate(
    req: IncomingMessage,
    res: ServerResponse,
    templateId: string
  ): Promise<void> {
    try {
      const template = await this.store.getTemplate(templateId);
      if (!template) {
        this.sendError(res, 404, `Template ${templateId} not found`);
        return;
      }

      const response: APIResponse = {
        success: true,
        data: { template },
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * POST /api/admin/templates/agents - Create agent template
   */
  async handleCreateAgentTemplate(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown
  ): Promise<void> {
    try {
      const request = body as CreateAgentTemplateRequest;

      // Validate request
      if (!request?.id || typeof request.id !== 'string') {
        this.sendError(res, 400, 'Missing or invalid "id" field');
        return;
      }
      if (!request?.name || typeof request.name !== 'string') {
        this.sendError(res, 400, 'Missing or invalid "name" field');
        return;
      }
      if (!request?.modules || typeof request.modules !== 'object') {
        this.sendError(res, 400, 'Missing or invalid "modules" field');
        return;
      }

      // Check if template already exists
      const existing = await this.store.getTemplate(request.id);
      if (existing) {
        this.sendError(res, 409, `Template ${request.id} already exists`);
        return;
      }

      const template: AgentTemplate = {
        id: request.id,
        name: request.name,
        description: request.description || '',
        modules: request.modules,
        variables: (request.variables || []) as TemplateVariable[],
        created_at: new Date().toISOString(),
      };

      const created = await this.store.createTemplate(template);

      const response: APIResponse = {
        success: true,
        data: { template: created },
        message: `Template ${request.id} created successfully`,
      };
      this.sendJson(res, 201, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * DELETE /api/admin/templates/agents/:id - Delete agent template
   */
  async handleDeleteAgentTemplate(
    req: IncomingMessage,
    res: ServerResponse,
    templateId: string
  ): Promise<void> {
    try {
      const deleted = await this.store.deleteTemplate(templateId);
      if (!deleted) {
        this.sendError(res, 404, `Template ${templateId} not found`);
        return;
      }

      const response: APIResponse = {
        success: true,
        message: `Template ${templateId} deleted successfully`,
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
