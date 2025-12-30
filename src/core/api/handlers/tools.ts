/**
 * Tools API Handler
 *
 * Handles tool listing and agent-tool attachment management
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ToolManager } from '../../tool-manager.js';
import type { AgentStore } from '../../agent-store.js';
import { createComponentLogger } from '../../logger.js';

const log = createComponentLogger('ToolHandler');

export class ToolsAPIHandler {
  constructor(
    private toolManager: ToolManager,
    private agentStore: AgentStore
  ) {}

  /**
   * Handle GET /api/admin/tools - List all available tools
   */
  async handleListTools(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const tools = this.toolManager.listAvailableTools();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tools }));
    } catch (error) {
      log.error('Error listing tools', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list tools',
      }));
    }
  }

  /**
   * Handle GET /api/admin/modules/:moduleName/tools - List tools from a module
   */
  async handleListModuleTools(
    req: IncomingMessage,
    res: ServerResponse,
    moduleName: string
  ): Promise<void> {
    try {
      const tools = this.toolManager.getModuleTools(moduleName);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tools }));
    } catch (error) {
      log.error('Error listing module tools', { moduleName, error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list module tools',
      }));
    }
  }

  /**
   * Handle GET /api/admin/agents/:agentId/tools - List tools attached to an agent
   */
  async handleListAgentTools(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string
  ): Promise<void> {
    try {
      // Verify agent exists
      const agent = await this.agentStore.getAgent(agentId);
      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Agent not found' }));
        return;
      }

      const tools = await this.toolManager.getAgentToolsWithInfo(agentId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tools }));
    } catch (error) {
      log.error('Error listing agent tools', { agentId, error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list agent tools',
      }));
    }
  }

  /**
   * Handle POST /api/admin/agents/:agentId/tools/:toolId - Attach tool to agent
   */
  async handleAttachTool(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    toolId: string
  ): Promise<void> {
    try {
      // Verify agent exists
      const agent = await this.agentStore.getAgent(agentId);
      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Agent not found' }));
        return;
      }

      const attachment = await this.toolManager.attachTool(agentId, toolId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, attachment }));
    } catch (error) {
      log.error('Error attaching tool', { agentId, toolId, error: error instanceof Error ? error.message : String(error) });
      const statusCode = (error as Error).message.includes('not found') ? 404 :
                         (error as Error).message.includes('already attached') ? 409 : 500;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to attach tool',
      }));
    }
  }

  /**
   * Handle DELETE /api/admin/agents/:agentId/tools/:toolId - Detach tool from agent
   */
  async handleDetachTool(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    toolId: string
  ): Promise<void> {
    try {
      // Verify agent exists
      const agent = await this.agentStore.getAgent(agentId);
      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Agent not found' }));
        return;
      }

      await this.toolManager.detachTool(agentId, toolId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      log.error('Error detaching tool', { agentId, toolId, error: error instanceof Error ? error.message : String(error) });
      const statusCode = (error as Error).message.includes('not attached') ? 404 : 500;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to detach tool',
      }));
    }
  }
}
