/**
 * Tool Manager - handles tool listing and agent-tool associations
 *
 * Tools in Ampelos come from two sources:
 * 1. MCP tools - run in Ampelos, defined in module tool.ts files
 * 2. Letta tools - run on Letta server, defined as lettaTools in module tool.ts files
 */

import type { Database, ToolAttachmentRow } from './database.js';
import type { ModuleLoader } from './module-loader.js';
import type { ToolDefinition, LettaToolDefinition } from '../types/tool.js';

/**
 * Unified tool info for both MCP and Letta tools
 */
export interface ToolInfo {
  // Unique tool identifier (moduleName:toolName)
  tool_id: string;
  // Tool name
  name: string;
  // Tool description
  description: string;
  // Module that provides this tool
  module_name: string;
  // Whether this is a Letta tool (runs on Letta server) vs MCP tool
  is_letta_tool: boolean;
  // Input schema (for MCP tools)
  input_schema?: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Tool attachment record (compatible with database row)
 */
export interface ToolAttachment {
  tool_id: string;
  module_name: string;
  tool_name: string;
  is_letta_tool: boolean;
  attached_at: string;
}

/**
 * Tool Manager class
 */
export class ToolManager {
  constructor(
    private db: Database,
    private moduleLoader: ModuleLoader
  ) {}

  /**
   * List all available tools from all loaded modules
   */
  listAvailableTools(): ToolInfo[] {
    const tools: ToolInfo[] = [];
    const modules = this.moduleLoader.getAllModules();

    for (const [moduleName, module] of modules) {
      if (!module.loaded) continue;

      // Add MCP tools
      if (module.tools) {
        for (const tool of module.tools) {
          tools.push({
            tool_id: `${moduleName}:${tool.name}`,
            name: tool.name,
            description: tool.description,
            module_name: moduleName,
            is_letta_tool: false,
            input_schema: tool.inputSchema,
          });
        }
      }

      // Add Letta tools
      if (module.lettaTools) {
        for (const tool of module.lettaTools) {
          const toolName = tool.name || this.extractFunctionName(tool.source_code);
          tools.push({
            tool_id: `${moduleName}:${toolName}`,
            name: toolName,
            description: tool.description || 'Letta Python tool',
            module_name: moduleName,
            is_letta_tool: true,
          });
        }
      }
    }

    return tools;
  }

  /**
   * List tools provided by a specific module
   */
  getModuleTools(moduleName: string): ToolInfo[] {
    const module = this.moduleLoader.getModule(moduleName);
    if (!module || !module.loaded) return [];

    const tools: ToolInfo[] = [];

    // Add MCP tools
    if (module.tools) {
      for (const tool of module.tools) {
        tools.push({
          tool_id: `${moduleName}:${tool.name}`,
          name: tool.name,
          description: tool.description,
          module_name: moduleName,
          is_letta_tool: false,
          input_schema: tool.inputSchema,
        });
      }
    }

    // Add Letta tools
    if (module.lettaTools) {
      for (const tool of module.lettaTools) {
        const toolName = tool.name || this.extractFunctionName(tool.source_code);
        tools.push({
          tool_id: `${moduleName}:${toolName}`,
          name: toolName,
          description: tool.description || 'Letta Python tool',
          module_name: moduleName,
          is_letta_tool: true,
        });
      }
    }

    return tools;
  }

  /**
   * List tools attached to an agent
   */
  async listAgentTools(agentId: string): Promise<ToolAttachment[]> {
    const rows = this.db.getToolAttachments(agentId);
    return rows.map(row => this.rowToAttachment(row));
  }

  /**
   * Attach a tool to an agent
   */
  async attachTool(agentId: string, toolId: string): Promise<ToolAttachment> {
    // Parse tool ID
    const [moduleName, toolName] = toolId.split(':');
    if (!moduleName || !toolName) {
      throw new Error(`Invalid tool ID format: ${toolId}. Expected format: moduleName:toolName`);
    }

    // Verify tool exists
    const moduleTools = this.getModuleTools(moduleName);
    const tool = moduleTools.find(t => t.tool_id === toolId);
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }

    // Check if already attached
    const existing = this.db.getToolAttachments(agentId);
    if (existing.some(t => t.tool_id === toolId)) {
      throw new Error(`Tool ${toolId} is already attached to agent ${agentId}`);
    }

    const attachment: ToolAttachmentRow = {
      agent_id: agentId,
      tool_id: toolId,
      module_name: moduleName,
      tool_name: toolName,
      is_letta_tool: tool.is_letta_tool ? 1 : 0,
      attached_at: new Date().toISOString(),
    };

    this.db.attachTool(attachment);

    return this.rowToAttachment(attachment);
  }

  /**
   * Detach a tool from an agent
   */
  async detachTool(agentId: string, toolId: string): Promise<void> {
    const existing = this.db.getToolAttachments(agentId);
    if (!existing.some(t => t.tool_id === toolId)) {
      throw new Error(`Tool ${toolId} is not attached to agent ${agentId}`);
    }

    const removed = this.db.detachTool(agentId, toolId);
    if (!removed) {
      throw new Error(`Failed to detach tool ${toolId} from agent ${agentId}`);
    }
  }

  /**
   * Get tools attached to an agent with full tool info
   */
  async getAgentToolsWithInfo(agentId: string): Promise<(ToolAttachment & ToolInfo)[]> {
    const attachments = await this.listAgentTools(agentId);
    const allTools = this.listAvailableTools();

    return attachments.map(attachment => {
      const toolInfo = allTools.find(t => t.tool_id === attachment.tool_id);
      return {
        ...attachment,
        name: toolInfo?.name || attachment.tool_name,
        description: toolInfo?.description || 'Tool no longer available',
        input_schema: toolInfo?.input_schema,
      };
    });
  }

  /**
   * Extract function name from Python source code
   */
  private extractFunctionName(sourceCode: string): string {
    const match = sourceCode.match(/def\s+(\w+)\s*\(/);
    return match ? match[1] : 'unknown_tool';
  }

  /**
   * Convert database row to ToolAttachment
   */
  private rowToAttachment(row: ToolAttachmentRow): ToolAttachment {
    return {
      tool_id: row.tool_id,
      module_name: row.module_name,
      tool_name: row.tool_name,
      is_letta_tool: Boolean(row.is_letta_tool),
      attached_at: row.attached_at,
    };
  }
}
