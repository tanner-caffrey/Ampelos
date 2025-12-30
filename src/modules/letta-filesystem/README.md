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

### Folder Operations
- `create_folder` - Create a new folder
- `list_folder` - List contents of a folder
- `delete_folder` - Delete a folder and its contents

### File Operations
- `create_file` - Create a new file
- `read_file` - Read file contents
- `update_file` - Update file contents (full replacement)
- `patch_file` - Apply a patch to file contents
- `delete_file` - Delete a file

### Navigation
- `get_current_folder` - Get the agent's current working folder
- `change_folder` - Change the current working folder

## Use Cases

- **Document Storage**: Store agent-generated documents
- **Configuration Files**: Maintain agent-specific configurations
- **Data Persistence**: Store structured data as JSON files
- **Note Taking**: Create and organize notes
