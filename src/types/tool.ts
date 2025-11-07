/**
 * Tool type definitions for Ampelos
 */

import type { AgentId, AgentMetadata } from './agent.js';
import type { BaseService } from './service.js';

/**
 * MCP tool result content item
 */
export interface ToolResultContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

/**
 * Result returned by a tool handler
 */
export interface ToolResult {
  content: ToolResultContent[];
  isError?: boolean;
}

/**
 * Context provided to tool handlers
 */
export interface ToolContext {
  /**
   * The agent ID making this tool call
   */
  agentId: AgentId;
  
  /**
   * Get agent metadata
   */
  getAgentMetadata(): AgentMetadata;
  
  /**
   * Access a service for this agent
   * @param serviceName Name of the service to access
   * @returns The service instance
   */
  getService<T extends BaseService = BaseService>(serviceName: string): T;
  
  /**
   * Check if a service is initialized for this agent
   * @param serviceName Name of the service to check
   */
  hasService(serviceName: string): boolean;
}

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  params: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolResult>;

/**
 * Tool definition
 */
export interface ToolDefinition {
  /**
   * Tool name (must be unique across all modules)
   */
  name: string;
  
  /**
   * Tool description
   */
  description: string;
  
  /**
   * JSON Schema for tool input parameters
   */
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  
  /**
   * Handler function for this tool
   */
  handler: ToolHandler;
}

