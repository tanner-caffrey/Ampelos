/**
 * MCP Server implementation
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, normalize } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { AgentId } from '../types/agent.js';
import type { ToolContext, ToolResult, GlobalToolContext, ToolDefinition } from '../types/tool.js';
import type { LoadedModule } from '../types/module.js';
import { createAgentId } from '../types/agent.js';
import { ServiceError } from '../types/errors.js';
import { AgentRegistry } from './agent-registry.js';
import { ServiceManager } from './service-manager.js';
import type { ChatWebAPIRouter } from '../modules/chat-web/api/router.js';
import type { Database } from './database.js';
import type { AgentStore } from './agent-store.js';
import type { TemplateRegistry } from './template-registry.js';
import type { ToolManager } from './tool-manager.js';
import { AdminAPIRouter } from './api/router.js';
import type { LettaManager } from './letta/index.js';
import { getLettaCoreTools } from './letta/index.js';
import { createComponentLogger } from './logger.js';

// Component loggers
const mcpLog = createComponentLogger('MCP');
const httpLog = createComponentLogger('HTTP');
const chatWebLog = createComponentLogger('ChatWeb');
const adminLog = createComponentLogger('AdminAPI');

export type TransportMode = 'stdio' | 'http';

export interface MCPServerOptions {
  mode?: TransportMode;
  httpPort?: number;
}

/**
 * MCP Server class
 */
export class MCPServer {
  private server: Server;
  private agentRegistry: AgentRegistry;
  private serviceManager: ServiceManager;
  private modules: Map<string, LoadedModule>;
  private transport: StdioServerTransport | StreamableHTTPServerTransport;
  private httpServer?: ReturnType<typeof createServer>;
  private mode: TransportMode;
  private httpPort: number;
  private lettaAgentIdMap: Map<string, AgentId>; // Maps Letta agent ID -> Ampelos agent ID
  private chatWebRouter?: ChatWebAPIRouter; // Chat web API router (if chat-web module is loaded)
  private adminRouter?: AdminAPIRouter; // Admin API router for agent management
  private agentStore?: AgentStore; // Agent store for global tool operations
  private lettaManager?: LettaManager; // Letta manager for agent operations
  private lettaCoreTools: ToolDefinition[]; // Core Letta tools

  constructor(
    agentRegistry: AgentRegistry,
    serviceManager: ServiceManager,
    modules: Map<string, LoadedModule>,
    options: MCPServerOptions = {}
  ) {
    this.agentRegistry = agentRegistry;
    this.serviceManager = serviceManager;
    this.modules = modules;
    this.lettaAgentIdMap = new Map();
    this.lettaCoreTools = getLettaCoreTools();
    this.mode = options.mode ?? (process.env.MCP_TRANSPORT_MODE as TransportMode) ?? 'http';
    this.httpPort = options.httpPort ?? parseInt(process.env.MCP_HTTP_PORT ?? '3005');

    this.server = new Server(
      {
        name: 'ampelos',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Create appropriate transport based on mode
    if (this.mode === 'http') {
      this.transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode - better for clients that reconnect frequently
        enableJsonResponse: true, // Enable JSON responses for better client compatibility
      });
    } else {
      this.transport = new StdioServerTransport();
    }

    this.setupHandlers();
    this.setupChatWebRouter();
  }

  /**
   * Setup chat web API router if module is loaded
   */
  private async setupChatWebRouter(): Promise<void> {
    try {
      const chatWebModule = this.modules.get('chat-web');
      if (chatWebModule && chatWebModule.loaded) {
        // Dynamically import the router
        const { ChatWebAPIRouter } = await import('../modules/chat-web/api/router.js');
        this.chatWebRouter = new ChatWebAPIRouter(this.agentRegistry, this.serviceManager);
        chatWebLog.info('API router initialized');
      }
    } catch (error) {
      const err = error as Error;
      chatWebLog.error('Failed to initialize API router', { error: err.message });
    }
  }

  /**
   * Set up Admin API router for agent management
   */
  setAdminRouter(
    db: Database,
    store: AgentStore,
    templateRegistry: TemplateRegistry,
    loadedModules: Map<string, LoadedModule>,
    toolManager?: ToolManager
  ): void {
    this.agentStore = store; // Store reference for global tool operations
    this.adminRouter = new AdminAPIRouter(db, store, this.serviceManager, templateRegistry, loadedModules, toolManager);
    adminLog.info('Router initialized');
  }

  /**
   * Serve static files from chat-web dist directory
   */
  private async serveStaticFile(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    try {
      // Check if chat-web module is loaded
      const chatWebModule = this.modules.get('chat-web');
      if (!chatWebModule || !chatWebModule.loaded) {
        chatWebLog.debug('Module not loaded, skipping static file serving');
        return false;
      }

      // Determine file path
      let filePath = req.url || '/';
      if (filePath === '/') {
        filePath = '/index.html';
      }

      // Remove query string and decode URL
      filePath = decodeURIComponent(filePath.split('?')[0]);

      // Construct full path to dist directory
      const distPath = resolve(join(chatWebModule.path, 'web', 'dist'));
      // Normalize and resolve the requested path to prevent directory traversal
      // First strip leading slashes, then normalize and remove any remaining traversal attempts
      const normalizedPath = normalize(filePath.replace(/^\/+/, '')).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = join(distPath, normalizedPath);

      chatWebLog.debug(`Attempting to serve: ${filePath}`, { fullPath, distPath });

      // Security: Ensure the resolved path is within dist directory
      // Use resolve() to get absolute paths and compare them
      if (!fullPath.startsWith(resolve(distPath))) {
        chatWebLog.warn('Path security check failed - path traversal detected', { filePath });
        return false;
      }

      // Check if file exists
      try {
        const stats = await stat(fullPath);
        if (!stats.isFile()) {
          chatWebLog.debug('Path exists but is not a file', { fullPath });
          return false;
        }
      } catch (err) {
        chatWebLog.debug('File not found', { error: err instanceof Error ? err.message : String(err) });
        return false;
      }

      // Read file
      const content = await readFile(fullPath);

      // Determine content type
      const ext = extname(fullPath).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject'
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';

      chatWebLog.debug(`Serving ${filePath} as ${contentType}`);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000'
      });
      res.end(content);
      return true;
    } catch (error) {
      const err = error as Error;
      chatWebLog.error('Error serving static file', { error: err.message });
      return false;
    }
  }

  /**
   * SPA fallback: serve index.html for client-side routing
   * Called when no static file matches the request path
   */
  private async serveSpaFallback(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    try {
      const chatWebModule = this.modules.get('chat-web');
      if (!chatWebModule || !chatWebModule.loaded) {
        return false;
      }

      const distPath = resolve(join(chatWebModule.path, 'web', 'dist'));
      const indexPath = join(distPath, 'index.html');

      // Check if index.html exists
      try {
        const stats = await stat(indexPath);
        if (!stats.isFile()) {
          return false;
        }
      } catch {
        return false;
      }

      const content = await readFile(indexPath);

      chatWebLog.debug(`SPA fallback: serving index.html for ${req.url}`);
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache'
      });
      res.end(content);
      return true;
    } catch (error) {
      const err = error as Error;
      chatWebLog.error('Error serving SPA fallback', { error: err.message });
      return false;
    }
  }

  /**
   * Set the LettaManager instance
   */
  setLettaManager(lettaManager: LettaManager): void {
    this.lettaManager = lettaManager;
  }

  /**
   * Get the LettaManager instance
   */
  getLettaManager(): LettaManager | undefined {
    return this.lettaManager;
  }

  /**
   * Register a Letta agent ID mapping
   * This allows the server to map Letta agent IDs to Ampelos agent IDs
   */
  registerLettaAgent(lettaAgentId: string, ampelosAgentId: AgentId): void {
    this.lettaAgentIdMap.set(lettaAgentId, ampelosAgentId);
    mcpLog.info(`Registered Letta agent ${lettaAgentId} -> Ampelos agent ${ampelosAgentId}`);
  }

  /**
   * Get Ampelos agent ID from Letta agent ID
   */
  private getAmpelosAgentIdFromLetta(lettaAgentId: string): AgentId | undefined {
    return this.lettaAgentIdMap.get(lettaAgentId);
  }

  /**
   * Setup MCP server handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      // Advertise all tools from all loaded modules + core Letta tools
      // Tools are deduplicated by name - each tool is advertised once
      const toolMap = new Map<string, { name: string; description: string; inputSchema: object }>();

      // Add core Letta tools first
      for (const tool of this.lettaCoreTools) {
        toolMap.set(tool.name, {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }

      // Add module tools
      for (const [moduleName, module] of this.modules) {
        if (!module.loaded || !module.tools) continue;
        if (module.manifest.advertise === false) continue;

        for (const tool of module.tools) {
          // Only add if not already present (deduplicate by name)
          if (!toolMap.has(tool.name)) {
            toolMap.set(tool.name, {
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            });
          }
        }
      }

      const tools = Array.from(toolMap.values());
      mcpLog.info(`Returning ${tools.length} tools to client (${this.lettaCoreTools.length} core Letta tools)`);
      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Check if this is a global tool (before agent validation)
      // Global tools can be called without an existing agent context
      const globalTool = this.findGlobalTool(name);
      if (globalTool) {
        mcpLog.info(`Executing global tool: ${name}`);
        try {
          const globalContext = this.createGlobalToolContext();
          // Pass the raw args to the global tool handler
          // Global tools receive GlobalToolContext, so we need to cast the handler
          const handler = globalTool.handler as unknown as (
            params: Record<string, unknown>,
            context: GlobalToolContext
          ) => Promise<ToolResult>;
          const result = await handler((args as Record<string, unknown>) ?? {}, globalContext);
          mcpLog.info(`Global tool ${name} completed`, { isError: result.isError });
          return {
            content: result.content.map((item) => ({
              type: item.type,
              text: item.text,
              data: item.data,
              mimeType: item.mimeType,
              uri: item.uri,
            })),
            isError: result.isError ?? false,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          mcpLog.error(`Global tool ${name} error`, { error: errorMessage });
          return {
            content: [
              {
                type: 'text',
                text: `Error executing global tool ${name}: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }

      // Extract agent_id from request metadata
      let agentId: AgentId | null = null;

      // Strategy 1: Try to extract from args if provided explicitly
      if (args && typeof args === 'object' && 'agent_id' in args) {
        try {
          agentId = createAgentId(args.agent_id as string);
        } catch {
          // Invalid agent_id, will handle below
        }
      }

      // Strategy 2: Try to map from Letta agent ID if provided
      if (!agentId && args && typeof args === 'object' && 'letta_agent_id' in args) {
        const lettaAgentId = args.letta_agent_id as string;
        agentId = await this.findAgentByLettaId(lettaAgentId);
        if (agentId) {
          mcpLog.debug(`Mapped Letta agent ${lettaAgentId} to Ampelos agent ${agentId}`);
        }
      }

      // Strategy 3: If no agent_id found, check if there's only one enabled agent
      if (!agentId) {
        const enabledAgents = this.agentRegistry.getEnabledAgents();

        if (enabledAgents.length === 1) {
          // Only one agent enabled, use it by default
          agentId = enabledAgents[0].agent_id;
          mcpLog.debug(`Defaulting to single enabled agent: ${agentId}`);
        } else if (enabledAgents.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: No enabled agents found',
              },
            ],
            isError: true,
          };
        } else {
          // Multiple agents enabled, cannot determine which to use
          return {
            content: [
              {
                type: 'text',
                text: `Error: Multiple agents enabled (${enabledAgents.map(a => a.agent_id).join(', ')}). Please specify 'agent_id' or 'letta_agent_id' in tool arguments.`,
              },
            ],
            isError: true,
          };
        }
      }

      // Verify agent exists and is enabled
      if (!this.agentRegistry.hasAgent(agentId)) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Agent ${agentId} not found`,
            },
          ],
          isError: true,
        };
      }

      if (!this.agentRegistry.isEnabled(agentId)) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Agent ${agentId} is not enabled`,
            },
          ],
          isError: true,
        };
      }

      // Find the tool in ALL loaded modules (modules are available to all agents)
      let toolHandler: ((params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>) | null = null;
      let toolModule: LoadedModule | null = null;

      for (const [_moduleName, module] of this.modules) {
        if (!module || !module.loaded || !module.tools) continue;

        const tool = module.tools.find(t => t.name === name);
        if (tool) {
          toolHandler = tool.handler;
          toolModule = module;
          break;
        }
      }

      if (!toolHandler) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Tool ${name} not found for agent ${agentId}`,
            },
          ],
          isError: true,
        };
      }

      // Create tool context
      const context = this.createToolContext(agentId, toolModule!.manifest.name);

      try {
        // Lazy-initialize agent for this module's service if needed
        if (toolModule!.manifest.provides.includes('service')) {
          const serviceName = toolModule!.manifest.name;
          try {
            await this.serviceManager.ensureAgentInitialized(agentId, serviceName);
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error initializing service ${serviceName}: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
              isError: true,
            };
          }
        }

        // Call tool handler
        const params = (args as Record<string, unknown>) ?? {};
        mcpLog.info(`Executing tool: ${name} for agent ${agentId}`);
        const result = await toolHandler(params, context);
        mcpLog.info(`Tool ${name} completed`, { isError: result.isError });

        // Convert ToolResult to MCP format
        return {
          content: result.content.map(item => ({
            type: item.type,
            text: item.text,
            data: item.data,
            mimeType: item.mimeType,
            uri: item.uri,
          })),
          isError: result.isError ?? false,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Find Ampelos agent by Letta agent ID
   * Searches through all enabled agents to find which one owns the given Letta agent
   */
  private async findAgentByLettaId(lettaAgentId: string): Promise<AgentId | null> {
    // Use LettaManager to find the agent
    if (!this.lettaManager) {
      return null;
    }

    const enabledAgents = this.agentRegistry.getEnabledAgents();

    for (const agent of enabledAgents) {
      try {
        // Get the Letta agent ID from LettaManager for this agent
        const agentLettaId = this.lettaManager.getLettaAgentId(agent.agent_id);
        if (agentLettaId === lettaAgentId) {
          return agent.agent_id;
        }
      } catch (error) {
        // Agent not initialized yet, skip
        continue;
      }
    }

    return null;
  }

  /**
   * Create tool context for a tool handler
   */
  private createToolContext(agentId: AgentId, moduleName: string): ToolContext {
    return {
      agentId,
      getAgentMetadata: () => {
        const metadata = this.agentRegistry.getAgent(agentId);
        if (!metadata) {
          throw new ServiceError(`Agent ${agentId} not found`, undefined, agentId);
        }
        return metadata;
      },
      getAgentMetadataFor: (targetAgentId: AgentId) => {
        return this.agentRegistry.getAgent(targetAgentId) ?? null;
      },
      getService: <T>(serviceName: string): T => {
        const service = this.serviceManager.getService(serviceName);
        if (!service) {
          throw new ServiceError(
            `Service ${serviceName} not found. Ensure module is loaded.`,
            serviceName,
            agentId
          );
        }
        return service as T;
      },
      hasService: (serviceName: string): boolean => {
        return this.serviceManager.hasService(serviceName);
      },
      isAgentInitialized: (targetAgentId: AgentId, serviceName: string): boolean => {
        return this.serviceManager.isAgentInitialized(targetAgentId, serviceName);
      },
      getLettaManager: () => {
        return this.lettaManager;
      },
    };
  }

  /**
   * Find a global tool by name across core tools and loaded modules
   * Global tools have `global: true` and can be called without agent context
   */
  private findGlobalTool(toolName: string): ToolDefinition | null {
    // Check core Letta tools first
    const coreTool = this.lettaCoreTools.find((t) => t.name === toolName && t.global === true);
    if (coreTool) {
      return coreTool;
    }

    // Check module tools
    for (const [_moduleName, module] of this.modules) {
      if (!module.loaded || !module.tools) continue;

      const tool = module.tools.find((t) => t.name === toolName && t.global === true);
      if (tool) {
        return tool;
      }
    }
    return null;
  }

  /**
   * Create context for global tool handlers
   * Global tools have access to core system components for admin/bootstrap operations
   */
  private createGlobalToolContext(): GlobalToolContext {
    if (!this.agentStore) {
      throw new Error('AgentStore not initialized. Call setAdminRouter before using global tools.');
    }

    return {
      getAgentStore: () => this.agentStore!,
      getServiceManager: () => this.serviceManager,
      getAgentRegistry: () => this.agentRegistry,
      getModuleLoader: () => {
        // Return an object that provides access to loaded modules
        // The actual ModuleLoader isn't stored, but we can provide the modules map
        return {
          getLoadedModules: () =>
            Array.from(this.modules.values()).filter((m) => m.loaded),
        } as any; // Type as any since we're providing a subset of ModuleLoader functionality
      },
      getService: <T>(serviceName: string): T => {
        const service = this.serviceManager.getService(serviceName);
        if (!service) {
          throw new ServiceError(`Service ${serviceName} not found. Ensure module is loaded.`, serviceName);
        }
        return service as T;
      },
      getLettaManager: () => {
        return this.lettaManager;
      },
    };
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.mode === 'http') {
      await this.startHttpServer();
    } else {
      await this.server.connect(this.transport);
      mcpLog.info('Ampelos MCP Server started (stdio mode)');
    }
  }

  /**
   * Authenticate HTTP request using API key
   * Returns true if authenticated, false otherwise
   */
  private authenticateRequest(req: IncomingMessage, res: ServerResponse): boolean {
    const mcpApiKey = process.env.MCP_API_KEY;

    // If no API key is configured, allow all requests (backward compatibility)
    if (!mcpApiKey) {
      return true;
    }

    // Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }));
      return false;
    }

    // Check for Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid Authorization header format. Expected: Bearer <token>' }));
      return false;
    }

    const token = parts[1];
    if (token !== mcpApiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid API key' }));
      return false;
    }

    return true;
  }

  /**
   * Check if request should bypass authentication
   */
  private shouldBypassAuth(req: IncomingMessage): boolean {
    // OPTIONS requests (CORS preflight) bypass auth
    if (req.method === 'OPTIONS') {
      return true;
    }

    // Static file serving (GET requests to non-API paths) bypass auth
    if (req.method === 'GET' && !req.url?.startsWith('/api/')) {
      return true;
    }

    // Chat-web API endpoints bypass auth (served from same origin)
    // These are user-facing endpoints, not MCP tool endpoints
    const url = req.url?.split('?')[0]; // Remove query string
    if (url?.startsWith('/api/agents') || url?.startsWith('/api/admin')) {
      return true;
    }

    return false;
  }

  /**
   * Start HTTP server for HTTP transport mode
   */
  private async startHttpServer(): Promise<void> {
    this.httpServer = createServer(async (req, res) => {
      // Log incoming requests (reduced verbosity)
      httpLog.debug(`${req.method} ${req.url}`);

      // CORS configuration - use environment variable or default to same-origin
      // For development, set MCP_CORS_ORIGIN=http://localhost:3000,http://localhost:5173
      // For production, set specific allowed origins
      const allowedOrigins = process.env.MCP_CORS_ORIGIN?.split(',') || [];
      const origin = req.headers.origin;
      const corsOrigin = allowedOrigins.length > 0 && origin && allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins.length === 0
        ? (origin || '*') // Default: allow same-origin or all if no config (for MCP compatibility)
        : undefined; // Reject if origins configured but request origin not allowed

      if (corsOrigin) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-agent-id');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Authenticate request (unless it should bypass auth)
      if (!this.shouldBypassAuth(req)) {
        if (!this.authenticateRequest(req, res)) {
          return; // Response already sent
        }
      }

      // Parse request body for POST, PUT, and DELETE requests
      let body: unknown;
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const bodyText = Buffer.concat(chunks).toString();
        httpLog.debug('Request body', { body: bodyText });
        try {
          body = bodyText ? JSON.parse(bodyText) : undefined;
        } catch (error) {
          const err = error as Error;
          httpLog.error('JSON parse error', { error: err.message });
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
          return;
        }
      }

      // Route /api/admin/* requests to admin API router
      // Bypass auth for same-origin web interface requests
      if (this.adminRouter && req.url?.startsWith('/api/admin/')) {
        const handled = await this.adminRouter.route(req, res, body, true);
        if (handled) {
          return;
        }
      }

      // Route other /api/* requests to chat web router
      if (this.chatWebRouter && req.url?.startsWith('/api/')) {
        const handled = await this.chatWebRouter.route(req, res, body);
        if (handled) {
          return;
        }
      }

      // Try to serve static files for non-MCP requests (GET requests without /api or /mcp path)
      if (req.method === 'GET' && !req.url?.startsWith('/api/') && !req.url?.startsWith('/mcp')) {
        const served = await this.serveStaticFile(req, res);
        if (served) {
          return;
        }

        // SPA fallback: serve index.html for unmatched routes (client-side routing)
        const indexServed = await this.serveSpaFallback(req, res);
        if (indexServed) {
          return;
        }
      }

      // Only handle MCP requests on /mcp path
      if (!req.url?.startsWith('/mcp')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      // Extract Letta agent ID from x-agent-id header and map to Ampelos agent ID
      const lettaAgentId = req.headers['x-agent-id'] as string | undefined;
      if (lettaAgentId && body && typeof body === 'object') {
        const mcpRequest = body as any;
        // Check if this is a tool call request
        if (mcpRequest.method === 'tools/call' && mcpRequest.params) {
          // Map Letta agent ID to Ampelos agent ID
          const ampelosAgentId = this.getAmpelosAgentIdFromLetta(lettaAgentId);
          if (ampelosAgentId) {
            // Inject agent_id into arguments if not already present
            if (!mcpRequest.params.arguments) {
              mcpRequest.params.arguments = {};
            }
            if (!mcpRequest.params.arguments.agent_id) {
              mcpRequest.params.arguments.agent_id = ampelosAgentId;
              httpLog.debug(`Mapped Letta agent ${lettaAgentId} -> Ampelos agent ${ampelosAgentId}`);
            }
          } else {
            httpLog.warn(`Letta agent ${lettaAgentId} not registered with Ampelos MCP server`);
          }
        }
      }

      // Ensure Accept header includes both application/json and text/event-stream
      // This is required by the MCP SDK's StreamableHTTPServerTransport
      if (!req.headers.accept || !req.headers.accept.includes('text/event-stream')) {
        const currentAccept = req.headers.accept || '';
        const acceptParts = currentAccept.split(',').map(s => s.trim()).filter(Boolean);

        // Add missing content types
        if (!acceptParts.includes('application/json')) {
          acceptParts.push('application/json');
        }
        if (!acceptParts.includes('text/event-stream')) {
          acceptParts.push('text/event-stream');
        }

        req.headers.accept = acceptParts.join(', ');
      }

      // Handle request with transport
      if (this.transport instanceof StreamableHTTPServerTransport) {
        try {
          await this.transport.handleRequest(req, res, body);
        } catch (error) {
          const err = error as Error;
          httpLog.error('Error handling request', {
            error: err.message,
            method: req.method,
            url: req.url,
          });
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Internal server error',
              message: err.message
            }));
          }
        }
      }
    });

    await this.server.connect(this.transport);

    this.httpServer.listen(this.httpPort, () => {
      mcpLog.info(`Ampelos MCP Server started (HTTP mode) on port ${this.httpPort}`);
      mcpLog.info(`MCP endpoint: http://localhost:${this.httpPort}/mcp`);
    });
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    // Close HTTP server if running
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
    }

    // Cleanup will be handled by process exit
  }
}
