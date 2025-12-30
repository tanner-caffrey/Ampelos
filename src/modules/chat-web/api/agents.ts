/**
 * Agents API Handler
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentRegistry } from '../../../core/agent-registry.js';
import type { ServiceManager } from '../../../core/service-manager.js';
import { createAgentId } from '../../../types/agent.js';
import { createComponentLogger } from '../../../core/logger.js';

const log = createComponentLogger('AgentsAPI');

export interface AgentInfo {
  agent_id: string;
  agent_name: string;
  enabled: boolean;
  has_letta: boolean;
  letta_agent_id?: string;
  letta_model?: string;
}

export class AgentsAPIHandler {
  constructor(
    private agentRegistry: AgentRegistry,
    private serviceManager: ServiceManager
  ) {}

  /**
   * Handle GET /api/agents - List all agents
   */
  async handleListAgents(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const enabledAgents = this.agentRegistry.getEnabledAgents();

      const agents: AgentInfo[] = [];

      const lettaManager = this.serviceManager.getLettaManager?.();

      for (const agent of enabledAgents) {
        let lettaAgentId: string | undefined;
        let lettaModel: string | undefined;

        if (lettaManager) {
          try {
            lettaAgentId = lettaManager.getLettaAgentId(agent.agent_id);
            if (lettaAgentId) {
              const agentInfo = await lettaManager.getAgentInfo(agent.agent_id);
              if (agentInfo && agentInfo.model) {
                lettaModel = agentInfo.model;
              }
            }
          } catch (error) {
            // LettaManager not initialized yet
          }
        }

        agents.push({
          agent_id: agent.agent_id,
          agent_name: agent.agent_name,
          enabled: true,
          has_letta: !!lettaAgentId,
          letta_agent_id: lettaAgentId,
          letta_model: lettaModel
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agents }));
    } catch (error) {
      log.error('Error listing agents', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to list agents',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle GET /api/agents/:agentId - Get agent details
   */
  async handleGetAgent(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
    try {
      const agent = this.agentRegistry.getAgent(createAgentId(agentId));

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      const lettaManager = this.serviceManager.getLettaManager?.();
      let lettaAgentId: string | undefined;
      let lettaModel: string | undefined;

      if (lettaManager) {
        try {
          lettaAgentId = lettaManager.getLettaAgentId(agent.agent_id);
          if (lettaAgentId) {
            const info = await lettaManager.getAgentInfo(agent.agent_id);
            if (info && info.model) {
              lettaModel = info.model;
            }
          }
        } catch (error) {
          // LettaManager not initialized yet
        }
      }

      const agentInfo: AgentInfo = {
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        enabled: this.agentRegistry.isEnabled(createAgentId(agentId)),
        has_letta: !!lettaAgentId,
        letta_agent_id: lettaAgentId,
        letta_model: lettaModel
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(agentInfo));
    } catch (error) {
      log.error('Error getting agent', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to get agent',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle GET /api/agents/:agentId/models - List available models
   */
  async handleListModels(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
    try {
      const agent = this.agentRegistry.getAgent(createAgentId(agentId));

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      const lettaManager = this.serviceManager.getLettaManager?.();
      if (!lettaManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LettaManager not available' }));
        return;
      }

      try {
        // List models from the agent's backend (cloud or self-hosted)
        const backend = lettaManager.getAgentBackend(agent.agent_id);
        const models = await lettaManager.listModels(backend);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models }));
      } catch (error) {
        log.error('Error listing models', { error: error instanceof Error ? error.message : String(error) });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to list models',
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    } catch (error) {
      log.error('Error listing models', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to list models',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle POST /api/agents/:agentId/model - Update agent model
   */
  async handleUpdateModel(req: IncomingMessage, res: ServerResponse, agentId: string, body: unknown): Promise<void> {
    try {
      const agent = this.agentRegistry.getAgent(createAgentId(agentId));

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      const request = body as { model?: string };
      if (!request.model) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Model is required' }));
        return;
      }

      const lettaManager = this.serviceManager.getLettaManager?.();
      if (!lettaManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LettaManager not available' }));
        return;
      }

      try {
        await lettaManager.updateAgentModel(agent.agent_id, request.model);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, model: request.model }));
      } catch (error) {
        log.error('Error updating model', { error: error instanceof Error ? error.message : String(error) });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to update model',
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    } catch (error) {
      log.error('Error updating model', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to update model',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle POST /api/agents/:agentId/messages/clear - Clear agent messages
   */
  async handleClearMessages(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
    try {
      const agent = this.agentRegistry.getAgent(createAgentId(agentId));

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      const lettaManager = this.serviceManager.getLettaManager?.();
      if (!lettaManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LettaManager not available' }));
        return;
      }

      try {
        await lettaManager.clearMessages(agent.agent_id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        log.error('Error clearing messages', { error: error instanceof Error ? error.message : String(error) });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to clear messages',
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    } catch (error) {
      log.error('Error clearing messages', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to clear messages',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle GET /api/agents/:agentId/llm-config - Get LLM configuration
   */
  async handleGetLLMConfig(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
    try {
      const agent = this.agentRegistry.getAgent(createAgentId(agentId));

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      const lettaManager = this.serviceManager.getLettaManager?.();
      if (!lettaManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LettaManager not available' }));
        return;
      }

      try {
        const config = await lettaManager.getLLMConfig(agent.agent_id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(config));
      } catch (error) {
        log.error('Error getting LLM config', { error: error instanceof Error ? error.message : String(error) });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to get LLM config',
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    } catch (error) {
      log.error('Error getting LLM config', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to get LLM config',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle PUT /api/agents/:agentId/llm-config - Update LLM configuration
   */
  async handleUpdateLLMConfig(req: IncomingMessage, res: ServerResponse, agentId: string, body: unknown): Promise<void> {
    try {
      const agent = this.agentRegistry.getAgent(createAgentId(agentId));

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      const lettaManager = this.serviceManager.getLettaManager?.();
      if (!lettaManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LettaManager not available' }));
        return;
      }

      const request = body as {
        model?: string;
        embedding?: string;
        context_window_limit?: number;
        enable_sleeptime?: boolean;
        system?: string;
      };

      try {
        await lettaManager.updateLLMConfig(agent.agent_id, request);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        log.error('Error updating LLM config', { error: error instanceof Error ? error.message : String(error) });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to update LLM config',
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    } catch (error) {
      log.error('Error updating LLM config', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to update LLM config',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle GET /api/agents/:agentId/letta-tools - Get tools attached to Letta agent
   */
  async handleGetLettaTools(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
    try {
      const agent = this.agentRegistry.getAgent(createAgentId(agentId));

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      const lettaManager = this.serviceManager.getLettaManager?.();
      if (!lettaManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LettaManager not available' }));
        return;
      }

      try {
        // List tools from the agent's backend (cloud or self-hosted)
        const backend = lettaManager.getAgentBackend(agent.agent_id);
        const attachedTools = await lettaManager.listAgentTools(agent.agent_id);
        const allTools = await lettaManager.listAllTools(backend);

        // Create a map of all tools for looking up descriptions
        const toolMap = new Map(allTools.map(t => [t.id, t]));

        // Enrich attached tools with descriptions
        const enrichedTools = attachedTools.map(tool => ({
          id: tool.id,
          name: tool.name,
          description: toolMap.get(tool.id)?.description || ''
        }));

        // Get unattached tools
        const attachedIds = new Set(attachedTools.map(t => t.id));
        const unattachedTools = allTools.filter(t => !attachedIds.has(t.id));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          attached: enrichedTools,
          available: unattachedTools
        }));
      } catch (error) {
        log.error('Error getting Letta tools', { error: error instanceof Error ? error.message : String(error) });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to get Letta tools',
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    } catch (error) {
      log.error('Error getting Letta tools', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to get Letta tools',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle POST /api/agents/:agentId/letta-tools/:toolId - Attach tool to Letta agent
   */
  async handleAttachLettaTool(req: IncomingMessage, res: ServerResponse, agentId: string, toolId: string): Promise<void> {
    try {
      const agent = this.agentRegistry.getAgent(createAgentId(agentId));

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      const lettaManager = this.serviceManager.getLettaManager?.();
      if (!lettaManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LettaManager not available' }));
        return;
      }

      try {
        await lettaManager.attachTool(agent.agent_id, toolId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        log.error('Error attaching Letta tool', { error: error instanceof Error ? error.message : String(error) });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to attach tool',
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    } catch (error) {
      log.error('Error attaching Letta tool', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to attach tool',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle DELETE /api/agents/:agentId/letta-tools/:toolId - Detach tool from Letta agent
   */
  async handleDetachLettaTool(req: IncomingMessage, res: ServerResponse, agentId: string, toolId: string): Promise<void> {
    try {
      const agent = this.agentRegistry.getAgent(createAgentId(agentId));

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      const lettaManager = this.serviceManager.getLettaManager?.();
      if (!lettaManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LettaManager not available' }));
        return;
      }

      try {
        await lettaManager.detachTool(agent.agent_id, toolId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        log.error('Error detaching Letta tool', { error: error instanceof Error ? error.message : String(error) });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to detach tool',
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    } catch (error) {
      log.error('Error detaching Letta tool', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to detach tool',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }
}
