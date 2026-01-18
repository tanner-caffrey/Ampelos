# Warning: Unstable Module - May not function as intended
# Letta Filesystem Module

Manage Letta folders and files with patch-based modifications. Provides agents with a persistent file system within the Letta platform.

## Features

- **Folder Management**: Create, list, and delete folders
- **File Operations**: Create, read, update, and delete files
- **Patch-Based Edits**: Apply precise modifications to file contents
- **Hierarchical Structure**: Organize files in a folder hierarchy
- **Persistent Storage**: Files persist in Letta's storage backend

## Configuration

This module has no specific configuration options. It uses the agent's Letta connection for storage.

## Example Configuration

```json
{
  "letta-filesystem": {}
}
```

## Tools Provided

The module exposes a single `filesystem` tool with action-based dispatch:

### Folder Actions
- `create_folder` - Create a new folder
- `list` - List contents of a folder
- `delete_folder` - Delete a folder and its contents
- `rename_folder` - Rename a folder

### File Actions
- `create` - Create a new file
- `read` - Read file contents
- `update` - Update file contents (full replacement)
- `delete` - Delete a file
- `rename` - Rename a file

### Example Usage

```json
{ "action": "create_folder", "folder_name": "notes" }
{ "action": "create", "filename": "todo.txt", "content": "My tasks" }
{ "action": "list" }
{ "action": "read", "filename": "todo.txt" }
```

## Use Cases

- **Document Storage**: Store agent-generated documents
- **Configuration Files**: Maintain agent-specific configurations
- **Data Persistence**: Store structured data as JSON files
- **Note Taking**: Create and organize notes
