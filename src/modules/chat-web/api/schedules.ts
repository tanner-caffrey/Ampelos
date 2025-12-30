/**
 * Schedules API Handler
 *
 * Handles HTTP requests for scheduled messages
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentRegistry } from '../../../core/agent-registry.js';
import type { ServiceManager } from '../../../core/service-manager.js';
import type ScheduledMessagesService from '../../scheduled-messages/service.js';
import type { CreateScheduleOptions } from '../../scheduled-messages/service.js';
import { createComponentLogger } from '../../../core/logger.js';

const log = createComponentLogger('SchedulesAPI');

export class SchedulesAPIHandler {
  private agentRegistry: AgentRegistry;
  private serviceManager: ServiceManager;

  constructor(agentRegistry: AgentRegistry, serviceManager: ServiceManager) {
    this.agentRegistry = agentRegistry;
    this.serviceManager = serviceManager;
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
    this.sendJson(res, status, { error: message });
  }

  /**
   * Get the scheduled messages service
   */
  private getScheduledMessagesService(): ScheduledMessagesService | null {
    try {
      const service = this.serviceManager.getService('scheduled-messages');
      return service as ScheduledMessagesService;
    } catch {
      return null;
    }
  }

  /**
   * GET /api/agents/:agentId/schedules - List all schedules for an agent
   */
  async handleListSchedules(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string
  ): Promise<void> {
    try {
      // Verify agent exists
      const agent = this.agentRegistry.getAgent(agentId as any);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      const service = this.getScheduledMessagesService();
      if (!service) {
        this.sendError(res, 400, 'Scheduled messages service not available');
        return;
      }

      const schedules = service.listSchedules(agentId as any);

      this.sendJson(res, 200, { schedules });
    } catch (error) {
      log.error('Error listing schedules', { error: error instanceof Error ? error.message : String(error) });
      this.sendError(res, 500, error instanceof Error ? error.message : 'Internal server error');
    }
  }

  /**
   * POST /api/agents/:agentId/schedules - Create a new schedule
   */
  async handleCreateSchedule(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    body: unknown
  ): Promise<void> {
    try {
      // Verify agent exists
      const agent = this.agentRegistry.getAgent(agentId as any);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      const service = this.getScheduledMessagesService();
      if (!service) {
        this.sendError(res, 400, 'Scheduled messages service not available');
        return;
      }

      const data = body as {
        type?: 'time' | 'loop';
        interval?: number;
        unit?: 'seconds' | 'minutes' | 'hours';
        message?: string;
        role?: 'user' | 'system';
      };

      // Validate required fields
      if (!data.type || !['time', 'loop'].includes(data.type)) {
        this.sendError(res, 400, 'type is required and must be "time" or "loop"');
        return;
      }
      if (data.interval === undefined || data.interval <= 0) {
        this.sendError(res, 400, 'interval is required and must be positive');
        return;
      }
      if (!data.message) {
        this.sendError(res, 400, 'message is required');
        return;
      }

      // Convert interval to seconds if time-based
      let intervalSeconds = data.interval;
      if (data.type === 'time' && data.unit) {
        switch (data.unit) {
          case 'minutes':
            intervalSeconds = data.interval * 60;
            break;
          case 'hours':
            intervalSeconds = data.interval * 3600;
            break;
          // seconds is default
        }
      }

      const options: CreateScheduleOptions = {
        type: data.type,
        interval: intervalSeconds,
        message: data.message,
        role: data.role || 'user'
      };

      const schedule = await service.createSchedule(agentId as any, options);

      this.sendJson(res, 201, { schedule });
    } catch (error) {
      log.error('Error creating schedule', { error: error instanceof Error ? error.message : String(error) });
      this.sendError(res, 500, error instanceof Error ? error.message : 'Internal server error');
    }
  }

  /**
   * DELETE /api/agents/:agentId/schedules/:scheduleId - Stop and remove a schedule
   */
  async handleDeleteSchedule(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string,
    scheduleId: string
  ): Promise<void> {
    try {
      // Verify agent exists
      const agent = this.agentRegistry.getAgent(agentId as any);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      const service = this.getScheduledMessagesService();
      if (!service) {
        this.sendError(res, 400, 'Scheduled messages service not available');
        return;
      }

      const stopped = await service.stopSchedule(agentId as any, scheduleId);

      if (stopped) {
        this.sendJson(res, 200, { success: true, message: `Schedule ${scheduleId} stopped` });
      } else {
        this.sendError(res, 404, `Schedule ${scheduleId} not found`);
      }
    } catch (error) {
      log.error('Error deleting schedule', { error: error instanceof Error ? error.message : String(error) });
      this.sendError(res, 500, error instanceof Error ? error.message : 'Internal server error');
    }
  }

  /**
   * DELETE /api/agents/:agentId/schedules - Stop all schedules
   */
  async handleDeleteAllSchedules(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string
  ): Promise<void> {
    try {
      // Verify agent exists
      const agent = this.agentRegistry.getAgent(agentId as any);
      if (!agent) {
        this.sendError(res, 404, `Agent ${agentId} not found`);
        return;
      }

      const service = this.getScheduledMessagesService();
      if (!service) {
        this.sendError(res, 400, 'Scheduled messages service not available');
        return;
      }

      const count = await service.stopAllSchedules(agentId as any);

      this.sendJson(res, 200, { success: true, count, message: `Stopped ${count} schedules` });
    } catch (error) {
      log.error('Error deleting all schedules', { error: error instanceof Error ? error.message : String(error) });
      this.sendError(res, 500, error instanceof Error ? error.message : 'Internal server error');
    }
  }
}
