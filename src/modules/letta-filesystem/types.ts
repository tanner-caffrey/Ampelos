/**
 * Types for the Letta Filesystem module
 *
 * Note: Agents access files using Letta's built-in tools (open_file, grep_file, search_file)
 * after folders are attached. This module manages folder/file infrastructure.
 */

// ============================================
// Action Types
// ============================================

export type FolderAction =
  | 'create_folder'
  | 'delete_folder'
  | 'list_folders'
  | 'get_folder'
  | 'update_folder'
  | 'attach_folder'
  | 'detach_folder'
  | 'list_attached_folders';

export type FileAction =
  | 'upload_file'
  | 'write_file'
  | 'delete_file'
  | 'list_files'
  | 'patch_file'
  | 'open_file'
  | 'close_file'
  | 'list_open_files';

export type FilesystemAction = FolderAction | FileAction;

// ============================================
// Action Parameters (using names, not IDs)
// ============================================

export interface CreateFolderParams {
  action: 'create_folder';
  name: string;
  description?: string;
}

export interface DeleteFolderParams {
  action: 'delete_folder';
  folder_name: string;
}

export interface ListFoldersParams {
  action: 'list_folders';
}

export interface GetFolderParams {
  action: 'get_folder';
  folder_name: string;
}

export interface UpdateFolderParams {
  action: 'update_folder';
  folder_name: string;
  new_name?: string;
  description?: string;
}

export interface AttachFolderParams {
  action: 'attach_folder';
  folder_name: string;
}

export interface DetachFolderParams {
  action: 'detach_folder';
  folder_name: string;
}

export interface ListAttachedFoldersParams {
  action: 'list_attached_folders';
}

export interface UploadFileParams {
  action: 'upload_file';
  folder_name: string;
  filename: string;
  content: string;
}

export interface WriteFileParams {
  action: 'write_file';
  folder_name: string;
  filename: string;
  content: string;
}

export interface DeleteFileParams {
  action: 'delete_file';
  folder_name: string;
  filename: string;
}

export interface ListFilesParams {
  action: 'list_files';
  folder_name: string;
}

export interface PatchFileParams {
  action: 'patch_file';
  folder_name: string;
  filename: string;
  patch: string;
}

export interface OpenFileParams {
  action: 'open_file';
  filename: string;
}

export interface CloseFileParams {
  action: 'close_file';
  filename: string;
}

export interface ListOpenFilesParams {
  action: 'list_open_files';
}

export type FilesystemParams =
  | CreateFolderParams
  | DeleteFolderParams
  | ListFoldersParams
  | GetFolderParams
  | UpdateFolderParams
  | AttachFolderParams
  | DetachFolderParams
  | ListAttachedFoldersParams
  | UploadFileParams
  | WriteFileParams
  | DeleteFileParams
  | ListFilesParams
  | PatchFileParams
  | OpenFileParams
  | CloseFileParams
  | ListOpenFilesParams;

// ============================================
// Response Types
// ============================================

export interface FolderResponse {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface FileResponse {
  id: string;
  filename: string;
  size?: number;
  type?: string;
  status?: string;
  created_at: string;
}

export interface PatchResponse {
  success: boolean;
  filename: string;
  hunks_applied: number;
}

export interface PatchErrorResponse {
  success: false;
  error: string;
  hunk_index?: number;
  expected?: string[];
  found?: string[];
}
