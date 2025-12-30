/**
 * State Manager - Manages auto-persisting reactive state for services
 *
 * Provides ReactiveState instances that:
 * - Cache state in memory for fast synchronous reads
 * - Auto-persist changes with debouncing to SQLite
 * - Support immediate flush for critical updates
 *
 * Two types of state:
 * - Service state: per-agent, per-module (e.g., spatial state for agent-toula)
 * - Global state: shared across agents (e.g., spatial worlds)
 */

import type { Database } from './database.js';
import { createComponentLogger } from './logger.js';

const log = createComponentLogger('StateManager');

/**
 * State type for routing to correct database table
 */
type StateType = 'service' | 'global' | 'letta';

/**
 * Reactive state interface for auto-persisting state
 */
export interface ReactiveState<T> {
  /**
   * Synchronous read from memory cache
   */
  get(): T | undefined;

  /**
   * Update and auto-persist (debounced)
   */
  set(value: T): void;

  /**
   * Update using a function (debounced)
   */
  update(fn: (current: T | undefined) => T): void;

  /**
   * Immediate persist (bypass debounce)
   */
  flush(): Promise<void>;

  /**
   * Check if state exists
   */
  exists(): boolean;

  /**
   * Clear state
   */
  clear(): void;
}

/**
 * Internal implementation of ReactiveState
 */
class ReactiveStateImpl<T> implements ReactiveState<T> {
  private value: T | undefined;
  private pendingWrite: NodeJS.Timeout | null = null;
  private writePromise: Promise<void> | null = null;
  private writeResolve: (() => void) | null = null;

  constructor(
    private stateType: StateType,
    private agentId: string | null, // null for global state
    private namespace: string, // module name for service, namespace for global
    private manager: StateManager,
    private debounceMs: number,
    initialValue?: T
  ) {
    this.value = initialValue;
  }

  get(): T | undefined {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    this.scheduleWrite();
  }

  update(fn: (current: T | undefined) => T): void {
    this.value = fn(this.value);
    this.scheduleWrite();
  }

  async flush(): Promise<void> {
    // Cancel any pending debounced write
    if (this.pendingWrite) {
      clearTimeout(this.pendingWrite);
      this.pendingWrite = null;

      // Also resolve any pending write promise since we cancelled the timeout
      if (this.writeResolve) {
        this.writeResolve();
        this.writeResolve = null;
        this.writePromise = null;
      }
    }

    // Wait for any in-flight write to complete
    if (this.writePromise) {
      await this.writePromise;
    }

    // Write immediately
    this.manager.writeState(this.stateType, this.agentId, this.namespace, this.value);
  }

  exists(): boolean {
    return this.value !== undefined;
  }

  clear(): void {
    this.value = undefined;
    this.scheduleWrite();
  }

  private scheduleWrite(): void {
    // Cancel any existing pending write
    if (this.pendingWrite) {
      clearTimeout(this.pendingWrite);
    }

    // Create a promise that resolves when the write completes
    if (!this.writePromise) {
      this.writePromise = new Promise((resolve) => {
        this.writeResolve = resolve;
      });
    }

    // Schedule the write
    this.pendingWrite = setTimeout(() => {
      this.pendingWrite = null;
      try {
        this.manager.writeState(this.stateType, this.agentId, this.namespace, this.value);
      } catch (error) {
        log.error('Failed to write state', {
          stateType: this.stateType,
          agentId: this.agentId ?? undefined,
          namespace: this.namespace,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        // Resolve the write promise
        if (this.writeResolve) {
          this.writeResolve();
          this.writeResolve = null;
          this.writePromise = null;
        }
      }
    }, this.debounceMs);
  }

  /**
   * Check if there's a pending write
   */
  hasPendingWrite(): boolean {
    return this.pendingWrite !== null || this.writePromise !== null;
  }

  /**
   * Get cache key for this state
   */
  getCacheKey(): string {
    if (this.stateType === 'global') {
      return `global.${this.namespace}`;
    }
    return `${this.stateType}.${this.agentId}.${this.namespace}`;
  }
}

/**
 * Options for StateManager
 */
export interface StateManagerOptions {
  /**
   * Debounce delay in milliseconds (default: 100)
   */
  debounceMs?: number;
}

/**
 * State Manager class
 */
export class StateManager {
  private db: Database;
  private debounceMs: number;
  private cache: Map<string, ReactiveStateImpl<unknown>> = new Map();
  private initialized = false;

  constructor(db: Database, options: StateManagerOptions = {}) {
    this.db = db;
    this.debounceMs = options.debounceMs ?? 100;
  }

  /**
   * Initialize the state manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // SQLite is synchronous, so no special initialization needed
    this.initialized = true;
    log.info('Initialized');
  }

  /**
   * Get reactive state for a service (per-agent)
   */
  getServiceState<T>(agentId: string, serviceName: string): ReactiveState<T> {
    const cacheKey = `service.${agentId}.${serviceName}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as ReactiveState<T>;
    }

    // Read initial value from database (synchronous!)
    const initialValue = this.db.getServiceState(agentId, serviceName) as T | undefined;

    const state = new ReactiveStateImpl<T>(
      'service',
      agentId,
      serviceName,
      this,
      this.debounceMs,
      initialValue
    );

    this.cache.set(cacheKey, state as ReactiveStateImpl<unknown>);
    return state;
  }

  /**
   * Get reactive state for global/shared data
   */
  getGlobalState<T>(namespace: string): ReactiveState<T> {
    const cacheKey = `global.${namespace}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as ReactiveState<T>;
    }

    // Read initial value from database (synchronous!)
    const initialValue = this.db.getGlobalState(namespace) as T | undefined;

    const state = new ReactiveStateImpl<T>(
      'global',
      null,
      namespace,
      this,
      this.debounceMs,
      initialValue
    );

    this.cache.set(cacheKey, state as ReactiveStateImpl<unknown>);
    return state;
  }

  /**
   * Get reactive state for Letta (per-agent, dedicated table)
   */
  getLettaState<T>(agentId: string): ReactiveState<T> {
    const cacheKey = `letta.${agentId}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as ReactiveState<T>;
    }

    // Read initial value from database
    const row = this.db.getLettaState(agentId);
    const initialValue = row ? this.lettaRowToState<T>(row) : undefined;

    const state = new ReactiveStateImpl<T>(
      'letta',
      agentId,
      'letta',
      this,
      this.debounceMs,
      initialValue
    );

    this.cache.set(cacheKey, state as ReactiveStateImpl<unknown>);
    return state;
  }

  /**
   * Flush all pending writes
   */
  async flushAll(): Promise<void> {
    const flushPromises: Promise<void>[] = [];

    for (const state of this.cache.values()) {
      if (state.hasPendingWrite()) {
        flushPromises.push(state.flush());
      }
    }

    await Promise.all(flushPromises);
    log.debug('Flushed all pending writes');
  }

  /**
   * Write state to database (called by ReactiveState)
   */
  writeState(stateType: StateType, agentId: string | null, namespace: string, value: unknown): void {
    if (stateType === 'global') {
      if (value === undefined) {
        // Can't delete global state in current schema, just set empty
        this.db.setGlobalState(namespace, {});
      } else {
        this.db.setGlobalState(namespace, value as Record<string, unknown>);
      }
    } else if (stateType === 'letta') {
      if (!agentId) return;
      if (value === undefined) {
        // Clear Letta state
        this.db.setLettaState(agentId, { initialized: 0 });
      } else {
        this.stateToLettaRow(agentId, value as Record<string, unknown>);
      }
    } else {
      // Service state
      if (!agentId) return;
      if (value === undefined) {
        this.db.deleteServiceState(agentId, namespace);
      } else {
        this.db.setServiceState(agentId, namespace, value as Record<string, unknown>);
      }
    }
  }

  /**
   * Delete all state for an agent
   */
  async deleteAgentState(agentId: string): Promise<void> {
    // Remove from cache
    const prefixes = [`service.${agentId}.`, `letta.${agentId}`];
    for (const key of this.cache.keys()) {
      if (prefixes.some(p => key.startsWith(p))) {
        this.cache.delete(key);
      }
    }

    // Database cleanup is handled by CASCADE when agent is deleted
    // But we can also explicitly clear if needed
    const modules = this.db.getAgentModules(agentId);
    for (const mod of modules) {
      this.db.deleteServiceState(agentId, mod.module_name);
    }
  }

  /**
   * Get all service states for an agent (for API responses)
   */
  async getAgentStates(agentId: string): Promise<Record<string, unknown>> {
    return this.db.getAllServiceStates(agentId);
  }

  /**
   * Preload state for an agent (ensures state is in cache before init)
   * Note: With synchronous SQLite, this is less necessary but still useful
   * for ensuring cache consistency
   */
  async preloadAgentState(agentId: string, moduleNames: string[]): Promise<void> {
    for (const moduleName of moduleNames) {
      // Just accessing the state will cache it
      this.getServiceState(agentId, moduleName);
    }
  }

  /**
   * Preload global state for namespaces
   */
  async preloadGlobalState(namespaces: string[]): Promise<void> {
    for (const namespace of namespaces) {
      // Just accessing the state will cache it
      this.getGlobalState(namespace);
    }
  }

  // ==========================================================================
  // Letta State Helpers
  // ==========================================================================

  private lettaRowToState<T>(row: {
    agent_id: string;
    letta_agent_id: string | null;
    backend: 'cloud' | 'self-hosted' | null;
    initialized: number;
    created_at: string | null;
    attached_agent_blocks: string;
  }): T {
    return {
      letta_agent_id: row.letta_agent_id,
      backend: row.backend,
      initialized: Boolean(row.initialized),
      created_at: row.created_at,
      attached_agent_blocks: JSON.parse(row.attached_agent_blocks || '{}'),
    } as T;
  }

  private stateToLettaRow(agentId: string, state: Record<string, unknown>): void {
    this.db.setLettaState(agentId, {
      letta_agent_id: state.letta_agent_id as string | undefined,
      backend: state.backend as 'cloud' | 'self-hosted' | undefined,
      initialized: state.initialized ? 1 : 0,
      created_at: state.created_at as string | undefined,
      attached_agent_blocks: JSON.stringify(state.attached_agent_blocks ?? {}),
    });
  }
}
