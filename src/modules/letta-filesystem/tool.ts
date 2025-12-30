/**
 * Letta Filesystem Tool
 *
 * Allows agents to manage folders and files in Letta's filesystem,
 * including a unified-diff patch system for modifying text file contents.
 *
 * All operations use folder/file NAMES (not IDs) for ease of use.
 * File contents are cached locally in SQLite for instant patch access.
 */

import type { ToolDefinition, ToolResult } from '../../types/tool.js';
import type { LettaClientWrapper } from '../../core/letta/letta-client.js';
import { applyPatch, validatePatch } from './patch.js';
import type { FilesystemAction } from './types.js';
import type LettaFilesystemService from './service.js';

/**
 * Get the Letta client wrapper from context
 */
function getLettaClient(context: any): LettaClientWrapper {
  const lettaManager = context.getLettaManager?.();
  if (!lettaManager) {
    throw new Error('LettaManager not available');
  }

  // Get the client for the agent's backend
  const backend = lettaManager.getAgentBackend(context.agentId);
  const client = lettaManager.getClientForBackend(backend);

  if (!client) {
    throw new Error('Letta client not available');
  }

  return client;
}

/**
 * Get the Letta agent ID for the current Ampelos agent
 */
function getLettaAgentId(context: any): string {
  const lettaManager = context.getLettaManager?.();
  if (!lettaManager) {
    throw new Error('LettaManager not available');
  }

  const lettaAgentId = lettaManager.getLettaAgentId(context.agentId);
  if (!lettaAgentId) {
    throw new Error('Letta agent ID not found for this agent');
  }

  return lettaAgentId;
}

/**
 * Get the filesystem service for local file caching
 */
function getFilesystemService(context: any): LettaFilesystemService {
  const service = context.getService?.('letta-filesystem');
  if (!service) {
    throw new Error('LettaFilesystem service not available');
  }
  return service as LettaFilesystemService;
}

export const filesystemTool: ToolDefinition = {
  name: 'filesystem',
  description: `Manage folders and files in Letta's filesystem. All operations use names (not IDs).

**Folder Actions:**
- create_folder: Create a new folder (auto-attached) (params: name, description?)
- delete_folder: Delete a folder (params: folder_name)
- list_folders: List all folders
- get_folder: Get folder details (params: folder_name)
- update_folder: Update folder (params: folder_name, new_name?, description?)
- attach_folder: Attach a folder to access its files (params: folder_name)
- detach_folder: Detach a folder (params: folder_name)
- list_attached_folders: List your attached folders

**File Actions:**
- upload_file: Upload a new file (params: folder_name, filename, content)
- write_file: Write/overwrite a file (params: folder_name, filename, content)
- delete_file: Delete a file (params: folder_name, filename)
- list_files: List files in a folder (params: folder_name)
- patch_file: Apply a patch to a file (params: folder_name, filename, patch)
- open_file: Open a file into your context (params: filename)
- close_file: Close a file, removing it from your context (params: filename)
- list_open_files: List accessible files and their status

**Patch Format:**
\`\`\`
@@
 context line (must match exactly)
-line to remove
+line to add
 more context
\`\`\`
Lines starting with space are context, - are removals, + are additions.`,

  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'create_folder', 'delete_folder', 'list_folders', 'get_folder', 'update_folder',
          'attach_folder', 'detach_folder', 'list_attached_folders',
          'upload_file', 'write_file', 'delete_file', 'list_files', 'patch_file', 'open_file', 'close_file', 'list_open_files'
        ],
        description: 'Action to perform'
      },
      // Folder params
      name: {
        type: 'string',
        description: 'For create_folder: the folder name'
      },
      folder_name: {
        type: 'string',
        description: 'The folder name for folder/file operations'
      },
      new_name: {
        type: 'string',
        description: 'For update_folder: new name for the folder'
      },
      description: {
        type: 'string',
        description: 'For create_folder/update_folder: folder description'
      },
      // File params
      filename: {
        type: 'string',
        description: 'The filename for file operations'
      },
      content: {
        type: 'string',
        description: 'For upload_file/write_file: the file content'
      },
      // Patch params
      patch: {
        type: 'string',
        description: 'For patch_file: unified-diff style patch to apply'
      }
    },
    required: ['action']
  },

  handler: async (params, context): Promise<ToolResult> => {
    const action = params.action as FilesystemAction;

    try {
      const client = getLettaClient(context);

      switch (action) {
        // ========================================
        // Folder Actions
        // ========================================

        case 'create_folder': {
          const name = params.name as string;
          const description = params.description as string | undefined;

          if (!name) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: name is required for create_folder' }]
            };
          }

          const folder = await client.createFolder(name, description);

          // Auto-attach the folder to the agent
          const lettaAgentId = getLettaAgentId(context);
          await client.attachFolderToAgent(folder.id, lettaAgentId);

          return {
            content: [{
              type: 'text',
              text: `Folder "${folder.name}" created and attached!${folder.description ? `\n**Description:** ${folder.description}` : ''}\n\nYou can now upload files to this folder.`
            }]
          };
        }

        case 'delete_folder': {
          const folderName = params.folder_name as string;

          if (!folderName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: folder_name is required for delete_folder' }]
            };
          }

          const folder = await client.getFolderByName(folderName);
          if (!folder) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: Folder "${folderName}" not found` }]
            };
          }

          await client.deleteFolder(folder.id);

          // Clear cached files for this folder
          const fsService = getFilesystemService(context);
          const cachedCount = fsService.deleteFolder(folder.id);

          return {
            content: [{ type: 'text', text: `Folder "${folderName}" deleted successfully.${cachedCount > 0 ? ` (${cachedCount} cached files cleared)` : ''}` }]
          };
        }

        case 'list_folders': {
          const folders = await client.listFolders();

          if (folders.length === 0) {
            return {
              content: [{ type: 'text', text: 'No folders found.' }]
            };
          }

          const folderList = folders.map(f =>
            `- **${f.name}**${f.description ? `: ${f.description}` : ''}`
          ).join('\n');

          return {
            content: [{ type: 'text', text: `**Folders (${folders.length}):**\n\n${folderList}` }]
          };
        }

        case 'get_folder': {
          const folderName = params.folder_name as string;

          if (!folderName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: folder_name is required for get_folder' }]
            };
          }

          const folder = await client.getFolderByName(folderName);
          if (!folder) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: Folder "${folderName}" not found` }]
            };
          }

          return {
            content: [{
              type: 'text',
              text: `**Folder: ${folder.name}**${folder.description ? `\n**Description:** ${folder.description}` : ''}\n**Created:** ${folder.created_at}`
            }]
          };
        }

        case 'update_folder': {
          const folderName = params.folder_name as string;
          const newName = params.new_name as string | undefined;
          const description = params.description as string | undefined;

          if (!folderName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: folder_name is required for update_folder' }]
            };
          }

          if (!newName && description === undefined) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: at least one of new_name or description must be provided' }]
            };
          }

          const folder = await client.getFolderByName(folderName);
          if (!folder) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: Folder "${folderName}" not found` }]
            };
          }

          const updates: { name?: string; description?: string } = {};
          if (newName) updates.name = newName;
          if (description !== undefined) updates.description = description;

          const updated = await client.updateFolder(folder.id, updates);
          return {
            content: [{
              type: 'text',
              text: `Folder updated!\n**Name:** ${updated.name}${updated.description ? `\n**Description:** ${updated.description}` : ''}`
            }]
          };
        }

        // ========================================
        // File Actions
        // ========================================

        case 'upload_file': {
          const folderName = params.folder_name as string;
          const filename = params.filename as string;
          const content = params.content as string;

          if (!folderName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: folder_name is required for upload_file' }]
            };
          }
          if (!filename) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: filename is required for upload_file' }]
            };
          }
          if (content === undefined) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: content is required for upload_file' }]
            };
          }

          const folder = await client.getFolderByName(folderName);
          if (!folder) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: Folder "${folderName}" not found` }]
            };
          }

          const file = await client.uploadFileToFolder(folder.id, content, filename);

          // Cache the file content locally
          const fsService = getFilesystemService(context);
          fsService.storeFile(file.id, folder.id, folderName, file.file_name, content);

          return {
            content: [{
              type: 'text',
              text: `File "${file.file_name}" uploaded to folder "${folderName}"!\n**Size:** ${file.file_size || 'unknown'} bytes\n**Status:** ${file.processing_status || 'processing'}`
            }]
          };
        }

        case 'write_file': {
          const folderName = params.folder_name as string;
          const filename = params.filename as string;
          const content = params.content as string;

          if (!folderName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: folder_name is required for write_file' }]
            };
          }
          if (!filename) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: filename is required for write_file' }]
            };
          }
          if (content === undefined) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: content is required for write_file' }]
            };
          }

          const folder = await client.getFolderByName(folderName);
          if (!folder) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: Folder "${folderName}" not found` }]
            };
          }

          const file = await client.uploadFileToFolder(folder.id, content, filename, {
            duplicateHandling: 'replace'
          });

          // Cache the file content locally
          const fsService = getFilesystemService(context);
          fsService.storeFile(file.id, folder.id, folderName, file.file_name, content);

          return {
            content: [{
              type: 'text',
              text: `File "${file.file_name}" written to folder "${folderName}"!\n**Size:** ${file.file_size || 'unknown'} bytes`
            }]
          };
        }

        case 'delete_file': {
          const folderName = params.folder_name as string;
          const filename = params.filename as string;

          if (!folderName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: folder_name is required for delete_file' }]
            };
          }
          if (!filename) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: filename is required for delete_file' }]
            };
          }

          const folder = await client.getFolderByName(folderName);
          if (!folder) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: Folder "${folderName}" not found` }]
            };
          }

          const file = await client.getFileByName(folder.id, filename);
          if (!file) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: File "${filename}" not found in folder "${folderName}"` }]
            };
          }

          await client.deleteFileFromFolder(folder.id, file.id);

          // Remove from local cache
          const fsService = getFilesystemService(context);
          fsService.deleteFile(file.id);

          return {
            content: [{ type: 'text', text: `File "${filename}" deleted from folder "${folderName}".` }]
          };
        }

        case 'list_files': {
          const folderName = params.folder_name as string;

          if (!folderName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: folder_name is required for list_files' }]
            };
          }

          const folder = await client.getFolderByName(folderName);
          if (!folder) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: Folder "${folderName}" not found` }]
            };
          }

          const files = await client.listFilesInFolder(folder.id);

          if (files.length === 0) {
            return {
              content: [{ type: 'text', text: `No files in folder "${folderName}".` }]
            };
          }

          const fileList = files.map(f =>
            `- **${f.file_name}** (${f.file_size || '?'} bytes) - ${f.processing_status || 'unknown'}`
          ).join('\n');

          return {
            content: [{ type: 'text', text: `**Files in "${folderName}" (${files.length}):**\n\n${fileList}` }]
          };
        }

        case 'patch_file': {
          const folderName = params.folder_name as string;
          const filename = params.filename as string;
          const patch = params.patch as string;

          if (!folderName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: folder_name is required for patch_file' }]
            };
          }
          if (!filename) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: filename is required for patch_file' }]
            };
          }
          if (!patch) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: patch is required for patch_file' }]
            };
          }

          const folder = await client.getFolderByName(folderName);
          if (!folder) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: Folder "${folderName}" not found` }]
            };
          }

          const file = await client.getFileByName(folder.id, filename);
          if (!file) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: File "${filename}" not found in folder "${folderName}"` }]
            };
          }

          // Validate the patch first
          const validation = validatePatch(patch);
          if (!validation.valid) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Patch validation failed: ${validation.error}` }]
            };
          }

          // Get file content from local cache
          const fsService = getFilesystemService(context);
          const currentContent = fsService.getFileContent(file.id);

          if (currentContent === null) {
            return {
              isError: true,
              content: [{
                type: 'text',
                text: `Error: File "${filename}" not found in local cache. ` +
                  `The file must be created or uploaded through this tool first to enable patching. ` +
                  `Use write_file to create the file with initial content.`
              }]
            };
          }

          // Apply the patch
          const patchResult = applyPatch(currentContent, patch);

          if (!patchResult.success) {
            let errorMsg = `Patch failed: ${patchResult.error}`;
            if (patchResult.mismatchDetails) {
              const details = patchResult.mismatchDetails;
              errorMsg += `\n\n**Expected:**\n${details.expected.map(l => `  "${l}"`).join('\n')}`;
              errorMsg += `\n\n**Found:**\n${details.found.map(l => `  "${l}"`).join('\n')}`;
            }
            return {
              isError: true,
              content: [{ type: 'text', text: errorMsg }]
            };
          }

          // Upload the patched content to Letta
          const updatedFile = await client.uploadFileToFolder(
            folder.id,
            patchResult.content!,
            filename,
            { duplicateHandling: 'replace' }
          );

          // Update local cache with new content
          fsService.storeFile(updatedFile.id, folder.id, folderName, filename, patchResult.content!);

          return {
            content: [{
              type: 'text',
              text: `Patch applied to "${filename}"!\n**Hunks applied:** ${validation.hunkCount}`
            }]
          };
        }

        case 'open_file': {
          const filename = params.filename as string;

          if (!filename) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: filename is required for open_file' }]
            };
          }

          const lettaAgentId = getLettaAgentId(context);

          // First, try to find the file in already-attached folders
          let fileInfo = await client.getAgentFileByName(lettaAgentId, filename);

          // If not found in attached folders, search all folders and auto-attach
          if (!fileInfo) {
            // Search all folders for this file
            const folders = await client.listFolders();
            for (const folder of folders) {
              const file = await client.getFileByName(folder.id, filename);
              if (file) {
                // Found it! Auto-attach the folder
                await client.attachFolderToAgent(folder.id, lettaAgentId);
                fileInfo = {
                  file_id: file.id,
                  folder_id: folder.id,
                  folder_name: folder.name
                };
                break;
              }
            }
          }

          if (!fileInfo) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: File "${filename}" not found in any folder. Use list_files with a folder_name to see available files.` }]
            };
          }

          const closedFiles = await client.openFileForAgent(lettaAgentId, fileInfo.file_id);

          let message = `File "${filename}" opened from folder "${fileInfo.folder_name}"! The content is now in your context.`;
          if (closedFiles.length > 0) {
            message += `\n\n**Note:** These files were closed due to context limits: ${closedFiles.join(', ')}`;
          }

          return {
            content: [{ type: 'text', text: message }]
          };
        }

        case 'close_file': {
          const filename = params.filename as string;

          if (!filename) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: filename is required for close_file' }]
            };
          }

          const lettaAgentId = getLettaAgentId(context);

          // Find the file by name across all attached folders
          const fileInfo = await client.getAgentFileByName(lettaAgentId, filename);
          if (!fileInfo) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: File "${filename}" not found in any attached folder.` }]
            };
          }

          await client.closeFileForAgent(lettaAgentId, fileInfo.file_id);

          return {
            content: [{ type: 'text', text: `File "${filename}" closed. It has been removed from your context.` }]
          };
        }

        case 'list_open_files': {
          const lettaAgentId = getLettaAgentId(context);
          const files = await client.listAgentFiles(lettaAgentId);

          if (files.length === 0) {
            return {
              content: [{ type: 'text', text: 'No files accessible. Create or attach a folder first.' }]
            };
          }

          const openFiles = files.filter(f => f.is_open);
          const closedFiles = files.filter(f => !f.is_open);

          let text = `**Your Files (${files.length} total):**\n\n`;

          if (openFiles.length > 0) {
            text += `**Open in Context (${openFiles.length}):**\n`;
            for (const f of openFiles) {
              text += `- ✅ **${f.file_name}** (folder: ${f.folder_name})\n`;
              if (f.visible_content) {
                const preview = f.visible_content.substring(0, 80).replace(/\n/g, ' ');
                text += `  Preview: ${preview}${f.visible_content.length > 80 ? '...' : ''}\n`;
              }
            }
            text += '\n';
          }

          if (closedFiles.length > 0) {
            text += `**Available (${closedFiles.length}):**\n`;
            for (const f of closedFiles) {
              text += `- ⬜ **${f.file_name}** (folder: ${f.folder_name})\n`;
            }
          }

          return {
            content: [{ type: 'text', text }]
          };
        }

        // ========================================
        // Folder Attachment Actions
        // ========================================

        case 'attach_folder': {
          const folderName = params.folder_name as string;

          if (!folderName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: folder_name is required for attach_folder' }]
            };
          }

          const folder = await client.getFolderByName(folderName);
          if (!folder) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: Folder "${folderName}" not found` }]
            };
          }

          const lettaAgentId = getLettaAgentId(context);
          await client.attachFolderToAgent(folder.id, lettaAgentId);

          return {
            content: [{
              type: 'text',
              text: `Folder "${folderName}" attached! You can now access its files.`
            }]
          };
        }

        case 'detach_folder': {
          const folderName = params.folder_name as string;

          if (!folderName) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: folder_name is required for detach_folder' }]
            };
          }

          const folder = await client.getFolderByName(folderName);
          if (!folder) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: Folder "${folderName}" not found` }]
            };
          }

          const lettaAgentId = getLettaAgentId(context);
          await client.detachFolderFromAgent(folder.id, lettaAgentId);

          return {
            content: [{ type: 'text', text: `Folder "${folderName}" detached.` }]
          };
        }

        case 'list_attached_folders': {
          const lettaAgentId = getLettaAgentId(context);
          const folders = await client.listAgentFolders(lettaAgentId);

          if (folders.length === 0) {
            return {
              content: [{ type: 'text', text: 'No folders attached. Use create_folder or attach_folder.' }]
            };
          }

          const folderList = folders.map(f =>
            `- **${f.name}**${f.description ? `: ${f.description}` : ''}`
          ).join('\n');

          return {
            content: [{ type: 'text', text: `**Your Folders (${folders.length}):**\n\n${folderList}` }]
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown action: ${action}` }]
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

export const tools: ToolDefinition[] = [filesystemTool];
