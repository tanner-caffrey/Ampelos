/**
 * Scheduled Messages Tool
 *
 * Allows agents to create, list, and manage scheduled recurring messages.
 */

import type { ToolDefinition, ToolResult } from '../../types/tool.js';
import type ScheduledMessagesService from './service.js';
import type { Schedule } from './service.js';

/**
 * Format absolute time for display
 */
function formatAbsoluteTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

/**
 * Format a schedule for display
 */
function formatSchedule(schedule: Schedule): string {
  let typeInfo: string;
  let nextFire: string = '';

  switch (schedule.type) {
    case 'time':
      typeInfo = `recurring every ${formatInterval(schedule.interval)}`;
      if (schedule.last_fired_at) {
        nextFire = `Next: ${formatNextFire(schedule.last_fired_at, schedule.interval)}`;
      }
      break;
    case 'loop':
      typeInfo = `recurring every ${schedule.interval} loop${schedule.interval > 1 ? 's' : ''}`;
      nextFire = `Progress: ${schedule.loops_since_last_fire}/${schedule.interval} loops`;
      break;
    case 'once_delay': {
      typeInfo = `one-time (delay: ${formatInterval(schedule.interval)})`;
      const delayFireTime = new Date(schedule.created_at).getTime() + (schedule.interval * 1000);
      nextFire = `Fires: ${formatAbsoluteTime(new Date(delayFireTime).toISOString())}`;
      break;
    }
    case 'once_at':
      typeInfo = `one-time (scheduled)`;
      nextFire = `Fires at: ${formatAbsoluteTime(schedule.fire_at!)}`;
      break;
    default:
      typeInfo = 'unknown';
  }

  const lastFired = schedule.last_fired_at
    ? `Last fired: ${formatRelativeTime(schedule.last_fired_at)}`
    : 'Never fired';

  return `**${schedule.id}** (${schedule.type})
  - Type: ${typeInfo}
  - Role: ${schedule.role}
  - Message: "${schedule.message.substring(0, 50)}${schedule.message.length > 50 ? '...' : ''}"
  - Stats: ${schedule.fire_count} fires | ${lastFired}${nextFire ? ` | ${nextFire}` : ''}`;
}

/**
 * Format seconds into human-readable interval
 */
function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds > 1 ? 's' : ''}`;
  if (seconds < 3600) {
    const mins = Math.round(seconds / 60);
    return `${mins} minute${mins > 1 ? 's' : ''}`;
  }
  const hours = Math.round(seconds / 3600);
  return `${hours} hour${hours > 1 ? 's' : ''}`;
}

/**
 * Format relative time
 */
function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format next fire time
 */
function formatNextFire(lastFired: string, intervalSeconds: number): string {
  const nextTime = new Date(lastFired).getTime() + intervalSeconds * 1000;
  const diff = nextTime - Date.now();
  if (diff <= 0) return 'now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `in ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `in ${hours}h`;
}

/**
 * Convert unit to seconds
 */
function unitToSeconds(value: number, unit?: string): number {
  switch (unit) {
    case 'minutes':
      return value * 60;
    case 'hours':
      return value * 3600;
    case 'seconds':
    default:
      return value;
  }
}

export const scheduleMessageTool: ToolDefinition = {
  name: 'schedule_message',
  description: `Schedule messages to yourself. Supports recurring and one-time messages.

Actions:
- create: Create a new scheduled message
- list: View all active schedules
- stop: Cancel a specific schedule by ID
- stop_all: Cancel all active schedules

Schedule types:
- time: Recurring every N seconds/minutes/hours
- loop: Recurring every N conversation cycles
- once_delay: One-time, fires after a delay (in N seconds/minutes/hours)
- once_at: One-time, fires at a specific time (ISO 8601 format)

One-time schedules are automatically removed after firing.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'stop', 'stop_all'],
        description: 'Action to perform'
      },
      type: {
        type: 'string',
        enum: ['time', 'loop', 'once_delay', 'once_at'],
        description: 'Schedule type: "time" (recurring interval), "loop" (recurring per N cycles), "once_delay" (one-time after delay), "once_at" (one-time at specific time)'
      },
      interval: {
        type: 'number',
        description: 'For time/loop/once_delay: interval value (seconds for time-based unless unit specified, loop count for loop-based)'
      },
      unit: {
        type: 'string',
        enum: ['seconds', 'minutes', 'hours'],
        description: 'For time/once_delay: unit for interval (optional, defaults to seconds)'
      },
      fire_at: {
        type: 'string',
        description: 'For once_at: ISO 8601 timestamp when to fire in UTC (e.g., "2024-12-17T15:00:00Z"). Timestamps without timezone suffix are treated as UTC.'
      },
      message: {
        type: 'string',
        description: 'For create: message content to send when triggered'
      },
      role: {
        type: 'string',
        enum: ['user', 'system'],
        description: 'For create: message role (default: user). System messages appear as system prompts.'
      },
      schedule_id: {
        type: 'string',
        description: 'For stop: ID of schedule to cancel'
      }
    },
    required: ['action']
  },
  handler: async (params, context): Promise<ToolResult> => {
    const action = params.action as string;
    const service = context.getService('scheduled-messages') as ScheduledMessagesService;

    try {
      switch (action) {
        case 'create': {
          const type = params.type as Schedule['type'];
          const interval = params.interval as number | undefined;
          const unit = params.unit as string | undefined;
          const fireAt = params.fire_at as string | undefined;
          const message = params.message as string;
          const role = (params.role as 'user' | 'system') || 'user';

          if (!type) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: type is required (time, loop, once_delay, or once_at)' }]
            };
          }
          if (!message) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: message is required' }]
            };
          }

          // Validate type-specific requirements
          if (type === 'once_at') {
            if (!fireAt) {
              return {
                isError: true,
                content: [{ type: 'text', text: 'Error: fire_at is required for once_at type (ISO 8601 format in UTC, e.g., "2024-12-17T15:00:00Z")' }]
              };
            }
          } else {
            // time, loop, once_delay all need interval
            if (interval === undefined || interval <= 0) {
              return {
                isError: true,
                content: [{ type: 'text', text: 'Error: interval is required and must be positive' }]
              };
            }
          }

          // Convert interval to seconds for time-based types
          const intervalSeconds = (type === 'time' || type === 'once_delay')
            ? unitToSeconds(interval || 0, unit)
            : (interval || 0);

          const schedule = await service.createSchedule(context.agentId, {
            type,
            interval: intervalSeconds,
            fire_at: fireAt,
            message,
            role
          });

          // Format response based on type
          let responseText: string;
          if (type === 'once_at') {
            responseText = `One-time schedule created!

**ID:** ${schedule.id}
**Type:** once_at (fires at specific time)
**Fire at:** ${schedule.fire_at}
**Role:** ${schedule.role}
**Message:** "${message}"

The message will be sent at the specified time and the schedule will be automatically removed.`;
          } else if (type === 'once_delay') {
            const delayDisplay = formatInterval(intervalSeconds);
            responseText = `One-time schedule created!

**ID:** ${schedule.id}
**Type:** once_delay (fires after delay)
**Delay:** ${delayDisplay}
**Role:** ${schedule.role}
**Message:** "${message}"

The message will be sent in ${delayDisplay} and the schedule will be automatically removed.`;
          } else {
            // Recurring types (time, loop)
            const intervalDisplay = type === 'time'
              ? formatInterval(intervalSeconds)
              : `${interval} loop${interval! > 1 ? 's' : ''}`;
            responseText = `Schedule created successfully!

**ID:** ${schedule.id}
**Type:** ${schedule.type}
**Interval:** ${intervalDisplay}
**Role:** ${schedule.role}
**Message:** "${message}"

The schedule is now active and will fire ${type === 'time' ? `every ${intervalDisplay}` : `after every ${intervalDisplay}`}.`;
          }

          return {
            content: [{ type: 'text', text: responseText }]
          };
        }

        case 'list': {
          const schedules = service.listSchedules(context.agentId);

          if (schedules.length === 0) {
            return {
              content: [{ type: 'text', text: 'No active schedules.' }]
            };
          }

          const formatted = schedules.map(formatSchedule).join('\n\n');
          return {
            content: [{
              type: 'text',
              text: `**Active Schedules (${schedules.length}):**\n\n${formatted}`
            }]
          };
        }

        case 'stop': {
          const scheduleId = params.schedule_id as string;
          if (!scheduleId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: schedule_id is required' }]
            };
          }

          const stopped = await service.stopSchedule(context.agentId, scheduleId);
          if (stopped) {
            return {
              content: [{ type: 'text', text: `Schedule ${scheduleId} has been stopped and removed.` }]
            };
          } else {
            return {
              isError: true,
              content: [{ type: 'text', text: `Schedule ${scheduleId} not found.` }]
            };
          }
        }

        case 'stop_all': {
          const count = await service.stopAllSchedules(context.agentId);
          return {
            content: [{
              type: 'text',
              text: count > 0
                ? `Stopped and removed ${count} schedule${count > 1 ? 's' : ''}.`
                : 'No schedules to stop.'
            }]
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown action: ${action}. Use create, list, stop, or stop_all.` }]
          };
      }
    } catch (error: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${error.message}` }]
      };
    }
  }
};

export const tools: ToolDefinition[] = [scheduleMessageTool];
