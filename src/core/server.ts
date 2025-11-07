/**
 * MCP Server implementation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { AgentId } from '../types/agent.js';
import type { ToolContext, ToolResult } from '../types/tool.js';
import type { LoadedModule } from '../types/module.js';
import { createAgentId } from '../types/agent.js';
import { ServiceError } from '../types/errors.js';
import { AgentRegistry } from './agent-registry.js';
import { ServiceManager } from './service-manager.js';

/**
 * MCP Server class
 */
export class MCPServer {
  private server: Server;
  private agentRegistry: AgentRegistry;
  private serviceManager: ServiceManager;
  private modules: Map<string, LoadedModule>;
  private transport: StdioServerTransport;

  constructor(
    agentRegistry: AgentRegistry,
    serviceManager: ServiceManager,
    modules: Map<string, LoadedModule>
  ) {
    this.agentRegistry = agentRegistry;
    this.serviceManager = serviceManager;
    this.modules = modules;
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
    this.transport = new StdioServerTransport();
    this.setupHandlers();
  }

  /**
   * Setup MCP server handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      // Extract agent_id from request metadata/headers
      // Note: MCP SDK may not expose headers directly, so we'll need to handle this
      // For now, we'll list all tools for all enabled agents
      // In production, this should filter by agent_id from request context
      
      const tools = [];
      const enabledAgents = this.agentRegistry.getEnabledAgents();

      for (const agent of enabledAgents) {
        for (const moduleName of agent.modules) {
          const module = this.modules.get(moduleName);
          if (!module || !module.loaded || !module.tools) continue;
          if (module.manifest.advertise === false) continue;

          for (const tool of module.tools) {
            tools.push({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            });
          }
        }
      }

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Extract agent_id from request metadata
      // For now, we'll try to get it from args or use a default
      // In production, this should come from MCP request headers/metadata
      let agentId: AgentId | null = null;

      // Try to extract from args if provided
      if (args && typeof args === 'object' && 'agent_id' in args) {
        try {
          agentId = createAgentId(args.agent_id as string);
        } catch {
          // Invalid agent_id, will handle below
        }
      }

      // If no agent_id in args, we need to get it from request context
      // This is a limitation - MCP SDK may need custom transport to pass headers
      // For now, return error if agent_id not provided
      if (!agentId) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: agent_id must be provided in tool arguments or request headers',
            },
          ],
          isError: true,
        };
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

      // Update last request time
      await this.agentRegistry.updateLastRequestTime(agentId);

      // Find the tool
      let toolHandler: ((params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>) | null = null;
      let toolModule: LoadedModule | null = null;

      const agent = this.agentRegistry.getAgent(agentId);
      if (!agent) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Agent ${agentId} metadata not found`,
            },
          ],
          isError: true,
        };
      }

      for (const moduleName of agent.modules) {
        const module = this.modules.get(moduleName);
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
        // Initialize service if needed (lazy initialization)
        if (toolModule!.manifest.provides.includes('service')) {
          const serviceName = toolModule!.manifest.name;
          
          if (!this.serviceManager.hasService(agentId, serviceName)) {
            // Check if service should be lazy-initialized
            // Default to lazy=true, so initialize on first tool call
            try {
              await this.serviceManager.initializeService(agentId, serviceName);
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
        }

        // Call tool handler
        const params = (args as Record<string, unknown>) ?? {};
        const result = await toolHandler(params, context);

        // Update last response time
        await this.agentRegistry.updateLastResponseTime(agentId);

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
        // Update last response time even on error
        await this.agentRegistry.updateLastResponseTime(agentId);

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
      getService: <T>(serviceName: string): T => {
        const service = this.serviceManager.getService(agentId, serviceName);
        if (!service) {
          // Try to initialize if module provides service and lazy is true
          // This is a synchronous context, so we can't await
          // Services should be initialized before tool calls
          throw new ServiceError(
            `Service ${serviceName} not initialized for agent ${agentId}. Ensure service is initialized before calling tool.`,
            serviceName,
            agentId
          );
        }
        return service as T;
      },
      hasService: (serviceName: string): boolean => {
        return this.serviceManager.hasService(agentId, serviceName);
      },
    };
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    await this.server.connect(this.transport);
    console.log('Ampelos MCP Server started');
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    // Persist all service states before shutdown
    await this.serviceManager.persistAllStates();
    // Cleanup will be handled by process exit
  }
}

