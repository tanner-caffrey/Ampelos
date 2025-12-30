/**
 * Conversations API Handler
 *
 * Handles HTTP requests for multi-agent conversations using Letta Groups
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentRegistry } from '../../../core/agent-registry.js';
import type { ServiceManager } from '../../../core/service-manager.js';
import { createAgentId } from '../../../types/agent.js';
import type { GroupManagerType } from '../../../core/letta/letta-client.js';
import type {
  CreateConversationRequest,
  SendConversationMessageRequest,
  AddParticipantRequest
} from '../../multi-agent-chat/types.js';
import type MultiAgentChatService from '../../multi-agent-chat/service.js';
import { createComponentLogger } from '../../../core/logger.js';

const log = createComponentLogger('ConversationsAPI');

export interface CreateConversationAPIRequest {
  name: string;
  description?: string;
  participants: string[]; // Agent IDs
  manager_type?: GroupManagerType;
}

export interface SendConversationMessageAPIRequest {
  text: string;
}

export interface AddParticipantAPIRequest {
  agent_id: string;
}

export class ConversationsAPIHandler {
  constructor(
    private agentRegistry: AgentRegistry,
    private serviceManager: ServiceManager
  ) {}

  /**
   * Get multi-agent-chat service (singleton)
   */
  private async getMultiAgentChatService(): Promise<MultiAgentChatService> {
    // Get the service singleton
    let service = this.serviceManager.getService('multi-agent-chat') as MultiAgentChatService;

    if (!service) {
      throw new Error('Multi-agent-chat service not available');
    }

    // Ensure ServiceManager is set
    if (typeof (service as any).setServiceManager === 'function') {
      (service as any).setServiceManager(this.serviceManager, this.agentRegistry);
    }

    return service;
  }

  /**
   * Handle POST /api/conversations - Create conversation
   */
  async handleCreateConversation(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown
  ): Promise<void> {
    try {
      const request = body as CreateConversationAPIRequest;

      if (!request.name || typeof request.name !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation name is required' }));
        return;
      }

      // Input validation: enforce maximum conversation name length
      const MAX_NAME_LENGTH = 200;
      if (request.name.length > MAX_NAME_LENGTH) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Conversation name exceeds maximum length of ${MAX_NAME_LENGTH} characters` }));
        return;
      }

      if (!request.participants || !Array.isArray(request.participants) || request.participants.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'At least one participant is required' }));
        return;
      }

      // Validate all participants exist and are enabled
      const participantIds = request.participants.map(id => createAgentId(id));
      for (const agentId of participantIds) {
        const agent = this.agentRegistry.getAgent(agentId);
        if (!agent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Agent ${agentId} not found` }));
          return;
        }
        if (!this.agentRegistry.isEnabled(agentId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Agent ${agentId} is not enabled` }));
          return;
        }
        // Note: Letta is now core infrastructure, available to all agents
      }

      const service = await this.getMultiAgentChatService();
      const createRequest: CreateConversationRequest = {
        name: request.name,
        description: request.description,
        participants: participantIds,
        manager_type: request.manager_type
      };

      const conversation = await service.createConversation(
        createRequest,
        'user' // TODO: Get actual user ID from session/auth
      );

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversation }));
    } catch (error) {
      log.error('Error creating conversation', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to create conversation',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle GET /api/conversations - List conversations
   */
  async handleListConversations(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const service = await this.getMultiAgentChatService();
      const conversations = await service.listConversations();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversations }));
    } catch (error) {
      log.error('Error listing conversations', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to list conversations',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle GET /api/conversations/:conversationId - Get conversation
   */
  async handleGetConversation(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string
  ): Promise<void> {
    try {
      const service = await this.getMultiAgentChatService();
      const conversation = await service.getConversation(conversationId);

      if (!conversation) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation not found' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversation }));
    } catch (error) {
      log.error('Error getting conversation', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to get conversation',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle POST /api/conversations/:conversationId/messages - Send message
   */
  async handleSendMessage(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string,
    body: unknown
  ): Promise<void> {
    try {
      const request = body as SendConversationMessageAPIRequest;

      if (!request.text || typeof request.text !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Message text is required' }));
        return;
      }

      // Input validation: enforce maximum message length
      const MAX_MESSAGE_LENGTH = 1024 * 1024; // 1MB
      if (request.text.length > MAX_MESSAGE_LENGTH) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Message text exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` }));
        return;
      }

      const service = await this.getMultiAgentChatService();
      const messages = await service.sendMessage(conversationId, { text: request.text });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages }));
    } catch (error) {
      log.error('Error sending message', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to send message',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle GET /api/conversations/:conversationId/messages - Get messages
   */
  async handleGetMessages(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string
  ): Promise<void> {
    try {
      const service = await this.getMultiAgentChatService();

      // First check if conversation exists
      const conversation = await service.getConversation(conversationId);
      if (!conversation) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation not found' }));
        return;
      }

      // Get messages from Letta Group
      const messages = await service.getMessages(conversationId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages }));
    } catch (error) {
      log.error('Error getting messages', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to get messages',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle POST /api/conversations/:conversationId/participants - Add participant
   */
  async handleAddParticipant(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string,
    body: unknown
  ): Promise<void> {
    try {
      const request = body as AddParticipantAPIRequest;

      if (!request.agent_id || typeof request.agent_id !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent ID is required' }));
        return;
      }

      const agentId = createAgentId(request.agent_id);
      const agent = this.agentRegistry.getAgent(agentId);
      if (!agent || !this.agentRegistry.isEnabled(agentId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found or not enabled' }));
        return;
      }

      const service = await this.getMultiAgentChatService();
      const conversation = await service.addParticipant(conversationId, { agent_id: agentId });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversation }));
    } catch (error) {
      log.error('Error adding participant', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to add participant',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle DELETE /api/conversations/:conversationId/participants/:agentId - Remove participant
   */
  async handleRemoveParticipant(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string,
    agentId: string
  ): Promise<void> {
    try {
      const typedAgentId = createAgentId(agentId);
      const service = await this.getMultiAgentChatService();
      const conversation = await service.removeParticipant(conversationId, typedAgentId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversation }));
    } catch (error) {
      log.error('Error removing participant', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to remove participant',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  /**
   * Handle DELETE /api/conversations/:conversationId - Delete conversation
   */
  async handleDeleteConversation(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string
  ): Promise<void> {
    try {
      const service = await this.getMultiAgentChatService();
      await service.deleteConversation(conversationId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      log.error('Error deleting conversation', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to delete conversation',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }
}
