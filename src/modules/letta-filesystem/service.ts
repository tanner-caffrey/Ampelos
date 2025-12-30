/**
 * Letta Filesystem Service
 *
 * Maintains a local cache of file contents in SQLite, synchronized
 * with Letta's filesystem. This enables patch operations by providing
 * instant access to file content without relying on Letta's API.
 *
 * Uses global state (not per-agent) since files/folders are shared resources.
 */

import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import { createComponentLogger } from '../../core/logger.js';

const SERVICE_NAME = 'letta-filesystem';
const log = createComponentLogger('LettaFilesystem');

export interface CachedFile {
  file_id: string;
  folder_id: string;
  folder_name: string;
  filename: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface FilesystemCacheState {
  /** Files keyed by file_id */
  files: Record<string, CachedFile>;
  /** Index: folder_id -> file_ids for quick folder lookups */
  folderIndex: Record<string, string[]>;
}

const DEFAULT_STATE: FilesystemCacheState = {
  files: {},
  folderIndex: {}
};

class LettaFilesystemService implements BaseService {
  private context?: ServiceContext;

  /**
   * No module dependencies
   */
  dependsOn(): string[] {
    return [];
  }

  /**
   * Initialize the service (global, once at startup)
   */
  async init(context: ServiceContext): Promise<void> {
    this.context = context;

    // Log cache stats
    const state = this.getState();
    const fileCount = Object.keys(state.files).length;
    const folderCount = Object.keys(state.folderIndex).length;

    log.info('Service initialized', { fileCount, folderCount });
  }

  /**
   * Initialize for a specific agent (no-op for this service since files are global)
   */
  async initAgent(_agentId: AgentId, _config: Record<string, unknown>): Promise<void> {
    // Files are global, not per-agent - nothing to do here
  }

  /**
   * Check if an agent can reconnect
   */
  canReconnect(_agentId: AgentId, _state: Record<string, unknown>): boolean {
    return true;
  }

  /**
   * Get global state
   */
  private getState(): FilesystemCacheState {
    if (!this.context) {
      return DEFAULT_STATE;
    }
    const state = this.context.getGlobalState<FilesystemCacheState>(SERVICE_NAME);
    return state.get() || DEFAULT_STATE;
  }

  /**
   * Save global state
   */
  private saveState(newState: FilesystemCacheState): void {
    if (!this.context) return;
    const state = this.context.getGlobalState<FilesystemCacheState>(SERVICE_NAME);
    state.set(newState);
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Store or update a file's content in the cache
   */
  storeFile(
    fileId: string,
    folderId: string,
    folderName: string,
    filename: string,
    content: string
  ): void {
    const state = this.getState();
    const now = new Date().toISOString();

    const existingFile = state.files[fileId];

    state.files[fileId] = {
      file_id: fileId,
      folder_id: folderId,
      folder_name: folderName,
      filename,
      content,
      created_at: existingFile?.created_at || now,
      updated_at: now
    };

    // Update folder index
    if (!state.folderIndex[folderId]) {
      state.folderIndex[folderId] = [];
    }
    if (!state.folderIndex[folderId].includes(fileId)) {
      state.folderIndex[folderId].push(fileId);
    }

    this.saveState(state);
    log.debug('Cached file', { filename, fileId, folderName });
  }

  /**
   * Get cached file content by file ID
   */
  getFileContent(fileId: string): string | null {
    const state = this.getState();
    const file = state.files[fileId];
    return file?.content ?? null;
  }

  /**
   * Get cached file by ID
   */
  getFile(fileId: string): CachedFile | null {
    const state = this.getState();
    return state.files[fileId] || null;
  }

  /**
   * Find a cached file by folder ID and filename
   */
  getFileByName(folderId: string, filename: string): CachedFile | null {
    const state = this.getState();
    const fileIds = state.folderIndex[folderId] || [];

    for (const fileId of fileIds) {
      const file = state.files[fileId];
      if (file && file.filename === filename) {
        return file;
      }
    }
    return null;
  }

  /**
   * Delete a file from the cache
   */
  deleteFile(fileId: string): boolean {
    const state = this.getState();
    const file = state.files[fileId];

    if (!file) {
      return false;
    }

    // Remove from files
    delete state.files[fileId];

    // Remove from folder index
    const folderFiles = state.folderIndex[file.folder_id];
    if (folderFiles) {
      const idx = folderFiles.indexOf(fileId);
      if (idx !== -1) {
        folderFiles.splice(idx, 1);
      }
      // Clean up empty folder entry
      if (folderFiles.length === 0) {
        delete state.folderIndex[file.folder_id];
      }
    }

    this.saveState(state);
    log.debug('Removed cached file', { filename: file.filename, fileId });
    return true;
  }

  /**
   * Delete all cached files in a folder
   */
  deleteFolder(folderId: string): number {
    const state = this.getState();
    const fileIds = state.folderIndex[folderId] || [];
    const count = fileIds.length;

    // Remove all files in this folder
    for (const fileId of fileIds) {
      delete state.files[fileId];
    }

    // Remove folder index
    delete state.folderIndex[folderId];

    this.saveState(state);

    if (count > 0) {
      log.debug('Removed cached files from folder', { folderId, count });
    }
    return count;
  }

  /**
   * List all cached files in a folder
   */
  listFilesInFolder(folderId: string): CachedFile[] {
    const state = this.getState();
    const fileIds = state.folderIndex[folderId] || [];

    return fileIds
      .map(id => state.files[id])
      .filter((f): f is CachedFile => f !== undefined);
  }

  /**
   * Check if a file is cached
   */
  hasFile(fileId: string): boolean {
    const state = this.getState();
    return fileId in state.files;
  }

  /**
   * Get cache statistics
   */
  getStats(): { fileCount: number; folderCount: number; totalSize: number } {
    const state = this.getState();
    const files = Object.values(state.files);

    return {
      fileCount: files.length,
      folderCount: Object.keys(state.folderIndex).length,
      totalSize: files.reduce((sum, f) => sum + (f.content?.length || 0), 0)
    };
  }

  /**
   * Cleanup on shutdown (nothing to do - state is persisted)
   */
  async cleanup(): Promise<void> {
    log.info('Cleanup complete');
  }
}

// Export class (module loader instantiates it)
export default LettaFilesystemService;
