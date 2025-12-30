/**
 * Chat Web API Router
 *
 * Routes HTTP requests to the appropriate handlers
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentRegistry } from '../../../core/agent-registry.js';
import type { ServiceManager } from '../../../core/service-manager.js';
import { createComponentLogger } from '../../../core/logger.js';

const log = createComponentLogger('ChatWebAPI');
import { AgentsAPIHandler } from './agents.js';
import { MessagesAPIHandler } from './messages.js';
import { MemoryAPIHandler } from './memory.js';
import { ConversationsAPIHandler } from './conversations.js';
import { SchedulesAPIHandler } from './schedules.js';

export class ChatWebAPIRouter {
  private agentsHandler: AgentsAPIHandler;
  private messagesHandler: MessagesAPIHandler;
  private memoryHandler: MemoryAPIHandler;
  private conversationsHandler: ConversationsAPIHandler;
  private schedulesHandler: SchedulesAPIHandler;

  constructor(
    agentRegistry: AgentRegistry,
    serviceManager: ServiceManager
  ) {
    this.agentsHandler = new AgentsAPIHandler(agentRegistry, serviceManager);
    this.messagesHandler = new MessagesAPIHandler(agentRegistry, serviceManager);
    this.memoryHandler = new MemoryAPIHandler(agentRegistry, serviceManager);
    this.conversationsHandler = new ConversationsAPIHandler(agentRegistry, serviceManager);
    this.schedulesHandler = new SchedulesAPIHandler(agentRegistry, serviceManager);
  }

  /**
   * Route an API request
   */
  async route(req: IncomingMessage, res: ServerResponse, body?: unknown): Promise<boolean> {
    const url = req.url || '';
    const method = req.method || 'GET';

    log.debug(`${method} ${url}`);

    // Parse URL path
    const path = url.split('?')[0];
    const pathParts = path.split('/').filter(Boolean);

    // Check if this is an API request
    if (pathParts[0] !== 'api') {
      return false; // Not an API request
    }

    // Route to appropriate handler
    if (pathParts[1] === 'agents') {
      if (pathParts.length === 2) {
        // GET /api/agents
        if (method === 'GET') {
          await this.agentsHandler.handleListAgents(req, res);
          return true;
        }
      } else if (pathParts.length === 3) {
        // GET /api/agents/:agentId
        const agentId = decodeURIComponent(pathParts[2]);
        if (method === 'GET') {
          await this.agentsHandler.handleGetAgent(req, res, agentId);
          return true;
        }
      } else if (pathParts.length === 4) {
        const agentId = decodeURIComponent(pathParts[2]);
        const resource = pathParts[3];

        if (resource === 'models') {
          // GET /api/agents/:agentId/models
          if (method === 'GET') {
            await this.agentsHandler.handleListModels(req, res, agentId);
            return true;
          }
        } else if (resource === 'model') {
          // POST /api/agents/:agentId/model
          if (method === 'POST') {
            await this.agentsHandler.handleUpdateModel(req, res, agentId, body);
            return true;
          }
        } else if (resource === 'llm-config') {
          // GET /api/agents/:agentId/llm-config
          if (method === 'GET') {
            await this.agentsHandler.handleGetLLMConfig(req, res, agentId);
            return true;
          }
          // PUT /api/agents/:agentId/llm-config
          else if (method === 'PUT') {
            await this.agentsHandler.handleUpdateLLMConfig(req, res, agentId, body);
            return true;
          }
        } else if (resource === 'letta-tools') {
          // GET /api/agents/:agentId/letta-tools
          if (method === 'GET') {
            await this.agentsHandler.handleGetLettaTools(req, res, agentId);
            return true;
          }
        } else if (resource === 'messages') {
          // GET /api/agents/:agentId/messages
          if (method === 'GET') {
            await this.messagesHandler.handleGetMessages(req, res, agentId);
            return true;
          }
          // POST /api/agents/:agentId/messages
          else if (method === 'POST') {
            await this.messagesHandler.handleSendMessage(req, res, agentId, body);
            return true;
          }
        } else if (resource === 'memory') {
          // GET /api/agents/:agentId/memory
          if (method === 'GET') {
            await this.memoryHandler.handleGetMemory(req, res, agentId);
            return true;
          }
          // POST /api/agents/:agentId/memory - Create new memory block
          else if (method === 'POST') {
            await this.memoryHandler.handleCreateMemory(req, res, agentId, body);
            return true;
          }
        } else if (resource === 'schedules') {
          // GET /api/agents/:agentId/schedules - List schedules
          if (method === 'GET') {
            await this.schedulesHandler.handleListSchedules(req, res, agentId);
            return true;
          }
          // POST /api/agents/:agentId/schedules - Create schedule
          else if (method === 'POST') {
            await this.schedulesHandler.handleCreateSchedule(req, res, agentId, body);
            return true;
          }
          // DELETE /api/agents/:agentId/schedules - Stop all schedules
          else if (method === 'DELETE') {
            await this.schedulesHandler.handleDeleteAllSchedules(req, res, agentId);
            return true;
          }
        }
      } else if (pathParts.length === 5) {
        const agentId = decodeURIComponent(pathParts[2]);
        const resource = pathParts[3];
        const subResource = pathParts[4];

        if (resource === 'letta-tools') {
          const toolId = decodeURIComponent(subResource);
          // POST /api/agents/:agentId/letta-tools/:toolId - Attach tool
          if (method === 'POST') {
            await this.agentsHandler.handleAttachLettaTool(req, res, agentId, toolId);
            return true;
          }
          // DELETE /api/agents/:agentId/letta-tools/:toolId - Detach tool
          else if (method === 'DELETE') {
            await this.agentsHandler.handleDetachLettaTool(req, res, agentId, toolId);
            return true;
          }
        } else if (resource === 'messages' && subResource === 'stream') {
          // POST /api/agents/:agentId/messages/stream - Streaming message endpoint
          if (method === 'POST') {
            await this.messagesHandler.handleSendMessageStream(req, res, agentId, body);
            return true;
          }
        } else if (resource === 'messages' && subResource === 'clear') {
          // POST /api/agents/:agentId/messages/clear - Clear agent messages
          if (method === 'POST') {
            await this.agentsHandler.handleClearMessages(req, res, agentId);
            return true;
          }
        } else if (resource === 'memory') {
          const blockId = decodeURIComponent(subResource);
          // POST /api/agents/:agentId/memory/:blockId - Update memory block
          if (method === 'POST') {
            await this.memoryHandler.handleUpdateMemory(req, res, agentId, blockId, body);
            return true;
          }
          // DELETE /api/agents/:agentId/memory/:blockId - Remove memory block
          else if (method === 'DELETE') {
            await this.memoryHandler.handleDeleteMemory(req, res, agentId, blockId);
            return true;
          }
        } else if (resource === 'schedules') {
          const scheduleId = decodeURIComponent(subResource);
          // DELETE /api/agents/:agentId/schedules/:scheduleId - Delete specific schedule
          if (method === 'DELETE') {
            await this.schedulesHandler.handleDeleteSchedule(req, res, agentId, scheduleId);
            return true;
          }
        }
      }
    } else if (pathParts[1] === 'conversations') {
      if (pathParts.length === 2) {
        // GET /api/conversations
        if (method === 'GET') {
          await this.conversationsHandler.handleListConversations(req, res);
          return true;
        }
        // POST /api/conversations
        else if (method === 'POST') {
          await this.conversationsHandler.handleCreateConversation(req, res, body);
          return true;
        }
      } else if (pathParts.length === 3) {
        const conversationId = decodeURIComponent(pathParts[2]);
        // GET /api/conversations/:conversationId
        if (method === 'GET') {
          await this.conversationsHandler.handleGetConversation(req, res, conversationId);
          return true;
        }
        // DELETE /api/conversations/:conversationId
        else if (method === 'DELETE') {
          await this.conversationsHandler.handleDeleteConversation(req, res, conversationId);
          return true;
        }
      } else if (pathParts.length === 4) {
        const conversationId = decodeURIComponent(pathParts[2]);
        const resource = pathParts[3];

        if (resource === 'messages') {
          // GET /api/conversations/:conversationId/messages
          if (method === 'GET') {
            await this.conversationsHandler.handleGetMessages(req, res, conversationId);
            return true;
          }
          // POST /api/conversations/:conversationId/messages
          else if (method === 'POST') {
            await this.conversationsHandler.handleSendMessage(req, res, conversationId, body);
            return true;
          }
        } else if (resource === 'participants') {
          // POST /api/conversations/:conversationId/participants
          if (method === 'POST') {
            await this.conversationsHandler.handleAddParticipant(req, res, conversationId, body);
            return true;
          }
        }
        // Note: The approve endpoint was removed - Letta Groups handle turn management internally
      } else if (pathParts.length === 5) {
        const conversationId = decodeURIComponent(pathParts[2]);
        const resource = pathParts[3];
        const agentId = decodeURIComponent(pathParts[4]);

        if (resource === 'participants') {
          // DELETE /api/conversations/:conversationId/participants/:agentId
          if (method === 'DELETE') {
            await this.conversationsHandler.handleRemoveParticipant(req, res, conversationId, agentId);
            return true;
          }
        }
      }
    }

    // Route not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API endpoint not found' }));
    return true;
  }
}
