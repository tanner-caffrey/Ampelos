/**
 * Health API Handlers
 *
 * System health check endpoints
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Database } from '../../database.js';
import type { AgentStore } from '../../agent-store.js';
import type { APIResponse, HealthResponse } from '../types.js';

// Server start time for uptime calculation
const startTime = Date.now();

/**
 * Health API Handler
 */
export class HealthAPIHandler {
  private db: Database;
  private store: AgentStore;

  constructor(db: Database, store: AgentStore) {
    this.db = db;
    this.store = store;
  }

  /**
   * Send JSON response
   */
  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Send error response
   */
  private sendError(res: ServerResponse, status: number, message: string): void {
    this.sendJson(res, status, { success: false, error: message });
  }

  /**
   * GET /api/admin/health - System health check
   */
  async handleHealthCheck(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const agents = await this.store.getAllAgents();
      const enabledAgents = agents.filter((a) => a.enabled);
      const schemaVersion = this.db.getSchemaVersion();

      const health: HealthResponse = {
        status: 'healthy',
        version: '0.1.0', // TODO: Read from package.json
        uptime: Math.floor((Date.now() - startTime) / 1000),
        schemaVersion,
        agents: {
          total: agents.length,
          enabled: enabledAgents.length,
        },
      };

      const response: APIResponse<HealthResponse> = {
        success: true,
        data: health,
      };
      this.sendJson(res, 200, response);
    } catch (error) {
      this.sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
