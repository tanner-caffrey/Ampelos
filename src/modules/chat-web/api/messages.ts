/**
 * Messages API Handler
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentRegistry } from '../../../core/agent-registry.js';
import type { ServiceManager } from '../../../core/service-manager.js';
import { createAgentId } from '../../../types/agent.js';
import { createComponentLogger } from '../../../core/logger.js';

const log = createComponentLogger('MessagesAPI');

export interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  imageUrl?: string;
  imageData?: string; // base64
  imageMimeType?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments?: string | object;
  result?: string | object;
  status?: 'executing' | 'executed' | 'error';
  duration?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | MessageContent[]; // Support both string (backward compat) and multi-modal
  tool_calls?: ToolCall[];
  created_at: string;
}

export interface SendMessageRequest {
  message?: string; // For backward compatibility
  text?: string;
  images?: Array<{
    type: 'url' | 'base64';
    url?: string;
    data?: string; // base64
    mimeType?: string;
  }>;
}

export interface SendMessageResponse {
  messages: Message[];
}

export class MessagesAPIHandler {
  constructor(
    private agentRegistry: AgentRegistry,
    private serviceManager: ServiceManager
  ) {}

  /**
   * Handle POST /api/agents/:agentId/messages - Send a message to an agent
   */
  async handleSendMessage(
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

      if (!this.agentRegistry.isEnabled(typedAgentId)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent is not enabled' }));
        return;
      }

      // Parse request body
      const request = body as SendMessageRequest;
      
      // Support both old format (message) and new format (text + images)
      const textContent = request.text || request.message || '';
      const hasImages = request.images && request.images.length > 0;
      
      if (!textContent && !hasImages) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Message text or images are required' }));
        return;
      }

      // Input validation: enforce maximum message length (1MB for text)
      const MAX_MESSAGE_LENGTH = 1024 * 1024; // 1MB
      if (textContent && textContent.length > MAX_MESSAGE_LENGTH) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Message text exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` }));
        return;
      }

      // Input validation: limit number of images
      const MAX_IMAGES = 10;
      if (request.images && request.images.length > MAX_IMAGES) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Maximum ${MAX_IMAGES} images allowed per message` }));
        return;
      }

      // Get LettaManager
      const lettaManager = this.serviceManager.getLettaManager?.();
      if (!lettaManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LettaManager not initialized' }));
        return;
      }

      // Get Letta agent ID and correct client for this agent's backend
      const lettaAgentId = lettaManager.getLettaAgentId(typedAgentId);

      if (!lettaAgentId) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Letta agent not initialized for this agent' }));
        return;
      }

      const backend = lettaManager.getAgentBackend(typedAgentId);
      const lettaClient = lettaManager.getClientForBackend(backend);

      if (!lettaClient) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Letta backend '${backend}' not configured` }));
        return;
      }

      // Build multi-modal content array for Letta
      let lettaContent: any;
      if (hasImages) {
        // Multi-modal message with text and images
        lettaContent = [];
        
        // Add text if provided
        if (textContent) {
          lettaContent.push({
            type: 'text',
            text: textContent
          });
        }
        
        // Add images
        for (const image of request.images!) {
          if (image.type === 'url' && image.url) {
            lettaContent.push({
              type: 'image',
              source: {
                type: 'url',
                url: image.url
              }
            });
          } else if (image.type === 'base64' && image.data) {
            lettaContent.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mimeType || 'image/jpeg', // Letta SDK uses snake_case
                data: image.data
              }
            });
          }
        }
      } else {
        // Simple text message (backward compatible)
        lettaContent = textContent;
      }

      // Send message to Letta agent
      log.debug('Sending message to agent', { agentId, lettaAgentId });
      
      // Debug: log the content structure being sent (truncate base64 for readability)
      if (Array.isArray(lettaContent)) {
        const debugContent = lettaContent.map((item: any) => {
          if (item.type === 'image' && item.source?.data) {
            return {
              type: item.type,
              source: {
                ...item.source,
                data: item.source.data.substring(0, 50) + '... (truncated)'
              }
            };
          }
          return item;
        });
        log.debug('Sending multi-modal content', { content: debugContent });
      }
      
      const response = await lettaClient.sendMessage(lettaAgentId, lettaContent);

      // Debug: log the full response structure
      log.debug('Letta response structure', { response, messageCount: response?.messages?.length || 0 });

      // Convert Letta response to our message format
      // First pass: collect all tool calls and match them with returns
      const toolCallMap = new Map<string, ToolCall>(); // Track tool calls to match with returns
      const messageQueue: Array<{ msg: any; toolCallId?: string }> = []; // Queue messages for second pass
      const messages: Message[] = []; // Final messages array

      if (response && response.messages) {
        // First pass: process all messages and match tool calls with returns
        for (const msg of response.messages) {
          if (msg.message_type === 'tool_call_message' || msg.message_type === 'function_call') {
            // Collect tool call
            const toolCallData = msg.tool_call || (msg.tool_calls && msg.tool_calls[0]);
            
            if (toolCallData) {
              let parsedArgs: any = toolCallData.arguments;
              if (typeof toolCallData.arguments === 'string') {
                try {
                  parsedArgs = JSON.parse(toolCallData.arguments);
                } catch {
                  parsedArgs = toolCallData.arguments;
                }
              }
              
              const toolCallId = toolCallData.tool_call_id || msg.id || `tool-${Date.now()}-${Math.random()}`;
              const toolCall: ToolCall = {
                id: toolCallId,
                name: toolCallData.name || 'unknown',
                arguments: parsedArgs,
                status: 'executing',
                duration: msg.duration
              };
              
              toolCallMap.set(toolCallId, toolCall);
              messageQueue.push({ msg, toolCallId });
              log.debug('Collected tool call', { id: toolCall.id, name: toolCall.name });
            }
          } else if (msg.message_type === 'tool_return_message' || msg.message_type === 'function_return') {
            // Match return with call
            const toolCallId = msg.tool_call_id || msg.id;
            const toolReturnData = msg.tool_return || (msg.tool_returns && msg.tool_returns[0]);
            const resultText = typeof toolReturnData === 'object' ? toolReturnData.tool_return : toolReturnData;
            
            if (toolCallId) {
              const toolCall = toolCallMap.get(toolCallId);
              if (toolCall) {
                toolCall.result = resultText || msg.result || msg.content || msg.output || '';
                toolCall.status = msg.status === 'success' ? 'executed' : (msg.status === 'error' ? 'error' : 'executed');
                if (msg.duration) toolCall.duration = msg.duration;
                log.debug('Matched tool return with call', { id: toolCall.id, name: toolCall.name });
              }
            }
            // Skip returns - they're merged with calls
          } else {
            // Regular message, queue for second pass
            messageQueue.push({ msg });
          }
        }
        
        // Second pass: convert queued messages to our format
        log.debug('Second pass: processing queued messages', { queuedCount: messageQueue.length, toolCallCount: toolCallMap.size });
        for (const { msg, toolCallId } of messageQueue) {
          // Determine role
          let role: 'user' | 'assistant' | 'system' | 'tool' = 'assistant';
          if (msg.role === 'user' || msg.message_type === 'user_message') {
            role = 'user';
          } else if (msg.role === 'system' || msg.message_type === 'system_message') {
            role = 'system';
          } else if (toolCallId) {
            role = 'tool';
          }

          // Extract content
          let content: string | MessageContent[] = '';
          let toolCalls: ToolCall[] | undefined = undefined;
          
          if (toolCallId) {
            // This is a tool call message - get the merged call from map
            const toolCall = toolCallMap.get(toolCallId);
            if (toolCall) {
              toolCalls = [toolCall];
              content = '';
              role = 'tool';
              log.debug('Processing tool call message', {
                id: toolCall.id,
                name: toolCall.name,
                status: toolCall.status,
                has_result: !!toolCall.result
              });
            } else {
              log.warn('Tool call not found in map', { toolCallId, availableIds: Array.from(toolCallMap.keys()) });
              // Still add the message even if tool call not found, to avoid losing it
              role = 'tool';
              // Create a placeholder tool call so the message is added
              toolCalls = [{
                id: toolCallId,
                name: 'unknown',
                arguments: {},
                status: 'executing'
              }];
            }
          } else if (typeof msg === 'string') {
            content = msg;
          } else if (msg.message_type === 'user_message' || msg.message_type === 'assistant_message') {
            // Extract tool calls from assistant messages if present
            if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
              toolCalls = msg.tool_calls.map((tc: any) => {
                // Parse arguments if it's a JSON string
                let parsedArgs: any = tc.arguments;
                if (typeof tc.arguments === 'string') {
                  try {
                    parsedArgs = JSON.parse(tc.arguments);
                  } catch {
                    parsedArgs = tc.arguments;
                  }
                }
                
                return {
                  id: tc.tool_call_id || tc.id || `tool-${Date.now()}-${Math.random()}`,
                  name: tc.name || tc.function?.name || 'unknown',
                  arguments: parsedArgs || tc.function?.arguments || {},
                  status: 'executing' as const
                };
              });
            }
            // Check if content is an array (multi-modal) or string
            // Try multiple field names - Letta may use different fields
            const msgContent = msg.content || msg.message || msg.text || msg.message_text || msg.body || '';
            
            // Debug log for user messages to see structure
            if (role === 'user') {
              log.debug('User message structure in send response', {
                message_type: msg.message_type,
                role: msg.role,
                has_content: !!msg.content,
                has_message: !!msg.message,
                has_text: !!msg.text,
                content_type: typeof msg.content,
                content_is_array: Array.isArray(msg.content),
                content_preview: Array.isArray(msg.content) ? `Array(${msg.content.length} items)` : (typeof msg.content === 'string' ? msg.content.substring(0, 100) : String(msg.content))
              });
            }
            
            // Debug log for assistant messages to catch "[image omitted]" issue
            if (role === 'assistant') {
              const contentStr = typeof msgContent === 'string' ? msgContent : JSON.stringify(msgContent);
              if (contentStr.includes('[image omitted]') || contentStr.includes('image omitted')) {
                log.warn('Detected "[image omitted]" in assistant response');
                log.debug('Full assistant message structure', {
                  message_type: msg.message_type,
                  role: msg.role,
                  content_type: typeof msgContent,
                  content_is_array: Array.isArray(msgContent),
                  content_preview: typeof msgContent === 'string' ? msgContent : (Array.isArray(msgContent) ? `Array(${msgContent.length} items)` : JSON.stringify(msgContent).substring(0, 500)),
                  full_content: msgContent
                });
              }
            }
            
            if (Array.isArray(msgContent)) {
              // Multi-modal content
              const multiModalContent: MessageContent[] = [];
              for (const item of msgContent) {
                if (item.type === 'text' && item.text) {
                  multiModalContent.push({ type: 'text', text: item.text });
                } else if (item.type === 'image' && item.source) {
                  if (item.source.type === 'url' && item.source.url) {
                    multiModalContent.push({ type: 'image', imageUrl: item.source.url });
                  } else if (item.source.type === 'base64' && item.source.data) {
                    multiModalContent.push({
                      type: 'image',
                      imageData: item.source.data,
                      imageMimeType: item.source.media_type || item.source.mediaType || 'image/jpeg' // Letta SDK uses snake_case, check both for compatibility
                    });
                  }
                }
              }
              content = multiModalContent.length > 0 ? multiModalContent : '';
            } else {
              // String content
              content = typeof msgContent === 'string' ? msgContent : '';
            }
          }

          // Include message if it has content, tool calls, or is a tool message
          const hasContent = content && (typeof content === 'string' ? content.length > 0 : content.length > 0);
          const hasToolCalls = toolCalls && toolCalls.length > 0;
          const isToolMessage = role === 'tool';
          
          if (hasToolCalls || hasContent || isToolMessage) {
            const messageToAdd = {
              id: msg.id || `msg-${Date.now()}-${Math.random()}`,
              role,
              content: content || '',
              tool_calls: toolCalls,
              created_at: msg.date || msg.created_at || new Date().toISOString()
            };
            messages.push(messageToAdd);
            log.debug('Added message to response', {
              id: messageToAdd.id,
              role: messageToAdd.role,
              message_type: msg.message_type,
              has_content: hasContent,
              has_tool_calls: hasToolCalls,
              tool_calls_count: toolCalls?.length || 0
            });
          } else {
            log.debug('Skipping message (no content, tool calls, or not tool)', {
              message_type: msg.message_type,
              role: msg.role,
              has_content: hasContent,
              has_tool_calls: hasToolCalls,
              is_tool: isToolMessage
            });
          }
        }
      }

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
   * Handle GET /api/agents/:agentId/messages - Get message history
   */
  async handleGetMessages(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string
  ): Promise<void> {
    try {
      log.debug('Getting messages for agent', { agentId });
      const typedAgentId = createAgentId(agentId);

      // Validate agent exists
      const agent = this.agentRegistry.getAgent(typedAgentId);
      if (!agent) {
        log.debug('Agent not found', { agentId });
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      // Get LettaManager
      const lettaManager = this.serviceManager.getLettaManager?.();
      if (!lettaManager) {
        log.debug('No LettaManager for agent', { agentId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ messages: [] }));
        return;
      }

      // Get Letta agent ID and correct client for this agent's backend
      const lettaAgentId = lettaManager.getLettaAgentId(typedAgentId);

      log.debug('Letta agent ID retrieved', { agentId, lettaAgentId });

      if (!lettaAgentId) {
        log.debug('No Letta agent ID', { agentId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ messages: [] }));
        return;
      }

      const backend = lettaManager.getAgentBackend(typedAgentId);
      const lettaClient = lettaManager.getClientForBackend(backend);

      if (!lettaClient) {
        log.debug('Backend not configured', { backend, agentId });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Letta backend '${backend}' not configured` }));
        return;
      }

      log.debug('Using backend for agent', { backend, agentId });

      // Get messages from Letta
      log.debug('Fetching messages from Letta');
      const messagesResponse = await lettaClient.getMessages(lettaAgentId);
      log.debug('Letta returned messages', { count: messagesResponse?.length || 0 });

      // Convert to our format - two pass approach to merge tool calls with returns
      const toolCallMap = new Map<string, ToolCall>(); // Track tool calls to match with returns
      const messageQueue: Array<{ msg: any; toolCallId?: string }> = []; // Queue messages for second pass
      const messages: Message[] = [];

      if (messagesResponse && Array.isArray(messagesResponse)) {
        // First pass: collect tool calls and match with returns
        for (const msg of messagesResponse) {
          // Debug: log tool messages to understand structure
          if (msg.message_type === 'tool_call_message' || msg.message_type === 'tool_return_message' ||
              msg.message_type === 'function_call' || msg.message_type === 'function_return') {
            log.debug('Tool message from history', { message: msg });
          }
          
          // Determine role from message_type
          let role: 'user' | 'assistant' | 'system' | 'tool' = 'assistant';
          if (msg.message_type === 'user_message') {
            role = 'user';
          } else if (msg.message_type === 'system_message') {
            role = 'system';
          } else if (msg.message_type === 'assistant_message') {
            role = 'assistant';
          } else if (msg.message_type === 'tool_call_message' || msg.message_type === 'tool_return_message' || 
                     msg.message_type === 'function_call' || msg.message_type === 'function_return') {
            role = 'tool';
          }

          // Extract content - handle both string and multi-modal content
          let content: string | MessageContent[] = '';
          let toolCalls: ToolCall[] | undefined = undefined;
          
          // Handle tool calls and returns
          if (msg.message_type === 'tool_call_message' || msg.message_type === 'function_call') {
            const toolCallData = msg.tool_call || (msg.tool_calls && msg.tool_calls[0]);
            
            if (toolCallData) {
              let parsedArgs: any = toolCallData.arguments;
              if (typeof toolCallData.arguments === 'string') {
                try {
                  parsedArgs = JSON.parse(toolCallData.arguments);
                } catch {
                  parsedArgs = toolCallData.arguments;
                }
              }
              
              const toolCallId = toolCallData.tool_call_id || msg.id || `tool-${Date.now()}-${Math.random()}`;
              const toolCall: ToolCall = {
                id: toolCallId,
                name: toolCallData.name || 'unknown',
                arguments: parsedArgs,
                status: 'executing',
                duration: msg.duration
              };
              
              toolCallMap.set(toolCallId, toolCall);
              messageQueue.push({ msg, toolCallId });
            }
          } else if (msg.message_type === 'tool_return_message' || msg.message_type === 'function_return') {
            // Match return with call
            const toolCallId = msg.tool_call_id || msg.id;
            const toolReturnData = msg.tool_return || (msg.tool_returns && msg.tool_returns[0]);
            const resultText = typeof toolReturnData === 'object' ? toolReturnData.tool_return : toolReturnData;
            
            if (toolCallId) {
              const toolCall = toolCallMap.get(toolCallId);
              if (toolCall) {
                toolCall.result = resultText || msg.result || msg.content || msg.output || '';
                toolCall.status = msg.status === 'success' ? 'executed' : (msg.status === 'error' ? 'error' : 'executed');
                if (msg.duration) toolCall.duration = msg.duration;
              }
            }
            // Skip returns - they're merged with calls
          } else {
            // Regular message, queue for second pass
            messageQueue.push({ msg });
          }
        }
        
        // Second pass: convert queued messages to our format
        for (const { msg, toolCallId } of messageQueue) {
          // Determine role
          let role: 'user' | 'assistant' | 'system' | 'tool' = 'assistant';
          if (msg.message_type === 'user_message') {
            role = 'user';
          } else if (msg.message_type === 'system_message') {
            role = 'system';
          } else if (msg.message_type === 'assistant_message') {
            role = 'assistant';
          } else if (toolCallId) {
            role = 'tool';
          }

          // Extract content
          let content: string | MessageContent[] = '';
          let toolCalls: ToolCall[] | undefined = undefined;
          
          if (toolCallId) {
            // This is a tool call message - get the merged call from map
            const toolCall = toolCallMap.get(toolCallId);
            if (toolCall) {
              toolCalls = [toolCall];
              content = '';
              role = 'tool';
            }
          } else if (msg.message_type === 'assistant_message' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
            // Extract tool calls from assistant messages
            toolCalls = msg.tool_calls.map((tc: any) => {
              // Parse arguments if it's a JSON string
              let parsedArgs: any = tc.arguments;
              if (typeof tc.arguments === 'string') {
                try {
                  parsedArgs = JSON.parse(tc.arguments);
                } catch {
                  parsedArgs = tc.arguments;
                }
              }
              
              return {
                id: tc.tool_call_id || tc.id || `tool-${Date.now()}-${Math.random()}`,
                name: tc.name || tc.function?.name || 'unknown',
                arguments: parsedArgs || tc.function?.arguments || {},
                status: 'executing' as const
              };
            });
          }
          
          // Try multiple field names for content - Letta may use different fields
          const msgContent = msg.content || msg.message || msg.text || msg.message_text || msg.body || '';
          
          // Debug log for user messages to see structure
          if (role === 'user') {
            log.debug('User message structure', {
              message_type: msg.message_type,
              has_content: !!msg.content,
              has_message: !!msg.message,
              has_text: !!msg.text,
              content_type: typeof msg.content,
              content_is_array: Array.isArray(msg.content),
              content_preview: Array.isArray(msg.content) ? `Array(${msg.content.length} items)` : (typeof msg.content === 'string' ? msg.content.substring(0, 100) : String(msg.content))
            });
          }
          
          if (Array.isArray(msgContent)) {
            // Multi-modal content
            const multiModalContent: MessageContent[] = [];
            for (const item of msgContent) {
              if (item.type === 'text' && item.text) {
                multiModalContent.push({ type: 'text', text: item.text });
                  } else if (item.type === 'image' && item.source) {
                    if (item.source.type === 'url' && item.source.url) {
                      multiModalContent.push({ type: 'image', imageUrl: item.source.url });
                    } else if (item.source.type === 'base64' && item.source.data) {
                      multiModalContent.push({
                        type: 'image',
                        imageData: item.source.data,
                        imageMimeType: item.source.media_type || item.source.mediaType || 'image/jpeg' // Letta SDK uses snake_case, check both for compatibility
                      });
                    }
                  }
            }
            content = multiModalContent.length > 0 ? multiModalContent : '';
          } else {
            // String content
            content = typeof msgContent === 'string' ? msgContent : '';
          }

          // Include message if it has content, tool calls, or is a tool message
          const hasContent = content && (typeof content === 'string' ? content.length > 0 : content.length > 0);
          const hasToolCalls = toolCalls && toolCalls.length > 0;
          const isToolMessage = role === 'tool';
          
          if (hasToolCalls || hasContent || isToolMessage) {
            messages.push({
              id: msg.id || `msg-${Date.now()}-${Math.random()}`,
              role,
              content: content || '',
              tool_calls: toolCalls,
              created_at: msg.date || msg.created_at || new Date().toISOString()
            });
          }
        }
      }

      log.debug('Returning messages to frontend', { count: messages.length });
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
   * Handle POST /api/agents/:agentId/messages/stream - Send a message with streaming response (SSE)
   */
  async handleSendMessageStream(
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

      if (!this.agentRegistry.isEnabled(typedAgentId)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent is not enabled' }));
        return;
      }

      // Parse request body
      const request = body as SendMessageRequest;
      const textContent = request.text || request.message || '';
      const hasImages = request.images && request.images.length > 0;
      
      if (!textContent && !hasImages) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Message text or images are required' }));
        return;
      }

      // Get LettaManager
      const lettaManager = this.serviceManager.getLettaManager?.();
      if (!lettaManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LettaManager not available' }));
        return;
      }

      // Get Letta agent ID and correct client for this agent's backend
      const lettaAgentId = lettaManager.getLettaAgentId(typedAgentId);

      if (!lettaAgentId) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Letta agent not initialized' }));
        return;
      }

      const backend = lettaManager.getAgentBackend(typedAgentId);
      const lettaClient = lettaManager.getClientForBackend(backend);

      if (!lettaClient) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Letta backend '${backend}' not configured` }));
        return;
      }

      // Build content for Letta
      let lettaContent: any;
      if (hasImages) {
        lettaContent = [];
        if (textContent) {
          lettaContent.push({ type: 'text', text: textContent });
        }
        for (const image of request.images!) {
          if (image.type === 'url' && image.url) {
            lettaContent.push({
              type: 'image',
              source: { type: 'url', url: image.url }
            });
          } else if (image.type === 'base64' && image.data) {
            lettaContent.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mimeType || 'image/jpeg',
                data: image.data
              }
            });
          }
        }
      } else {
        lettaContent = textContent;
      }

      log.debug('Starting streaming response for agent', { agentId });

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      // Track tool calls for merging with returns
      const toolCallMap = new Map<string, ToolCall>();
      // Buffer for accumulating partial JSON argument strings per tool call
      const pendingArgsBuffer = new Map<string, string>();
      let closed = false;

      // Handle client disconnect
      req.on('close', () => {
        log.debug('Client disconnected from stream');
        closed = true;
      });

      try {
        // Stream messages from Letta
        for await (const chunk of lettaClient.sendMessageStream(lettaAgentId, lettaContent)) {
          if (closed) break;

          const messageType = (chunk as any).message_type;
          log.debug('Received stream chunk', { messageType });

          // Skip pings and internal messages
          if (messageType === 'ping') {
            // Send keep-alive comment
            res.write(': ping\n\n');
            continue;
          }

          // Handle different message types
          let eventData: any = null;

          if (messageType === 'tool_call_message' || messageType === 'function_call') {
            // Tool call starting
            // Collect all tool calls from this chunk, de-duplicating by ID
            const toolCallsById = new Map<string, any>();

            const addToolCall = (tc: any) => {
              const id = tc.tool_call_id || tc.id || (chunk as any).id;
              if (id && !toolCallsById.has(id)) {
                toolCallsById.set(id, tc);
              }
            };

            if ((chunk as any).tool_call) {
              addToolCall((chunk as any).tool_call);
            }
            if ((chunk as any).tool_calls) {
              const tcs = Array.isArray((chunk as any).tool_calls)
                ? (chunk as any).tool_calls
                : [(chunk as any).tool_calls];
              tcs.forEach(addToolCall);
            }

            // Process each unique tool call
            for (const toolCallData of toolCallsById.values()) {
              const toolCallId = toolCallData.tool_call_id || toolCallData.id || (chunk as any).id || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

              // Determine tool name early to check for internal tools
              let toolName = (chunk as any).name || toolCallData.name || toolCallData.function?.name || 'unknown';

              // Skip internal Letta tools - send_message content comes through as assistant_message
              if (toolName === 'send_message') {
                continue;
              }

              // Get or create tool call (for accumulating deltas)
              let toolCall = toolCallMap.get(toolCallId);
              if (!toolCall) {
                toolCall = {
                  id: toolCallId,
                  name: toolName,
                  arguments: {},
                  status: 'executing' as const
                };
              } else {
                // Update name if we have a better one
                if (toolName !== 'unknown') {
                  toolCall.name = toolName;
                }
              }

              // Arguments: might be streamed in deltas, so accumulate them
              let rawArgs = toolCallData.arguments;
              if (!rawArgs && toolCallData.function) {
                rawArgs = toolCallData.function.arguments;
              }

              // Debug: log arguments for debugging
              if (rawArgs && typeof rawArgs === 'string' && rawArgs.length < 500) {
                log.debug('Tool call arguments', { rawArgs });
              }

              if (rawArgs) {
                if (typeof rawArgs === 'string') {
                  // Append to pending buffer for this tool call
                  const existingBuffer = pendingArgsBuffer.get(toolCallId) || '';
                  const fullBuffer = existingBuffer + rawArgs;
                  pendingArgsBuffer.set(toolCallId, fullBuffer);

                  // Try to parse the accumulated buffer
                  try {
                    const parsedArgs = JSON.parse(fullBuffer);
                    // Success! Update arguments and clear buffer
                    if (typeof toolCall.arguments === 'object' && toolCall.arguments !== null && !Array.isArray(toolCall.arguments)) {
                      toolCall.arguments = { ...toolCall.arguments, ...parsedArgs };
                    } else {
                      toolCall.arguments = parsedArgs;
                    }
                    pendingArgsBuffer.delete(toolCallId);
                  } catch {
                    // Buffer is still incomplete - keep accumulating
                    // Don't update toolCall.arguments with invalid data
                    log.debug('Tool arguments incomplete, buffering', {
                      toolCallId,
                      bufferLength: fullBuffer.length
                    });
                  }
                } else {
                  // rawArgs is already an object, use directly
                  toolCall.arguments = rawArgs;
                  pendingArgsBuffer.delete(toolCallId);
                }
              }

              toolCallMap.set(toolCallId, toolCall);

              // Send event for each tool call
              if (!closed) {
                res.write(`data: ${JSON.stringify({
                  type: 'tool_call',
                  message: {
                    id: (chunk as any).id || `msg-${Date.now()}-${toolCallId}`,
                    role: 'tool' as const,
                    content: '',
                    tool_calls: [toolCall],
                    created_at: (chunk as any).date || new Date().toISOString()
                  }
                })}\n\n`);
              }
            }
            // Skip setting eventData since we wrote directly for each tool call
            eventData = null;
          } else if (messageType === 'tool_return_message' || messageType === 'function_return') {
            // Tool call completed - handle single or multiple returns
            const returnsToProcess: Array<{ toolCallId: string; result: string; status: string }> = [];

            // Single tool return
            if ((chunk as any).tool_call_id) {
              const toolReturnData = (chunk as any).tool_return;
              const resultText = typeof toolReturnData === 'object' ? toolReturnData.tool_return : toolReturnData;
              returnsToProcess.push({
                toolCallId: (chunk as any).tool_call_id,
                result: resultText || '',
                status: (chunk as any).status || 'executed'
              });
            }

            // Multiple tool returns (if present)
            if ((chunk as any).tool_returns) {
              const returns = Array.isArray((chunk as any).tool_returns)
                ? (chunk as any).tool_returns
                : [(chunk as any).tool_returns];
              for (const ret of returns) {
                const resultText = typeof ret === 'object' ? (ret.tool_return || ret.result || ret) : ret;
                if (ret.tool_call_id) {
                  returnsToProcess.push({
                    toolCallId: ret.tool_call_id,
                    result: typeof resultText === 'string' ? resultText : JSON.stringify(resultText),
                    status: ret.status || 'executed'
                  });
                }
              }
            }

            // Process each return
            for (const { toolCallId, result, status } of returnsToProcess) {
              if (toolCallMap.has(toolCallId)) {
                const toolCall = toolCallMap.get(toolCallId)!;
                toolCall.result = result;
                toolCall.status = status === 'error' ? 'error' : 'executed';

                if (!closed) {
                  res.write(`data: ${JSON.stringify({
                    type: 'tool_return',
                    tool_call_id: toolCallId,
                    tool_call: toolCall
                  })}\n\n`);
                }
              }
            }
            // Skip setting eventData since we wrote directly
            eventData = null;
          } else if (messageType === 'assistant_message') {
            // Assistant message (possibly streaming tokens)
            const content = (chunk as any).content || (chunk as any).text || (chunk as any).message || '';
            const contentStr = typeof content === 'string' ? content : 
              (Array.isArray(content) ? content.map((c: any) => c.text || '').join('') : '');

            eventData = {
              type: 'assistant_message',
              message: {
                id: (chunk as any).id || `msg-${Date.now()}`,
                role: 'assistant' as const,
                content: contentStr,
                created_at: (chunk as any).date || new Date().toISOString()
              }
            };
          } else if (messageType === 'reasoning_message' || messageType === 'hidden_reasoning_message') {
            // Internal reasoning - skip or optionally emit
            eventData = {
              type: 'reasoning',
              content: (chunk as any).reasoning || (chunk as any).content || ''
            };
          } else if (messageType === 'stop_reason') {
            // Stream complete
            eventData = {
              type: 'done',
              stop_reason: (chunk as any).stop_reason
            };
          } else if (messageType === 'usage_statistics') {
            // Usage stats at end
            eventData = {
              type: 'usage',
              usage: (chunk as any)
            };
          }

          if (eventData && !closed) {
            res.write(`data: ${JSON.stringify(eventData)}\n\n`);
          }
        }

        // Send done event if not already sent
        if (!closed) {
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        }
      } catch (streamError) {
        log.error('Stream error', { error: streamError instanceof Error ? streamError.message : String(streamError) });
        if (!closed) {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            error: streamError instanceof Error ? streamError.message : String(streamError)
          })}\n\n`);
        }
      }

      res.end();
      log.debug('Stream ended for agent', { agentId });
    } catch (error) {
      log.error('Error in streaming endpoint', { error: error instanceof Error ? error.message : String(error) });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to stream message',
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    }
  }
}
