/**
 * Memory API Handler
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentRegistry } from '../../../core/agent-registry.js';
import type { ServiceManager } from '../../../core/service-manager.js';
import { lettaManager } from '../../../core/letta/index.js';
import { createAgentId } from '../../../types/agent.js';
import { createComponentLogger } from '../../../core/logger.js';

const log = createComponentLogger('MemoryAPI');

export interface MemoryBlock {
  id: string;
  label: string;
  value: string;
  limit: number;
  template_name?: string;
}

export interface MemoryResponse {
  blocks: MemoryBlock[];
}

export class MemoryAPIHandler {
  constructor(
    private agentRegistry: AgentRegistry,
    private serviceManager: ServiceManager
  ) {}

  /**
   * Handle GET /api/agents/:agentId/memory - Get agent memory blocks
   */
  async handleGetMemory(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string
  ): Promise<void> {
    try {
      log.debug('Getting memory for agent', { agentId });
      const typedAgentId = createAgentId(agentId);

      // Validate agent exists
      const agent = this.agentRegistry.getAgent(typedAgentId);
      if (!agent) {
        log.debug('Agent not found', { agentId });
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      // Get Letta agent ID
      const lettaAgentId = lettaManager.getLettaAgentId(typedAgentId);
      log.debug('Letta agent ID retrieved', { agentId, lettaAgentId });

      if (!lettaAgentId) {
        log.debug('No Letta agent ID', { agentId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ blocks: [] }));
        return;
      }

      // Get memory blocks from Letta
      log.debug('Fetching memory blocks from Letta');
      const letta = lettaManager.getAgentContext(typedAgentId);
      if (!letta) {
        log.debug('No Letta context', { agentId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ blocks: [] }));
        return;
      }
      const lettaBlocks = await letta.getMemoryBlocks();
      log.debug('Letta returned blocks', { count: lettaBlocks?.length || 0 });

      const blocks: MemoryBlock[] = [];

      if (lettaBlocks && Array.isArray(lettaBlocks)) {
        for (const block of lettaBlocks) {
          blocks.push({
            id: block.id || block.label || 'unknown',
            label: block.label || 'Unknown',
            value: block.value || '',
            limit: block.limit || 0
          });
        }
      }

      log.debug('Returning blocks to frontend', { count: blocks.length });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ blocks }));
    } catch (error) {
      log.error('Error getting memory', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to get memory',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle POST /api/agents/:agentId/memory/:blockId - Update memory block
   */
  async handleUpdateMemory(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    blockId: string,
    body: unknown
  ): Promise<void> {
    try {
      const typedAgentId = createAgentId(agentId);

      // Validate agent exists
      const agent = this.agentRegistry.getAgent(typedAgentId);
      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      // Parse request body
      const request = body as { value: string };
      if (!request.value || typeof request.value !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Value is required' }));
        return;
      }

      // Update memory block using LettaManager (routes to correct backend)
      await lettaManager.updateMemory(typedAgentId, blockId, request.value);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      log.error('Error updating memory', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to update memory',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle POST /api/agents/:agentId/memory - Create a new memory block
   */
  async handleCreateMemory(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    body: unknown
  ): Promise<void> {
    try {
      const typedAgentId = createAgentId(agentId);

      // Validate agent exists
      const agent = this.agentRegistry.getAgent(typedAgentId);
      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      // Parse request body
      const request = body as { label: string; value: string; limit?: number };
      if (!request.label || typeof request.label !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Label is required' }));
        return;
      }
      if (typeof request.value !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Value must be a string' }));
        return;
      }

      // Get Letta agent context and add memory block
      const letta = lettaManager.getAgentContext(typedAgentId);
      if (!letta) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Letta agent not available' }));
        return;
      }
      const blockId = await letta.addMemoryBlock(request.label, request.value, request.limit);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, blockId }));
    } catch (error) {
      log.error('Error creating memory block', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to create memory block',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle DELETE /api/agents/:agentId/memory/:blockId - Remove a memory block
   */
  async handleDeleteMemory(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    blockId: string
  ): Promise<void> {
    try {
      const typedAgentId = createAgentId(agentId);

      // Validate agent exists
      const agent = this.agentRegistry.getAgent(typedAgentId);
      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      // Get Letta agent context and remove memory block
      const letta = lettaManager.getAgentContext(typedAgentId);
      if (!letta) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Letta agent not available' }));
        return;
      }
      await letta.removeMemoryBlock(blockId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      log.error('Error deleting memory block', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to delete memory block',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }
}
