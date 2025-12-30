/**
 * Docker MCP Tools
 *
 * Tools for interacting with Docker containers for isolated filesystem access,
 * command execution, and bidirectional agent communication.
 */

import type { ToolDefinition, ToolResult } from '../../types/tool.js';
import type DockerService from './service.js';
import type { FileEntry, DockerServiceState } from './types.js';

/**
 * Parse ls -la output into structured file entries
 */
function parseLsOutput(output: string): FileEntry[] {
  const lines = output.trim().split('\n');
  const entries: FileEntry[] = [];

  for (const line of lines) {
    // Skip empty lines and total line
    if (!line.trim() || line.startsWith('total ')) {
      continue;
    }

    // Parse ls -la format: permissions links owner group size month day time name
    const match = line.match(/^([\w-]+)\s+\d+\s+(\w+)\s+(\w+)\s+(\d+)\s+(\w+\s+\d+\s+[\d:]+)\s+(.+)$/);

    if (!match) {
      continue;
    }

    const [, permissions, owner, group, size, modified, name] = match;

    // Skip . and .. entries
    if (name === '.' || name === '..') {
      continue;
    }

    // Determine type from permissions
    let type: 'file' | 'directory' | 'symlink' | 'other' = 'file';
    if (permissions.startsWith('d')) {
      type = 'directory';
    } else if (permissions.startsWith('l')) {
      type = 'symlink';
    } else if (!permissions.startsWith('-')) {
      type = 'other';
    }

    entries.push({
      name,
      type,
      size: parseInt(size, 10),
      modified,
      permissions,
      owner,
      group
    });
  }

  return entries;
}

/**
 * Explore directory contents in Docker container
 */
const docker_look_around: ToolDefinition = {
  name: 'docker_look_around',
  description: 'Explore directory contents in the Docker container workspace. Lists files and directories with metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to explore (relative to workspace root, defaults to workspace root)'
      },
      offset: {
        type: 'number',
        description: 'Number of entries to skip (for pagination)'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of entries to return (for pagination)'
      }
    }
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<DockerService>('docker');
      const agentId = context.agentId;

      if (!service.isEnabled(agentId)) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Docker mode is disabled'
            }
          ],
          isError: true
        };
      }

      // Check container health
      const healthy = await service.isHealthy(agentId);
      if (!healthy) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Docker container is not running'
            }
          ],
          isError: true
        };
      }

      const explorePath = (params.path as string) || '.';
      const offset = (params.offset as number) || 0;
      const limit = (params.limit as number) || 100;

      // Build container path
      const containerPath = service.buildContainerPath(agentId, explorePath);

      // Execute ls -la
      const command = `cd "${containerPath}" && ls -la --color=never`;
      const result = await service.executeCommand(agentId, command, 5000);

      if (result.exitCode !== 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${result.stderr || 'Failed to list directory'}`
            }
          ],
          isError: true
        };
      }

      // Parse output
      const allEntries = parseLsOutput(result.stdout);
      const paginatedEntries = allEntries.slice(offset, offset + limit);

      // Format response
      const formattedEntries = paginatedEntries
        .map(entry => {
          const typeIcon = entry.type === 'directory' ? '📁' : '📄';
          const sizeStr = entry.size ? `${entry.size} bytes` : '';
          return `${typeIcon} ${entry.name} (${entry.type}) ${sizeStr} - ${entry.modified}`;
        })
        .join('\n');

      const summary = `Directory: ${explorePath}\nTotal entries: ${allEntries.length} (showing ${offset + 1}-${offset + paginatedEntries.length})\n\n${formattedEntries}`;

      return {
        content: [
          {
            type: 'text',
            text: summary || 'Directory is empty'
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * Read file from Docker container
 */
const docker_open_file: ToolDefinition = {
  name: 'docker_open_file',
  description: 'Read a file from the Docker container workspace. Returns file contents and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Path to the file (relative to workspace root)'
      }
    },
    required: ['file_path']
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<DockerService>('docker');
      const agentId = context.agentId;

      if (!service.isEnabled(agentId)) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Docker mode is disabled'
            }
          ],
          isError: true
        };
      }

      // Check container health
      const healthy = await service.isHealthy(agentId);
      if (!healthy) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Docker container is not running'
            }
          ],
          isError: true
        };
      }

      const filePath = params.file_path as string;
      const containerPath = service.buildContainerPath(agentId, filePath);

      // Get file info with stat
      const statCommand = `stat -c "%s %Y %n" "${containerPath}"`;
      const statResult = await service.executeCommand(agentId, statCommand, 5000);

      if (statResult.exitCode !== 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: File not found: ${filePath}`
            }
          ],
          isError: true
        };
      }

      // Parse stat output: size modified_timestamp name
      const statParts = statResult.stdout.trim().split(' ');
      const fileSize = parseInt(statParts[0], 10);
      const modifiedTimestamp = parseInt(statParts[1], 10);
      const modifiedDate = new Date(modifiedTimestamp * 1000).toISOString();

      // Read file content
      const catCommand = `cat "${containerPath}"`;
      const catResult = await service.executeCommand(agentId, catCommand, 30000);

      if (catResult.exitCode !== 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Failed to read file: ${catResult.stderr}`
            }
          ],
          isError: true
        };
      }

      // Format response
      const metadata = `File: ${filePath}\nSize: ${fileSize} bytes\nModified: ${modifiedDate}\n`;
      const truncationNotice = catResult.truncated ? '\n\n[... FILE CONTENT TRUNCATED ...]' : '';
      const content = `${metadata}\n---\n\n${catResult.stdout}${truncationNotice}`;

      return {
        content: [
          {
            type: 'text',
            text: content
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * Execute shell command in Docker container
 */
const docker_exec_command: ToolDefinition = {
  name: 'docker_exec_command',
  description: 'Execute a shell command in the Docker container. Returns stdout, stderr, exit code, and execution metadata. Use this for running scripts, tests, builds, or any shell operations.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute'
      },
      timeout_ms: {
        type: 'number',
        description: 'Command timeout in milliseconds (default: 30000, max: 300000)'
      },
      working_dir: {
        type: 'string',
        description: 'Working directory for command execution (relative to workspace root)'
      }
    },
    required: ['command']
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<DockerService>('docker');
      const agentId = context.agentId;

      if (!service.isEnabled(agentId)) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Docker mode is disabled. This tool requires Docker to be enabled.'
            }
          ],
          isError: true
        };
      }

      // Check container health
      const healthy = await service.isHealthy(agentId);
      if (!healthy) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Docker container is not running'
            }
          ],
          isError: true
        };
      }

      const command = params.command as string;
      const timeoutMs = params.timeout_ms as number | undefined;
      const workingDir = params.working_dir as string | undefined;

      // Build working directory path if provided
      const containerWorkingDir = workingDir
        ? service.buildContainerPath(agentId, workingDir)
        : undefined;

      // Execute command
      const result = await service.executeCommand(agentId, command, timeoutMs, containerWorkingDir);

      // Build comprehensive output
      let output = '';

      if (result.stdout) {
        output += '=== STDOUT ===\n' + result.stdout + '\n\n';
      }

      if (result.stderr) {
        output += '=== STDERR ===\n' + result.stderr + '\n\n';
      }

      // Add metadata footer
      const metadata: string[] = [
        '=== METADATA ===',
        `Exit code: ${result.exitCode}`,
        `Duration: ${result.durationMs}ms`
      ];

      if (result.timedOut) {
        metadata.push('STATUS: TIMED OUT');
      }

      if (result.truncated) {
        if (result.stdoutTruncated) metadata.push('STDOUT: TRUNCATED');
        if (result.stderrTruncated) metadata.push('STDERR: TRUNCATED');
      }

      output += metadata.join('\n');

      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ],
        isError: result.exitCode !== 0
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * Get Docker container info and health status
 */
const docker_container_info: ToolDefinition = {
  name: 'docker_container_info',
  description: 'Get information about the Docker container (ID, status, image, workspace path, callback configuration, etc.)',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<DockerService>('docker');
      const agentId = context.agentId;

      if (!service.isEnabled(agentId)) {
        return {
          content: [
            {
              type: 'text',
              text: 'Docker mode is disabled'
            }
          ]
        };
      }

      const config = service.getConfig(agentId);
      const state = await service.getState(agentId) as DockerServiceState;
      const containerInfo = await service.getContainerInfo(agentId);

      const info = `
=== Docker Container Info ===

Enabled: ${config?.enabled ?? false}
Container Name: ${state.containerName || 'Not set'}
Container ID: ${state.containerId?.substring(0, 12) || 'Not started'}
Image: ${state.image}
Running: ${state.running ? 'Yes' : 'No'}
Last Health Check: ${state.lastHealthCheck || 'Never'}

=== Bidirectional Communication ===

Callback Configured: ${state.callbackConfigured ? 'Yes' : 'No'}
Callback Scripts:
  - Shell: /workspace/.ampelos-callback.sh
  - Python: /workspace/ampelos_callback.py

Environment Variables (in container):
  - AMPELOS_API_URL
  - AMPELOS_AGENT_ID
  - AMPELOS_ENABLED

=== Configuration ===

Workspace (Host): ${config?.workspaceHost || 'Not set'}
Workspace (Container): ${config?.workspaceContainer || 'Not set'}
Default Timeout: ${config?.commandTimeoutMs}ms
Max Timeout: ${config?.maxCommandTimeoutMs}ms
Max Output: ${config?.maxOutputChars} chars
Auto Start: ${config?.autoStart ?? false}
Auto Pull: ${config?.autoPull ?? false}

=== Container Details ===

${containerInfo ? `
Created: ${containerInfo.Created}
Platform: ${containerInfo.Platform}
Status: ${containerInfo.State.Status}
Started At: ${containerInfo.State.StartedAt}
`.trim() : 'Container not running'}
`.trim();

      return {
        content: [
          {
            type: 'text',
            text: info
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * Setup or refresh callback scripts in the container
 */
const docker_setup_callback: ToolDefinition = {
  name: 'docker_setup_callback',
  description: 'Setup or refresh the callback scripts in the container workspace. These scripts allow code running in the container to send messages back to the agent.',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async (params, context): Promise<ToolResult> => {
    try {
      const service = context.getService<DockerService>('docker');
      const agentId = context.agentId;

      if (!service.isEnabled(agentId)) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Docker mode is disabled'
            }
          ],
          isError: true
        };
      }

      // Check container health
      const healthy = await service.isHealthy(agentId);
      if (!healthy) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Docker container is not running'
            }
          ],
          isError: true
        };
      }

      // Setup callback scripts
      await service.setupCallbackScript(agentId);

      const state = await service.getState(agentId) as DockerServiceState;

      if (!state.callbackConfigured) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Failed to setup callback scripts'
            }
          ],
          isError: true
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Callback scripts created successfully!

=== Shell Script ===
Location: /workspace/.ampelos-callback.sh
Usage: ./.ampelos-callback.sh "Your message here"

=== Python Module ===
Location: /workspace/ampelos_callback.py
Usage (import):
  from ampelos_callback import send_to_agent
  response = send_to_agent("Hello from container!")

Usage (command line):
  python3 ampelos_callback.py "Your message here"

=== Environment Variables ===
These are automatically set in the container:
  AMPELOS_API_URL - API endpoint for callbacks
  AMPELOS_AGENT_ID - This agent's ID
  AMPELOS_ENABLED - Set to "true"

Scripts use these environment variables by default, so they work
without any additional configuration.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
};

// Export all tools
export const tools: ToolDefinition[] = [
  docker_look_around,
  docker_open_file,
  docker_exec_command,
  docker_container_info,
  docker_setup_callback
];
