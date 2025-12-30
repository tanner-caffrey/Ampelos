/**
 * Scheduled Messages Service (Singleton)
 *
 * Manages scheduled/recurring messages for agents.
 * Supports time-based (every N seconds/minutes/hours) and
 * loop-based (every N message cycles) scheduling.
 *
 * This is a singleton - timers and state are tracked per-agent internally.
 */

import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import type { LettaManager } from '../../core/letta/index.js';
import { createComponentLogger } from '../../core/logger.js';

const SERVICE_NAME = 'scheduled-messages';
const log = createComponentLogger('ScheduledMessages');

export interface Schedule {
  id: string;
  type: 'time' | 'loop' | 'once_delay' | 'once_at';
  interval: number; // seconds for time-based/once_delay, loop count for loop-based, ignored for once_at
  fire_at?: string; // ISO 8601 timestamp for once_at type
  message: string;
  role: 'user' | 'system';
  enabled: boolean;
  created_at: string;
  last_fired_at?: string;
  fire_count: number;
  loops_since_last_fire: number; // for loop-based tracking
}

export interface ScheduledMessagesState {
  schedules: Record<string, Schedule>;
  total_loops: number;
}

export interface ScheduledMessagesConfig {
  max_schedules?: number;
  min_interval_seconds?: number;
}

export interface CreateScheduleOptions {
  type: 'time' | 'loop' | 'once_delay' | 'once_at';
  interval?: number; // Required for time/loop/once_delay, ignored for once_at
  fire_at?: string;  // Required for once_at (ISO 8601 timestamp)
  message: string;
  role?: 'user' | 'system';
}

const DEFAULT_STATE: ScheduledMessagesState = {
  schedules: {},
  total_loops: 0
};

class ScheduledMessagesService implements BaseService {
  private context?: ServiceContext;
  private defaultConfig: ScheduledMessagesConfig = {
    max_schedules: 10,
    min_interval_seconds: 60
  };

  // Per-agent tracking
  private agentConfigs: Map<AgentId, ScheduledMessagesConfig> = new Map();
  private agentTimers: Map<AgentId, Map<string, NodeJS.Timeout>> = new Map();
  private loopCallbacks: Map<AgentId, (agentId: AgentId) => void> = new Map();

  /**
   * No module dependencies - Letta is core infrastructure
   */
  dependsOn(): string[] {
    return [];
  }

  /**
   * Initialize the service (global, once at startup)
   */
  async init(context: ServiceContext): Promise<void> {
    this.context = context;
    log.info('Service initialized (global singleton)');
  }

  /**
   * Initialize for a specific agent
   */
  async initAgent(agentId: AgentId, config: Record<string, unknown>): Promise<void> {
    if (!this.context) {
      throw new Error('ScheduledMessages service not initialized');
    }

    // Store agent config
    const typedConfig = config as ScheduledMessagesConfig;
    this.agentConfigs.set(agentId, {
      max_schedules: typedConfig.max_schedules ?? this.defaultConfig.max_schedules,
      min_interval_seconds: typedConfig.min_interval_seconds ?? this.defaultConfig.min_interval_seconds
    });

    // Initialize timers map for this agent
    if (!this.agentTimers.has(agentId)) {
      this.agentTimers.set(agentId, new Map());
    }

    // Get LettaManager and register loop callback
    const lettaManager = this.context.getLettaManager?.();
    if (!lettaManager) {
      throw new Error('LettaManager not available - scheduled messages requires Letta core');
    }

    const callback = (triggeredAgentId: AgentId) => {
      if (triggeredAgentId === agentId) {
        this.onLoopComplete(agentId);
      }
    };

    this.loopCallbacks.set(agentId, callback);
    lettaManager.registerOnChatComplete(agentId, callback);

    // Restore timers from persisted state
    await this.restoreTimers(agentId);

    const state = this.getAgentState(agentId);
    log.info('Initialized for agent', { agentId, scheduleCount: Object.keys(state.schedules).length });
  }

  /**
   * Check if an agent can reconnect
   */
  canReconnect(_agentId: AgentId, _state: Record<string, unknown>): boolean {
    return true;
  }

  /**
   * Get state for a specific agent
   */
  private getAgentState(agentId: AgentId): ScheduledMessagesState {
    if (!this.context) {
      return DEFAULT_STATE;
    }
    const state = this.context.getState<ScheduledMessagesState>(agentId, SERVICE_NAME);
    return state.get() || DEFAULT_STATE;
  }

  /**
   * Save state for a specific agent
   */
  private saveAgentState(agentId: AgentId, newState: ScheduledMessagesState): void {
    if (!this.context) return;
    const state = this.context.getState<ScheduledMessagesState>(agentId, SERVICE_NAME);
    state.set(newState);
  }

  /**
   * Restore timers from persisted state after server restart
   */
  private async restoreTimers(agentId: AgentId): Promise<void> {
    const now = Date.now();
    const state = this.getAgentState(agentId);
    const schedulesToRemove: string[] = [];

    for (const schedule of Object.values(state.schedules)) {
      if (!schedule.enabled) continue;

      if (schedule.type === 'time') {
        // Recurring time-based schedule
        const lastFired = schedule.last_fired_at
          ? new Date(schedule.last_fired_at).getTime()
          : new Date(schedule.created_at).getTime();

        const elapsed = now - lastFired;
        const intervalMs = schedule.interval * 1000;

        if (elapsed >= intervalMs) {
          // Missed fire, execute now then start regular timer
          log.info('Firing missed schedule', { scheduleId: schedule.id, agentId });
          await this.fireSchedule(agentId, schedule);
          this.startTimer(agentId, schedule);
        } else {
          // Resume with remaining time
          const remaining = intervalMs - elapsed;
          log.info('Resuming schedule', { scheduleId: schedule.id, agentId, nextFireSeconds: Math.round(remaining / 1000) });
          this.startTimerWithDelay(agentId, schedule, remaining);
        }
      } else if (schedule.type === 'once_delay') {
        // One-time delay-based schedule
        const fireTime = new Date(schedule.created_at).getTime() + (schedule.interval * 1000);

        if (schedule.fire_count > 0) {
          // Already fired, remove stale schedule
          schedulesToRemove.push(schedule.id);
        } else if (now >= fireTime) {
          // Missed, fire now and remove
          log.info('Firing missed one-time schedule', { scheduleId: schedule.id, agentId });
          await this.fireSchedule(agentId, schedule, true);
        } else {
          // Resume with remaining time
          const remaining = fireTime - now;
          log.info('Resuming one-time schedule', { scheduleId: schedule.id, agentId, firesInSeconds: Math.round(remaining / 1000) });
          this.startOneTimeTimer(agentId, schedule, remaining);
        }
      } else if (schedule.type === 'once_at') {
        // One-time absolute time schedule
        const fireTime = new Date(schedule.fire_at!).getTime();

        if (schedule.fire_count > 0) {
          // Already fired, remove stale schedule
          schedulesToRemove.push(schedule.id);
        } else if (now >= fireTime) {
          // Missed, fire now and remove
          log.info('Firing missed one-time schedule', { scheduleId: schedule.id, agentId });
          await this.fireSchedule(agentId, schedule, true);
        } else {
          // Resume with remaining time
          const remaining = fireTime - now;
          log.info('Resuming one-time schedule', { scheduleId: schedule.id, agentId, fireAt: schedule.fire_at });
          this.startOneTimeTimer(agentId, schedule, remaining);
        }
      }
      // 'loop' type has no timer to restore - handled by onLoopComplete callbacks
    }

    // Clean up stale one-time schedules that already fired
    if (schedulesToRemove.length > 0) {
      for (const id of schedulesToRemove) {
        delete state.schedules[id];
        log.info('Removed stale one-time schedule', { scheduleId: id, agentId });
      }
      this.saveAgentState(agentId, state);
    }
  }

  /**
   * Start a recurring timer for a schedule
   */
  private startTimer(agentId: AgentId, schedule: Schedule): void {
    const intervalMs = schedule.interval * 1000;
    const timer = setInterval(async () => {
      await this.fireSchedule(agentId, schedule);
    }, intervalMs);

    const timers = this.agentTimers.get(agentId);
    if (timers) {
      timers.set(schedule.id, timer);
    }
  }

  /**
   * Start a timer with initial delay, then switch to regular interval
   */
  private startTimerWithDelay(agentId: AgentId, schedule: Schedule, delayMs: number): void {
    const timeout = setTimeout(async () => {
      await this.fireSchedule(agentId, schedule);
      this.startTimer(agentId, schedule);
    }, delayMs);

    const timers = this.agentTimers.get(agentId);
    if (timers) {
      timers.set(schedule.id, timeout);
    }
  }

  /**
   * Start a one-time timer that fires once and auto-removes the schedule
   */
  private startOneTimeTimer(agentId: AgentId, schedule: Schedule, delayMs: number): void {
    const timeout = setTimeout(async () => {
      await this.fireSchedule(agentId, schedule, true); // true = remove after fire
    }, delayMs);

    const timers = this.agentTimers.get(agentId);
    if (timers) {
      timers.set(schedule.id, timeout);
    }
  }

  /**
   * Called when a message loop completes for an agent
   */
  private async onLoopComplete(agentId: AgentId): Promise<void> {
    const state = this.getAgentState(agentId);
    state.total_loops++;

    // Check loop-based schedules
    for (const schedule of Object.values(state.schedules)) {
      if (!schedule.enabled || schedule.type !== 'loop') continue;

      schedule.loops_since_last_fire++;

      if (schedule.loops_since_last_fire >= schedule.interval) {
        await this.fireSchedule(agentId, schedule);
        schedule.loops_since_last_fire = 0;
      }
    }

    // Persist state
    this.saveAgentState(agentId, state);
  }

  /**
   * Fire a scheduled message
   * @param removeAfterFire If true, removes the schedule after firing (for one-time schedules)
   */
  private async fireSchedule(agentId: AgentId, schedule: Schedule, removeAfterFire: boolean = false): Promise<void> {
    if (!this.context) return;

    const state = this.getAgentState(agentId);
    const stateSchedule = state.schedules[schedule.id];
    if (!stateSchedule || !stateSchedule.enabled) {
      return;
    }

    try {
      const lettaManager = this.context.getLettaManager?.();
      if (!lettaManager) {
        log.error('LettaManager not available', { agentId });
        return;
      }

      // Prefix message to identify it as scheduled
      const prefixedMessage = `[SCHEDULED] ${schedule.message}`;

      log.info('Firing schedule', { scheduleId: schedule.id, agentId, type: schedule.type, role: schedule.role });

      await lettaManager.chat(agentId, prefixedMessage, { role: schedule.role });

      // Update stats
      stateSchedule.last_fired_at = new Date().toISOString();
      stateSchedule.fire_count++;

      // Auto-remove one-time schedules after firing
      if (removeAfterFire) {
        // Clear timer reference
        const timers = this.agentTimers.get(agentId);
        if (timers) {
          timers.delete(schedule.id);
        }
        // Remove from state
        delete state.schedules[schedule.id];
        log.info('One-time schedule completed and removed', { scheduleId: schedule.id });
      }

      // Persist state
      this.saveAgentState(agentId, state);
    } catch (error) {
      log.error('Failed to fire schedule', { scheduleId: schedule.id, agentId, error });
    }
  }

  /**
   * Create a new schedule for an agent
   */
  async createSchedule(agentId: AgentId, options: CreateScheduleOptions): Promise<Schedule> {
    const state = this.getAgentState(agentId);
    const config = this.agentConfigs.get(agentId) || this.defaultConfig;

    // Validate limits
    const scheduleCount = Object.keys(state.schedules).length;
    if (config.max_schedules && config.max_schedules > 0 && scheduleCount >= config.max_schedules) {
      throw new Error(`Maximum schedule limit (${config.max_schedules}) reached. Stop existing schedules first.`);
    }

    // Validate based on type
    if (options.type === 'time') {
      if (!options.interval || options.interval < (config.min_interval_seconds || 60)) {
        throw new Error(`Minimum interval for time-based schedules is ${config.min_interval_seconds} seconds`);
      }
    } else if (options.type === 'loop') {
      if (!options.interval || options.interval < 1) {
        throw new Error('Loop interval must be at least 1');
      }
    } else if (options.type === 'once_delay') {
      if (!options.interval || options.interval <= 0) {
        throw new Error('Positive delay interval required for once_delay type');
      }
      if (options.interval < (config.min_interval_seconds || 60)) {
        throw new Error(`Minimum delay is ${config.min_interval_seconds} seconds`);
      }
    } else if (options.type === 'once_at') {
      if (!options.fire_at) {
        throw new Error('fire_at timestamp is required for once_at type');
      }
      // Normalize timestamp: if no timezone specified, treat as UTC
      let normalizedFireAt = options.fire_at;
      if (!options.fire_at.endsWith('Z') && !options.fire_at.match(/[+-]\d{2}:\d{2}$/)) {
        normalizedFireAt = options.fire_at + 'Z';
      }
      options.fire_at = normalizedFireAt;

      const fireTime = new Date(normalizedFireAt).getTime();
      if (isNaN(fireTime)) {
        throw new Error('Invalid fire_at timestamp. Use ISO 8601 format (e.g., 2024-12-17T15:00:00Z)');
      }
      if (fireTime <= Date.now()) {
        throw new Error('fire_at must be in the future');
      }
    }

    // Create schedule
    const schedule: Schedule = {
      id: `sched-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      type: options.type,
      interval: options.interval || 0,
      fire_at: options.fire_at,
      message: options.message,
      role: options.role || 'user',
      enabled: true,
      created_at: new Date().toISOString(),
      fire_count: 0,
      loops_since_last_fire: 0
    };

    // Store schedule
    state.schedules[schedule.id] = schedule;

    // Start appropriate timer
    if (schedule.type === 'time') {
      this.startTimer(agentId, schedule);
    } else if (schedule.type === 'once_delay') {
      this.startOneTimeTimer(agentId, schedule, schedule.interval * 1000);
    } else if (schedule.type === 'once_at') {
      const delay = new Date(schedule.fire_at!).getTime() - Date.now();
      this.startOneTimeTimer(agentId, schedule, delay);
    }
    // 'loop' type has no timer - handled in onLoopComplete

    // Persist state
    this.saveAgentState(agentId, state);

    const logMeta = schedule.type === 'once_at'
      ? { fireAt: schedule.fire_at }
      : { interval: schedule.interval };
    log.info('Created schedule', { scheduleId: schedule.id, agentId, type: schedule.type, ...logMeta });

    return schedule;
  }

  /**
   * Stop a schedule by ID
   */
  async stopSchedule(agentId: AgentId, scheduleId: string): Promise<boolean> {
    const state = this.getAgentState(agentId);
    const schedule = state.schedules[scheduleId];
    if (!schedule) {
      return false;
    }

    // Clear timer if exists
    const timers = this.agentTimers.get(agentId);
    if (timers) {
      const timer = timers.get(scheduleId);
      if (timer) {
        clearInterval(timer);
        clearTimeout(timer);
        timers.delete(scheduleId);
      }
    }

    // Remove schedule
    delete state.schedules[scheduleId];

    // Persist state
    this.saveAgentState(agentId, state);

    log.info('Stopped schedule', { scheduleId, agentId });

    return true;
  }

  /**
   * Stop all schedules for an agent
   */
  async stopAllSchedules(agentId: AgentId): Promise<number> {
    const state = this.getAgentState(agentId);
    const count = Object.keys(state.schedules).length;

    // Clear all timers for this agent
    const timers = this.agentTimers.get(agentId);
    if (timers) {
      for (const timer of timers.values()) {
        clearInterval(timer);
        clearTimeout(timer);
      }
      timers.clear();
    }

    // Clear all schedules
    state.schedules = {};

    // Persist state
    this.saveAgentState(agentId, state);

    log.info('Stopped all schedules', { agentId, count });

    return count;
  }

  /**
   * List all schedules for an agent
   */
  listSchedules(agentId: AgentId): Schedule[] {
    const state = this.getAgentState(agentId);
    return Object.values(state.schedules);
  }

  /**
   * Cleanup agent-specific resources
   */
  async cleanupAgent(agentId: AgentId): Promise<void> {
    // Clear all timers for this agent
    const timers = this.agentTimers.get(agentId);
    if (timers) {
      for (const timer of timers.values()) {
        clearInterval(timer);
        clearTimeout(timer);
      }
      timers.clear();
    }
    this.agentTimers.delete(agentId);

    // Unregister loop callback
    if (this.context) {
      const lettaManager = this.context.getLettaManager?.();
      const callback = this.loopCallbacks.get(agentId);
      if (lettaManager && callback) {
        lettaManager.unregisterOnChatComplete(agentId, callback);
      }
    }
    this.loopCallbacks.delete(agentId);
    this.agentConfigs.delete(agentId);

    log.info('Cleanup complete for agent', { agentId });
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup(): Promise<void> {
    // Clear all timers for all agents
    for (const [agentId, timers] of this.agentTimers) {
      for (const timer of timers.values()) {
        clearInterval(timer);
        clearTimeout(timer);
      }
    }
    this.agentTimers.clear();
    this.loopCallbacks.clear();
    this.agentConfigs.clear();

    log.info('Cleanup complete');
  }
}

export default ScheduledMessagesService;
