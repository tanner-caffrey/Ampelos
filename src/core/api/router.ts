/**
 * Admin API Router
 *
 * Routes HTTP requests to the appropriate handlers for agent management
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Database } from '../database.js';
import type { AgentStore } from '../agent-store.js';
import type { ServiceManager } from '../service-manager.js';
import type { TemplateRegistry } from '../template-registry.js';
import type { LoadedModule } from '../../types/module.js';
import type { ToolManager } from '../tool-manager.js';
import { createComponentLogger } from '../logger.js';
import { AgentAPIHandler } from './handlers/agents.js';
import { ModuleAPIHandler } from './handlers/modules.js';
import { TemplateAPIHandler } from './handlers/templates.js';
import { HealthAPIHandler } from './handlers/health.js';
import { ToolsAPIHandler } from './handlers/tools.js';

const log = createComponentLogger('AdminAPI');

/**
 * Admin API Router class
 */
export class AdminAPIRouter {
  private agentHandler: AgentAPIHandler;
  private moduleHandler: ModuleAPIHandler;
  private templateHandler: TemplateAPIHandler;
  private healthHandler: HealthAPIHandler;
  private toolsHandler: ToolsAPIHandler;

  constructor(
    db: Database,
    store: AgentStore,
    serviceManager: ServiceManager,
    templateRegistry: TemplateRegistry,
    loadedModules: Map<string, LoadedModule>,
    toolManager?: ToolManager
  ) {
    this.agentHandler = new AgentAPIHandler(store, serviceManager, loadedModules);
    this.moduleHandler = new ModuleAPIHandler(store, serviceManager, loadedModules);
    this.templateHandler = new TemplateAPIHandler(store, templateRegistry);
    this.healthHandler = new HealthAPIHandler(db, store);
    // ToolsHandler is optional - requires toolManager
    this.toolsHandler = toolManager ? new ToolsAPIHandler(toolManager, store) : null!;
  }

  /**
   * Check if request has valid admin API key
   */
  private authenticate(req: IncomingMessage, res: ServerResponse): boolean {
    const adminApiKey = process.env.ADMIN_API_KEY;

    // If no admin key configured, fall back to MCP_API_KEY
    const apiKey = adminApiKey || process.env.MCP_API_KEY;

    // If no key configured at all, allow (backward compatibility)
    if (!apiKey) {
      return true;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing Authorization header' }));
      return false;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid Authorization format' }));
      return false;
    }

    if (parts[1] !== apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid API key' }));
      return false;
    }

    return true;
  }

  /**
   * Parse query parameters from URL
   */
  private parseQueryParams(url: string): Record<string, string> {
    const params: Record<string, string> = {};
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return params;

    const queryString = url.slice(queryIndex + 1);
    for (const pair of queryString.split('&')) {
      const [key, value] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    }
    return params;
  }

  /**
   * Route an admin API request
   * Returns true if the request was handled, false otherwise
   * @param bypassAuth - If true, skip authentication (for same-origin web interface requests)
   */
  async route(
    req: IncomingMessage,
    res: ServerResponse,
    body?: unknown,
    bypassAuth = false
  ): Promise<boolean> {
    const url = req.url || '';
    const method = req.method || 'GET';

    // Parse URL path
    const path = url.split('?')[0];
    const pathParts = path.split('/').filter(Boolean);

    // Check if this is an admin API request (/api/admin/...)
    if (pathParts[0] !== 'api' || pathParts[1] !== 'admin') {
      return false; // Not an admin API request
    }

    log.info(`${method} ${url}`);

    // Authenticate (except for health check or when bypassed for same-origin requests)
    const isHealthCheck = pathParts[2] === 'health' && method === 'GET';
    if (!bypassAuth && !isHealthCheck && !this.authenticate(req, res)) {
      return true; // Request handled (with auth error)
    }

    // Parse query parameters
    const queryParams = this.parseQueryParams(url);

    // Route to handlers
    const resource = pathParts[2];

    // ==========================================================================
    // Agent Routes
    // ==========================================================================
    if (resource === 'agents') {
      if (pathParts.length === 3) {
        // /api/admin/agents
        if (method === 'GET') {
          await this.agentHandler.handleListAgents(req, res);
          return true;
        }
        if (method === 'POST') {
          await this.agentHandler.handleCreateAgent(req, res, body);
          return true;
        }
      } else if (pathParts.length === 4) {
        // /api/admin/agents/:agentId
        const agentId = decodeURIComponent(pathParts[3]);
        if (method === 'GET') {
          await this.agentHandler.handleGetAgent(req, res, agentId);
          return true;
        }
        if (method === 'PUT') {
          await this.agentHandler.handleUpdateAgent(req, res, agentId, body);
          return true;
        }
        if (method === 'DELETE') {
          const deleteLetta = queryParams.deleteLetta === 'true';
          await this.agentHandler.handleDeleteAgent(req, res, agentId, deleteLetta);
          return true;
        }
      } else if (pathParts.length === 5) {
        const agentId = decodeURIComponent(pathParts[3]);
        const action = pathParts[4];

        if (action === 'enable' && method === 'POST') {
          await this.agentHandler.handleEnableAgent(req, res, agentId);
          return true;
        }
        if (action === 'disable' && method === 'POST') {
          await this.agentHandler.handleDisableAgent(req, res, agentId);
          return true;
        }
        if (action === 'create-letta' && method === 'POST') {
          await this.agentHandler.handleCreateLettaAgent(req, res, agentId);
          return true;
        }
        if (action === 'modules') {
          // /api/admin/agents/:agentId/modules
          if (method === 'GET') {
            await this.moduleHandler.handleListModules(req, res, agentId);
            return true;
          }
        }
        if (action === 'modules-status') {
          // /api/admin/agents/:agentId/modules-status
          if (method === 'GET') {
            await this.moduleHandler.handleGetModulesStatus(req, res, agentId);
            return true;
          }
        }
        if (action === 'tools') {
          // /api/admin/agents/:agentId/tools
          if (!this.toolsHandler) {
            res.writeHead(501, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Tools API not available' }));
            return true;
          }
          if (method === 'GET') {
            await this.toolsHandler.handleListAgentTools(req, res, agentId);
            return true;
          }
        }
      } else if (pathParts.length === 6) {
        const agentId = decodeURIComponent(pathParts[3]);
        const subResource = pathParts[4];

        if (subResource === 'modules') {
          // /api/admin/agents/:agentId/modules/:moduleName
          const moduleName = decodeURIComponent(pathParts[5]);
          if (method === 'POST') {
            await this.moduleHandler.handleAddModule(req, res, agentId, moduleName, body);
            return true;
          }
          if (method === 'DELETE') {
            await this.moduleHandler.handleRemoveModule(req, res, agentId, moduleName);
            return true;
          }
        }
        if (subResource === 'tools') {
          // /api/admin/agents/:agentId/tools/:toolId
          if (!this.toolsHandler) {
            res.writeHead(501, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Tools API not available' }));
            return true;
          }
          const toolId = decodeURIComponent(pathParts[5]);
          if (method === 'POST') {
            await this.toolsHandler.handleAttachTool(req, res, agentId, toolId);
            return true;
          }
          if (method === 'DELETE') {
            await this.toolsHandler.handleDetachTool(req, res, agentId, toolId);
            return true;
          }
        }
      } else if (pathParts.length === 7) {
        const agentId = decodeURIComponent(pathParts[3]);
        const subResource = pathParts[4];
        const moduleName = decodeURIComponent(pathParts[5]);
        const configPath = pathParts[6];

        if (subResource === 'modules' && configPath === 'config') {
          // /api/admin/agents/:agentId/modules/:moduleName/config
          if (method === 'GET') {
            await this.moduleHandler.handleGetModuleConfig(req, res, agentId, moduleName);
            return true;
          }
          if (method === 'PUT') {
            await this.moduleHandler.handleUpdateModuleConfig(req, res, agentId, moduleName, body);
            return true;
          }
        }

        if (subResource === 'modules' && configPath === 'state') {
          // /api/admin/agents/:agentId/modules/:moduleName/state
          if (method === 'GET') {
            await this.moduleHandler.handleGetModuleState(req, res, agentId, moduleName);
            return true;
          }
          if (method === 'PUT') {
            // Module-specific state update handlers
            if (moduleName === 'spatial') {
              await this.moduleHandler.handleUpdateSpatialState(req, res, agentId, body);
              return true;
            }
            if (moduleName === 'body_and_inventory') {
              await this.moduleHandler.handleUpdateEmbodimentState(req, res, agentId, body);
              return true;
            }
            // Generic fallback - not supported for other modules
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: `State updates not supported for module: ${moduleName}` }));
            return true;
          }
        }

        if (subResource === 'modules' && configPath === 'init') {
          // /api/admin/agents/:agentId/modules/:moduleName/init
          if (method === 'POST') {
            await this.moduleHandler.handleInitModule(req, res, agentId, moduleName);
            return true;
          }
        }

        if (subResource === 'modules' && configPath === 'enabled') {
          // /api/admin/agents/:agentId/modules/:moduleName/enabled
          if (method === 'PUT') {
            await this.moduleHandler.handleSetModuleEnabled(req, res, agentId, moduleName, body);
            return true;
          }
        }
      }
    }

    // ==========================================================================
    // Module Routes
    // ==========================================================================
    if (resource === 'modules') {
      if (pathParts.length === 3 && method === 'GET') {
        // /api/admin/modules
        await this.moduleHandler.handleListAvailableModules(req, res);
        return true;
      }
      if (pathParts.length === 5 && pathParts[4] === 'schema' && method === 'GET') {
        // /api/admin/modules/:name/schema
        const moduleName = decodeURIComponent(pathParts[3]);
        await this.moduleHandler.handleGetModuleSchema(req, res, moduleName);
        return true;
      }
      if (pathParts.length === 5 && pathParts[4] === 'tools' && method === 'GET') {
        // /api/admin/modules/:name/tools
        if (!this.toolsHandler) {
          res.writeHead(501, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Tools API not available' }));
          return true;
        }
        const moduleName = decodeURIComponent(pathParts[3]);
        await this.toolsHandler.handleListModuleTools(req, res, moduleName);
        return true;
      }
    }

    // ==========================================================================
    // Tools Routes
    // ==========================================================================
    if (resource === 'tools') {
      if (!this.toolsHandler) {
        res.writeHead(501, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Tools API not available' }));
        return true;
      }

      if (pathParts.length === 3 && method === 'GET') {
        // /api/admin/tools - List all available tools
        await this.toolsHandler.handleListTools(req, res);
        return true;
      }
    }

    // ==========================================================================
    // Template Routes
    // ==========================================================================
    if (resource === 'templates') {
      const templateType = pathParts[3];

      if (templateType === 'memory-blocks' && method === 'GET') {
        // /api/admin/templates/memory-blocks
        await this.templateHandler.handleListMemoryBlockTemplates(req, res);
        return true;
      }
      if (templateType === 'system-prompts' && method === 'GET') {
        // /api/admin/templates/system-prompts
        await this.templateHandler.handleListSystemPromptTemplates(req, res);
        return true;
      }
      if (templateType === 'refresh' && method === 'POST') {
        // /api/admin/templates/refresh
        await this.templateHandler.handleRefreshTemplates(req, res);
        return true;
      }
      if (templateType === 'agents') {
        if (pathParts.length === 4) {
          // /api/admin/templates/agents
          if (method === 'GET') {
            await this.templateHandler.handleListAgentTemplates(req, res);
            return true;
          }
          if (method === 'POST') {
            await this.templateHandler.handleCreateAgentTemplate(req, res, body);
            return true;
          }
        } else if (pathParts.length === 5) {
          // /api/admin/templates/agents/:id
          const templateId = decodeURIComponent(pathParts[4]);
          if (method === 'GET') {
            await this.templateHandler.handleGetAgentTemplate(req, res, templateId);
            return true;
          }
          if (method === 'DELETE') {
            await this.templateHandler.handleDeleteAgentTemplate(req, res, templateId);
            return true;
          }
        }
      }
    }

    // ==========================================================================
    // Health Routes
    // ==========================================================================
    if (resource === 'health' && method === 'GET') {
      // /api/admin/health
      await this.healthHandler.handleHealthCheck(req, res);
      return true;
    }

    // ==========================================================================
    // Not Found
    // ==========================================================================
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Admin API endpoint not found' }));
    return true;
  }
}
