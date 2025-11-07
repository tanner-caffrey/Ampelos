/**
 * Database layer using LowDB for persistent storage
 */

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import type { AgentId } from '../types/agent.js';
import type { ScopedDatabase } from '../types/service.js';

/**
 * Database structure
 */
interface DatabaseSchema {
  agents: Record<string, {
    name: string;
    enabled: boolean;
    modules: string[];
    metadata: {
      last_request_time?: string;
      last_response_time?: string;
      [key: string]: unknown;
    };
  }>;
  states: Record<string, Record<string, unknown>>;
  configs: Record<string, Record<string, unknown>>;
}

/**
 * Default database structure
 */
const defaultData: DatabaseSchema = {
  agents: {},
  states: {},
  configs: {},
};

/**
 * Scoped database implementation
 */
class ScopedDatabaseImpl implements ScopedDatabase {
  private db: Low<DatabaseSchema>;
  private path: string[];

  constructor(db: Low<DatabaseSchema>, path: string[]) {
    this.db = db;
    this.path = path;
  }

  async read<T = unknown>(): Promise<T> {
    await this.db.read();
    let current: unknown = this.db.data;
    for (const key of this.path) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return {} as T;
      }
    }
    return (current ?? {}) as T;
  }

  async update<T = unknown>(updater: (state: T) => T | Promise<T>): Promise<T> {
    await this.db.read();
    
    // Navigate to the target object
    let current: unknown = this.db.data;
    for (let i = 0; i < this.path.length - 1; i++) {
      const key = this.path[i];
      if (!current || typeof current !== 'object') {
        throw new Error(`Invalid database path at ${key}`);
      }
      if (!(key in current)) {
        (current as Record<string, unknown>)[key] = {};
      }
      current = (current as Record<string, unknown>)[key];
    }
    
    const lastKey = this.path[this.path.length - 1];
    if (!current || typeof current !== 'object') {
      throw new Error(`Invalid database path at ${lastKey}`);
    }
    
    const currentState = ((current as Record<string, unknown>)[lastKey] ?? {}) as T;
    const newState = await updater(currentState);
    (current as Record<string, unknown>)[lastKey] = newState;
    
    await this.db.write();
    return newState;
  }

  async write<T = unknown>(state: T): Promise<void> {
    await this.update(() => state);
  }

  getPath(): string {
    return this.path.join('.');
  }
}

/**
 * Database manager
 */
export class Database {
  private db: Low<DatabaseSchema>;
  private dbPath: string;

  constructor(dbPath?: string) {
    // Default to storage/ampelos.db.json relative to project root
    // This assumes the process is run from the project root
    this.dbPath = dbPath ?? join(process.cwd(), 'storage', 'ampelos.db.json');
    const adapter = new JSONFile<DatabaseSchema>(this.dbPath);
    this.db = new Low(adapter, defaultData);
  }

  /**
   * Initialize the database (ensure directory exists, load data)
   */
  async initialize(): Promise<void> {
    // Ensure storage directory exists
    const storageDir = dirname(this.dbPath);
    await mkdir(storageDir, { recursive: true });
    
    // Read existing data or use defaults
    await this.db.read();
    if (!this.db.data) {
      this.db.data = defaultData;
      await this.db.write();
    }
  }

  /**
   * Get scoped database access for a specific agent and service
   * @param agentId Agent identifier
   * @param serviceName Service name
   * @returns Scoped database instance
   */
  getDB(agentId: AgentId, serviceName: string): ScopedDatabase {
    const path = ['states', agentId, serviceName];
    return new ScopedDatabaseImpl(this.db, path);
  }

  /**
   * Get direct access to the underlying database (for core operations)
   * Use with caution - prefer scoped access for services
   */
  getRawDB(): Low<DatabaseSchema> {
    return this.db;
  }

  /**
   * Get the database path
   */
  getPath(): string {
    return this.dbPath;
  }
}

