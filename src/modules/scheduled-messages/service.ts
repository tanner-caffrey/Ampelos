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

// Maximum safe delay for setTimeout (24 days in ms, safely under 2^31-1)
const MAX_TIMEOUT_MS = 24 * 24 * 60 * 60 * 1000; // ~2.07 billion ms

/**
 * Defines a recurring schedule pattern for recurring_at type.
 * Times are interpreted in server local time.
 */
export interface RecurringPattern {
  /**
   * Frequency of recurrence
   * - daily: fires every day at specified times
   * - weekly: fires on specific days of the week
   * - monthly: fires on specific days of the month
   * - interval: fires every N days
   */
  frequency: 'daily' | 'weekly' | 'monthly' | 'interval';

  /**
   * Times of day to fire (24-hour format: "HH:MM")
   * Examples: ["09:00", "17:30"]
   */
  times: string[];

  /**
   * For 'weekly': days of week (0=Sunday, 1=Monday, ..., 6=Saturday)
   * Examples: [1, 3, 5] for Mon/Wed/Fri
   */
  days_of_week?: number[];

  /**
   * For 'monthly': days of month (1-31)
   * Examples: [1, 15] for 1st and 15th
   * If day doesn't exist in month (e.g., 31 in February), skips that occurrence.
   */
  days_of_month?: number[];

  /**
   * For 'interval': number of days between occurrences
   * Example: 3 for every 3 days
   */
  interval_days?: number;
}

export interface Schedule {
  id: string;
  type: 'time' | 'loop' | 'once_delay' | 'once_at' | 'recurring_at';
  interval: number; // seconds for time-based/once_delay, loop count for loop-based, ignored for once_at/recurring_at
  fire_at?: string; // ISO 8601 timestamp for once_at; pre-calculated next fire time for recurring_at
  recurring_pattern?: RecurringPattern; // Pattern definition for recurring_at type
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
  type: 'time' | 'loop' | 'once_delay' | 'once_at' | 'recurring_at';
  interval?: number; // Required for time/loop/once_delay, ignored for once_at/recurring_at
  fire_at?: string;  // Required for once_at (ISO 8601 timestamp)
  recurring_pattern?: RecurringPattern; // Required for recurring_at
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

  // Pending catch-up schedules that need to fire after startup completes
  // This prevents race conditions where missed schedules fire before all services are ready
  private pendingCatchUps: Map<AgentId, Array<{ schedule: Schedule; removeAfterFire: boolean }>> = new Map();

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

    // Debug: detect if initAgent is being called multiple times
    const existingTimers = this.agentTimers.get(agentId);
    if (existingTimers && existingTimers.size > 0) {
      log.warn('initAgent called but agent already has active timers - clearing first', {
        agentId,
        existingTimerCount: existingTimers.size,
        timerIds: Array.from(existingTimers.keys())
      });
      // Clear all existing timers for this agent before re-initializing
      for (const timer of existingTimers.values()) {
        clearInterval(timer);
        clearTimeout(timer);
      }
      existingTimers.clear();
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
   * Called after ALL services have finished initializing and server is listening.
   * Processes any catch-up schedules that were queued during restoreTimers().
   */
  async onStartupComplete(agentId: AgentId): Promise<void> {
    const catchUps = this.pendingCatchUps.get(agentId);
    if (!catchUps || catchUps.length === 0) {
      return;
    }

    log.info('Processing catch-up schedules after startup', {
      agentId,
      count: catchUps.length
    });

    // Clear the queue before processing (prevents duplicate processing if called again)
    this.pendingCatchUps.delete(agentId);

    // Process each catch-up sequentially to avoid overwhelming the agent
    for (const { schedule, removeAfterFire } of catchUps) {
      try {
        if (schedule.type === 'recurring_at') {
          // Fire the missed occurrence
          await this.fireSchedule(agentId, schedule, false);

          // Calculate and schedule next occurrence
          if (schedule.recurring_pattern) {
            const nextFireTime = this.calculateNextRecurringFire(schedule.recurring_pattern, new Date());
            if (nextFireTime) {
              // Update state with new fire_at
              const state = this.getAgentState(agentId);
              const stateSchedule = state.schedules[schedule.id];
              if (stateSchedule) {
                stateSchedule.fire_at = nextFireTime;
                this.saveAgentState(agentId, state);

                const delay = new Date(nextFireTime).getTime() - Date.now();
                this.startRecurringAtTimer(agentId, schedule, delay);
                log.info('Rescheduled recurring_at after catch-up fire', {
                  scheduleId: schedule.id,
                  agentId,
                  next_fire_at: nextFireTime
                });
              }
            }
          }
        } else {
          // For all other types, just fire the schedule
          await this.fireSchedule(agentId, schedule, removeAfterFire);
        }

        log.info('Catch-up schedule fired', {
          scheduleId: schedule.id,
          agentId,
          type: schedule.type
        });
      } catch (error) {
        log.error('Failed to fire catch-up schedule', {
          scheduleId: schedule.id,
          agentId,
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue processing other catch-ups even if one fails
      }
    }

    log.info('Finished processing catch-up schedules', { agentId });
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
   * Queue a catch-up schedule to fire after startup completes.
   * This prevents the race condition where missed schedules fire
   * before all services have finished initializing.
   */
  private queueCatchUp(agentId: AgentId, schedule: Schedule, removeAfterFire: boolean): void {
    if (!this.pendingCatchUps.has(agentId)) {
      this.pendingCatchUps.set(agentId, []);
    }
    this.pendingCatchUps.get(agentId)!.push({ schedule, removeAfterFire });
    log.info('Queued catch-up schedule for startup completion', {
      scheduleId: schedule.id,
      agentId,
      type: schedule.type,
      removeAfterFire
    });
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
          // Missed fire - queue for catch-up after startup completes, then start regular timer
          log.info('Queuing missed schedule for catch-up', { scheduleId: schedule.id, agentId });
          this.queueCatchUp(agentId, schedule, false);
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
          // Missed - queue for catch-up after startup completes
          log.info('Queuing missed one-time schedule for catch-up', { scheduleId: schedule.id, agentId });
          this.queueCatchUp(agentId, schedule, true);
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
          // Missed - queue for catch-up after startup completes
          log.info('Queuing missed one-time schedule for catch-up', { scheduleId: schedule.id, agentId });
          this.queueCatchUp(agentId, schedule, true);
        } else {
          // Resume with remaining time
          const remaining = fireTime - now;
          log.info('Resuming one-time schedule', { scheduleId: schedule.id, agentId, fireAt: schedule.fire_at });
          this.startOneTimeTimer(agentId, schedule, remaining);
        }
      } else if (schedule.type === 'recurring_at') {
        // Recurring pattern schedule
        const fireTime = schedule.fire_at ? new Date(schedule.fire_at).getTime() : 0;

        if (now >= fireTime) {
          // Missed occurrence - queue for catch-up after startup completes
          // The onStartupComplete handler will fire and reschedule
          log.info('Queuing missed recurring_at schedule for catch-up', {
            scheduleId: schedule.id,
            agentId,
            missed_fire_at: schedule.fire_at
          });

          // Queue the catch-up (special handling in onStartupComplete)
          this.queueCatchUp(agentId, schedule, false);
        } else {
          // Not yet time - resume with remaining time
          const remaining = fireTime - now;
          log.info('Resuming recurring_at schedule', {
            scheduleId: schedule.id,
            agentId,
            fireAt: schedule.fire_at,
            firesInSeconds: Math.round(remaining / 1000)
          });
          this.startRecurringAtTimer(agentId, schedule, remaining);
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
    const timers = this.agentTimers.get(agentId);
    if (timers) {
      // Clear any existing timer first to prevent duplicates
      const existingTimer = timers.get(schedule.id);
      if (existingTimer) {
        clearInterval(existingTimer);
        clearTimeout(existingTimer);
      }
    }

    const intervalMs = schedule.interval * 1000;
    const timer = setInterval(async () => {
      await this.fireSchedule(agentId, schedule);
    }, intervalMs);

    if (timers) {
      timers.set(schedule.id, timer);
    }
  }

  /**
   * Start a timer with initial delay, then switch to regular interval
   */
  private startTimerWithDelay(agentId: AgentId, schedule: Schedule, delayMs: number): void {
    const timers = this.agentTimers.get(agentId);
    if (timers) {
      // Clear any existing timer first to prevent duplicates
      const existingTimer = timers.get(schedule.id);
      if (existingTimer) {
        clearInterval(existingTimer);
        clearTimeout(existingTimer);
      }
    }

    const timeout = setTimeout(async () => {
      await this.fireSchedule(agentId, schedule);
      this.startTimer(agentId, schedule);
    }, delayMs);

    if (timers) {
      timers.set(schedule.id, timeout);
    }
  }

  /**
   * Start a one-time timer that fires once and auto-removes the schedule.
   * Handles long delays (> 24 days) by chaining multiple timers to avoid
   * setTimeout's 32-bit integer overflow (~24.85 days max).
   */
  private startOneTimeTimer(agentId: AgentId, schedule: Schedule, delayMs: number): void {
    const timers = this.agentTimers.get(agentId);
    if (timers) {
      // Clear any existing timer first to prevent duplicates
      const existingTimer = timers.get(schedule.id);
      if (existingTimer) {
        clearInterval(existingTimer);
        clearTimeout(existingTimer);
      }
    }

    if (delayMs > MAX_TIMEOUT_MS) {
      // Delay exceeds safe setTimeout limit - chain timers
      log.info('Long delay detected, using chained timer', {
        scheduleId: schedule.id,
        agentId,
        totalDelayMs: delayMs,
        totalDelayDays: (delayMs / 1000 / 60 / 60 / 24).toFixed(1),
        nextCheckMs: MAX_TIMEOUT_MS
      });

      const timeout = setTimeout(() => {
        // Recalculate remaining delay based on actual fire_at time
        // This is more accurate than subtracting MAX_TIMEOUT_MS
        const remaining = schedule.fire_at
          ? new Date(schedule.fire_at).getTime() - Date.now()
          : delayMs - MAX_TIMEOUT_MS;

        if (remaining <= 0) {
          // Time to fire
          this.fireSchedule(agentId, schedule, true);
        } else {
          // Set another timer for remaining time
          this.startOneTimeTimer(agentId, schedule, remaining);
        }
      }, MAX_TIMEOUT_MS);

      const timers = this.agentTimers.get(agentId);
      if (timers) {
        timers.set(schedule.id, timeout);
      }
    } else {
      // Normal case - delay is within safe limits
      const timeout = setTimeout(async () => {
        await this.fireSchedule(agentId, schedule, true); // true = remove after fire
      }, delayMs);

      const timers = this.agentTimers.get(agentId);
      if (timers) {
        timers.set(schedule.id, timeout);
      }
    }
  }

  /**
   * Calculate the next fire time for a recurring_at schedule.
   * All calculations use server local time.
   *
   * @param pattern The recurring pattern
   * @param afterTime Calculate next fire after this time (default: now)
   * @returns ISO 8601 UTC timestamp of next fire, or null if no valid next time
   */
  private calculateNextRecurringFire(
    pattern: RecurringPattern,
    afterTime: Date = new Date()
  ): string | null {
    const candidates: Date[] = [];
    const now = afterTime;

    // Check times for today and next 366 days (covers yearly edge cases)
    for (let dayOffset = 0; dayOffset <= 366; dayOffset++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + dayOffset);

      // Check if this day matches the pattern
      if (!this.isDayMatchingPattern(checkDate, pattern, now)) {
        continue;
      }

      // Check each time slot for this day
      for (const timeStr of pattern.times) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const candidate = new Date(checkDate);
        candidate.setHours(hours, minutes, 0, 0);

        // Verify the time wasn't shifted by DST (time might not exist)
        if (candidate.getHours() !== hours || candidate.getMinutes() !== minutes) {
          // DST gap - this time doesn't exist today, skip
          continue;
        }

        // Must be in the future (with small buffer for race conditions)
        if (candidate.getTime() > now.getTime() + 1000) {
          candidates.push(candidate);
        }
      }

      // Stop once we have at least one candidate
      if (candidates.length > 0) {
        break;
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Return earliest candidate as UTC ISO string
    const earliest = candidates.sort((a, b) => a.getTime() - b.getTime())[0];
    return earliest.toISOString();
  }

  /**
   * Check if a given date matches the recurring pattern's day criteria.
   */
  private isDayMatchingPattern(
    date: Date,
    pattern: RecurringPattern,
    referenceTime: Date
  ): boolean {
    switch (pattern.frequency) {
      case 'daily':
        return true;

      case 'weekly':
        if (!pattern.days_of_week || pattern.days_of_week.length === 0) {
          return true; // No days specified = every day
        }
        return pattern.days_of_week.includes(date.getDay());

      case 'monthly':
        if (!pattern.days_of_month || pattern.days_of_month.length === 0) {
          return true;
        }
        return pattern.days_of_month.includes(date.getDate());

      case 'interval':
        if (!pattern.interval_days || pattern.interval_days <= 0) {
          return true;
        }
        // Calculate days since reference time
        const refStart = new Date(referenceTime);
        refStart.setHours(0, 0, 0, 0);
        const checkStart = new Date(date);
        checkStart.setHours(0, 0, 0, 0);
        const daysDiff = Math.floor(
          (checkStart.getTime() - refStart.getTime()) / (24 * 60 * 60 * 1000)
        );
        return daysDiff >= 0 && daysDiff % pattern.interval_days === 0;

      default:
        return false;
    }
  }

  /**
   * Start a timer for recurring_at schedule.
   * Uses setTimeout to next occurrence, then reschedules after firing.
   * Handles long delays via chaining (same as startOneTimeTimer).
   */
  private startRecurringAtTimer(agentId: AgentId, schedule: Schedule, delayMs: number): void {
    // Clear any existing timer for this schedule
    const timers = this.agentTimers.get(agentId);
    if (timers) {
      const existingTimer = timers.get(schedule.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
    }

    if (delayMs > MAX_TIMEOUT_MS) {
      // Long delay - chain timers
      log.info('Long delay for recurring_at, using chained timer', {
        scheduleId: schedule.id,
        agentId,
        totalDelayMs: delayMs,
        totalDelayDays: (delayMs / 1000 / 60 / 60 / 24).toFixed(1)
      });

      const timeout = setTimeout(() => {
        const remaining = schedule.fire_at
          ? new Date(schedule.fire_at).getTime() - Date.now()
          : delayMs - MAX_TIMEOUT_MS;

        if (remaining <= 0) {
          // Time to fire
          this.fireRecurringSchedule(agentId, schedule);
        } else {
          // Chain another timer
          this.startRecurringAtTimer(agentId, schedule, remaining);
        }
      }, MAX_TIMEOUT_MS);

      if (timers) {
        timers.set(schedule.id, timeout);
      }
    } else {
      // Normal case
      const timeout = setTimeout(async () => {
        await this.fireRecurringSchedule(agentId, schedule);
      }, delayMs);

      if (timers) {
        timers.set(schedule.id, timeout);
      }
    }
  }

  /**
   * Fire a recurring_at schedule and reschedule for next occurrence.
   * Unlike once_at, this does NOT remove the schedule after firing.
   */
  private async fireRecurringSchedule(agentId: AgentId, schedule: Schedule): Promise<void> {
    // Fire the schedule (reuse existing fireSchedule, but don't remove)
    await this.fireSchedule(agentId, schedule, false); // false = don't remove

    // Calculate next fire time
    const state = this.getAgentState(agentId);
    const stateSchedule = state.schedules[schedule.id];

    if (!stateSchedule || !stateSchedule.enabled || !stateSchedule.recurring_pattern) {
      return;
    }

    const nextFireTime = this.calculateNextRecurringFire(
      stateSchedule.recurring_pattern,
      new Date() // Calculate from now (just after firing)
    );

    if (!nextFireTime) {
      log.warn('Could not calculate next fire time for recurring_at', {
        scheduleId: schedule.id,
        agentId
      });
      return;
    }

    // Update schedule with new fire_at
    stateSchedule.fire_at = nextFireTime;
    this.saveAgentState(agentId, state);

    log.info('Rescheduled recurring_at for next occurrence', {
      scheduleId: schedule.id,
      agentId,
      next_fire_at_utc: nextFireTime,
      next_fire_at_local: new Date(nextFireTime).toLocaleString()
    });

    // Set timer for next occurrence
    const delay = new Date(nextFireTime).getTime() - Date.now();
    this.startRecurringAtTimer(agentId, schedule, delay);
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

      // Diagnostic logging for once_at schedules
      if (schedule.type === 'once_at' && schedule.fire_at) {
        const nowMs = Date.now();
        const expectedFireMs = new Date(schedule.fire_at).getTime();
        const driftMs = nowMs - expectedFireMs;
        log.info('once_at schedule FIRING - timing analysis', {
          scheduleId: schedule.id,
          agentId,
          expected_fire_at_utc: schedule.fire_at,
          expected_fire_at_local: new Date(expectedFireMs).toLocaleString(),
          actual_fire_time_utc: new Date(nowMs).toISOString(),
          actual_fire_time_local: new Date(nowMs).toLocaleString(),
          drift_ms: driftMs,
          drift_human: `${Math.abs(driftMs / 1000 / 60).toFixed(1)} minutes ${driftMs >= 0 ? 'LATE' : 'EARLY'}`,
          created_at: schedule.created_at
        });
      }

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

      // Diagnostic logging for timestamp debugging
      const nowMs = Date.now();
      const nowUtc = new Date(nowMs).toISOString();
      const nowLocal = new Date(nowMs).toLocaleString();
      log.info('once_at schedule creation - raw input', {
        agentId,
        raw_fire_at: options.fire_at,
        current_time_utc: nowUtc,
        current_time_local: nowLocal,
        server_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });

      // Normalize timestamp: if no timezone specified, treat as LOCAL time and convert to UTC
      let normalizedFireAt = options.fire_at;
      if (!options.fire_at.endsWith('Z') && !options.fire_at.match(/[+-]\d{2}:\d{2}$/)) {
        // Parse as local time (JavaScript's default for strings without timezone)
        const localDate = new Date(options.fire_at);
        if (!isNaN(localDate.getTime())) {
          // Convert to UTC ISO string
          normalizedFireAt = localDate.toISOString();
          log.info('once_at schedule creation - normalized timestamp (local to UTC)', {
            agentId,
            original: options.fire_at,
            interpreted_as_local: localDate.toLocaleString(),
            normalized_utc: normalizedFireAt,
            server_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          });
        } else {
          // Fallback: just add Z if parsing failed (will be caught by validation below)
          normalizedFireAt = options.fire_at + 'Z';
        }
      }
      options.fire_at = normalizedFireAt;

      const fireTime = new Date(normalizedFireAt).getTime();
      if (isNaN(fireTime)) {
        throw new Error('Invalid fire_at timestamp. Use ISO 8601 format (e.g., 2024-12-17T15:00:00Z or 2024-12-17T15:00:00)');
      }

      const delayMs = fireTime - nowMs;
      log.info('once_at schedule creation - timing calculation', {
        agentId,
        fire_at_parsed_utc: new Date(fireTime).toISOString(),
        fire_at_parsed_local: new Date(fireTime).toLocaleString(),
        delay_ms: delayMs,
        delay_human: delayMs > 0
          ? `${Math.floor(delayMs / 1000 / 60)} minutes ${Math.floor((delayMs / 1000) % 60)} seconds`
          : 'NEGATIVE (in the past!)'
      });

      if (fireTime <= Date.now()) {
        throw new Error('fire_at must be in the future');
      }
    } else if (options.type === 'recurring_at') {
      if (!options.recurring_pattern) {
        throw new Error('recurring_pattern is required for recurring_at type');
      }

      const pattern = options.recurring_pattern;

      // Validate frequency
      if (!['daily', 'weekly', 'monthly', 'interval'].includes(pattern.frequency)) {
        throw new Error('Invalid frequency. Must be daily, weekly, monthly, or interval');
      }

      // Validate times array
      if (!pattern.times || pattern.times.length === 0) {
        throw new Error('At least one time must be specified in times array');
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
      for (const time of pattern.times) {
        if (!timeRegex.test(time)) {
          throw new Error(`Invalid time format "${time}". Use HH:MM (24-hour format)`);
        }
      }

      // Validate frequency-specific fields
      if (pattern.frequency === 'weekly' && pattern.days_of_week) {
        for (const day of pattern.days_of_week) {
          if (day < 0 || day > 6) {
            throw new Error('days_of_week must be 0-6 (0=Sunday)');
          }
        }
      }

      if (pattern.frequency === 'monthly' && pattern.days_of_month) {
        for (const day of pattern.days_of_month) {
          if (day < 1 || day > 31) {
            throw new Error('days_of_month must be 1-31');
          }
        }
      }

      if (pattern.frequency === 'interval') {
        if (!pattern.interval_days || pattern.interval_days < 1) {
          throw new Error('interval_days must be at least 1 for interval frequency');
        }
      }

      // Calculate first fire time
      const firstFireTime = this.calculateNextRecurringFire(pattern);
      if (!firstFireTime) {
        throw new Error('Could not calculate next fire time for the given pattern');
      }

      // Log for debugging
      log.info('recurring_at schedule creation', {
        agentId,
        pattern,
        first_fire_at_utc: firstFireTime,
        first_fire_at_local: new Date(firstFireTime).toLocaleString(),
        server_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });

      // Store the calculated fire_at
      options.fire_at = firstFireTime;
    }

    // Create schedule
    const schedule: Schedule = {
      id: `sched-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      type: options.type,
      interval: options.interval || 0,
      fire_at: options.fire_at,
      recurring_pattern: options.recurring_pattern,
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
    } else if (schedule.type === 'recurring_at') {
      const delay = new Date(schedule.fire_at!).getTime() - Date.now();
      this.startRecurringAtTimer(agentId, schedule, delay);
    }
    // 'loop' type has no timer - handled in onLoopComplete

    // Persist state
    this.saveAgentState(agentId, state);

    const logMeta = schedule.type === 'once_at' || schedule.type === 'recurring_at'
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

    // Clear any pending catch-ups
    this.pendingCatchUps.delete(agentId);

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
    this.pendingCatchUps.clear();
    this.loopCallbacks.clear();
    this.agentConfigs.clear();

    log.info('Cleanup complete');
  }
}

export default ScheduledMessagesService;
