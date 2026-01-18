# Warning: Unstable Module - May not function as intended
# Docker Module

The Docker module provides isolated filesystem access and command execution through Docker containers. It creates a secure sandbox where AI agents can explore directories, read files, and execute shell commands without directly accessing the host system.

## Overview

**Problem**: AI agents need to interact with filesystems and execute commands, but doing so directly on the host is a security risk.

**Solution**: Use a long-running Docker container with a mounted workspace directory. The agent sends commands to this container instead of the host.

## Architecture

### Core Concept

1. **Long-Running Container**: Instead of creating a container per command (slow), create one persistent container and use `docker exec` for commands. Much faster (exec ~50ms vs create/start/stop ~500ms+).

2. **Volume Mounting**: The workspace directory is mounted from host → container. Files created in the container persist on the host even after container restarts.

3. **Graceful Degradation**: Tools check if Docker is enabled and can fall back gracefully if disabled.

4. **Timeout Protection**: Every command has a configurable timeout to prevent infinite loops.

5. **Output Truncation**: Commands can produce large outputs. Truncate to `maxOutputChars` to prevent memory exhaustion.

## Components

### Service (`service.ts`)

Manages container lifecycle and command execution:

- **`start()`** - Initialize container (pull image, create/start container)
- **`executeCommand()`** - Execute commands via `docker exec`
- **`isHealthy()`** - Check container health
- **`stop()`** - Stop and cleanup container
- **`buildContainerPath()`** - Convert relative paths to container paths

### Tools (`tool.ts`)

MCP tools for agent interaction:

1. **`docker_look_around`** - Explore directory contents
   - Lists files and directories with metadata
   - Supports pagination (offset/limit)
   - Parses `ls -la` output into structured entries

2. **`docker_open_file`** - Read file contents
   - Returns file metadata (size, modified date)
   - Returns full file content
   - Handles truncation for large files

3. **`docker_exec_command`** - Execute shell commands
   - Returns stdout, stderr, exit code
   - Configurable timeout
   - Optional working directory
   - Execution metadata (duration, truncation, timeout status)

4. **`docker_container_info`** - Get container status
   - Container ID, name, image
   - Configuration details
   - Health status

## Configuration

Add to your agent's module configuration:

```json
{
  "docker": {
    "enabled": true,
    "image": "alpine:latest",
    "workspaceHost": "/path/to/workspace",
    "workspaceContainer": "/workspace",
    "commandTimeoutMs": 30000,
    "maxCommandTimeoutMs": 300000,
    "maxOutputChars": 32000,
    "autoStart": true,
    "autoPull": true,
    "autoRemove": false,
    "enableBidirectional": true
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable Docker sandbox mode |
| `image` | string | `"alpine:latest"` | Docker image to use |
| `containerName` | string | `"ampelos-{agentId}"` | Container name (auto-generated if not provided) |
| `workspaceHost` | string | **required** | Host directory to mount |
| `workspaceContainer` | string | `"/workspace"` | Container mount point |
| `commandTimeoutMs` | number | `30000` | Default command timeout (30s) |
| `maxCommandTimeoutMs` | number | `300000` | Max allowed timeout (5min) |
| `maxOutputChars` | number | `32000` | Output truncation limit |
| `autoStart` | boolean | `true` | Start container on service init |
| `autoPull` | boolean | `true` | Auto-pull image if missing |
| `autoRemove` | boolean | `false` | Auto-remove container on stop |
| `enableBidirectional` | boolean | `true` | Enable container-to-agent messaging via HTTP API |
| `ampelosApiUrl` | string | (auto) | Ampelos API URL for container callbacks |
| `ampelosApiPort` | number | `3005` | Ampelos API port for container callbacks |
| `setupCallbackScript` | boolean | `true` | Auto-create callback scripts in workspace on start |

## Usage Examples

### Example 1: Explore Directory

```typescript
// Agent calls tool
docker_look_around({ path: "src" })

// Returns:
// Directory: src
// Total entries: 15 (showing 1-15)
//
// 📁 modules (directory) - Jan 18 10:30
// 📁 core (directory) - Jan 18 09:15
// 📄 index.ts (file) 1234 bytes - Jan 18 11:00
// ...
```

### Example 2: Read File

```typescript
// Agent calls tool
docker_open_file({ file_path: "package.json" })

// Returns:
// File: package.json
// Size: 856 bytes
// Modified: 2025-01-18T10:30:00.000Z
//
// ---
//
// {
//   "name": "my-project",
//   ...
// }
```

### Example 3: Execute Command

```typescript
// Agent calls tool
docker_exec_command({
  command: "npm test",
  timeout_ms: 60000,
  working_dir: "."
})

// Returns:
// === STDOUT ===
// > my-project@1.0.0 test
// > jest
//
// PASS  tests/unit.test.ts
//   ✓ should work (5ms)
//
// === METADATA ===
// Exit code: 0
// Duration: 1234ms
```

## Container Lifecycle

```
Server Start
  ↓
dockerService.start()
  ↓
Check if container exists
  ↓
YES → Check if running → YES: reuse | NO: start existing
NO  → Pull image (if autoPull) → Create new → Start
  ↓
Container runs: tail -f /dev/null (keeps alive)
  ↓
Container waits for exec commands
  ↓
... hours/days of exec commands ...
  ↓
Server Shutdown (SIGINT/SIGTERM)
  ↓
dockerService.stop()
  ↓
Container stopped and removed (if !autoRemove)
```

## Data Flow: Directory Exploration

```
Agent calls: docker_look_around({ path: "documents" })
  ↓
Tool handler checks dockerEnabled = true
  ↓
Builds command: cd "/workspace/documents" && ls -la --color=never
  ↓
dockerService.executeCommand(command, 5000)
  ↓
Docker container executes: /bin/sh -c "cd /workspace/documents && ls -la"
  ↓
Container returns stdout (ls output)
  ↓
Tool handler parses ls format into structured entries
  ↓
Returns: { entries: [{name: "file.txt", type: "file", size: 1024, ...}], ... }
```

## Data Flow: Command Execution

```
Agent calls: docker_exec_command({ command: "python3 script.py" })
  ↓
Tool validates Docker enabled and healthy
  ↓
dockerService.executeCommand("python3 script.py", timeout, workingDir)
  ↓
Container creates exec: /bin/sh -c "python3 script.py"
  ↓
Streams stdout/stderr as script runs
  ↓
Timeout race: either script completes or timeout fires
  ↓
Inspects exit code (0 = success, non-zero = error, 124 = timeout)
  ↓
Truncates output if > 32,000 chars
  ↓
Returns: { stdout, stderr, exitCode, durationMs, timedOut, truncated, ... }
```

## Security Considerations

### Isolation Benefits

- Commands run in container, not on host
- Container has limited capabilities (no privileged mode)
- Workspace is the only mounted directory (no access to host root)
- Timeout prevents infinite loops

### Remaining Risks

- **Command Injection**: If user input isn't sanitized, malicious commands can run in container
- **Container Escape**: Theoretical Docker vulnerabilities could allow escaping to host
- **Resource Exhaustion**: Commands can consume container CPU/memory (no resource limits set by default)
- **Volume Mounting**: Container can modify/delete any files in mounted workspace

### Recommended Hardening

1. **Add resource limits**:
   ```typescript
   HostConfig: {
     Memory: 512 * 1024 * 1024, // 512MB
     CpuShares: 512
   }
   ```

2. **Use read-only mounts where possible**:
   ```typescript
   Binds: ["path:path:ro"]
   ```

3. **Run container as non-root user**:
   ```typescript
   User: "1000:1000"
   ```

4. **Implement command allowlist/blocklist**
5. **Use seccomp/AppArmor profiles**

## Integration with Ampelos

The Docker module follows Ampelos's standard module architecture:

1. **BaseService Implementation**: Implements `init()`, `getState()`, `setState()`, `cleanup()`, `onConfigChange()`
2. **Per-Agent Isolation**: Each agent gets its own container instance
3. **State Persistence**: Container ID and status persisted to database
4. **Hot Reloading**: Supports config changes (restarts container if needed)
5. **Lifecycle Management**: Starts on init, stops on shutdown

## Troubleshooting

### Container Won't Start

**Issue**: Error during `start()`

**Solutions**:
- Ensure Docker daemon is running: `docker ps`
- Check workspace directory exists and is accessible
- Verify image exists or `autoPull` is enabled
- Check Docker logs: `docker logs <container_name>`

### Command Timeouts

**Issue**: Commands timing out unexpectedly

**Solutions**:
- Increase `commandTimeoutMs` in config
- Check if command is actually hanging (use `docker exec` manually)
- Verify container has necessary tools (e.g., `bash`, `python`)

### Permission Errors

**Issue**: "Permission denied" in container

**Solutions**:
- Check workspace directory permissions on host
- Run container as specific user with `User` config
- Use `chmod` in container to fix permissions

### Output Truncation

**Issue**: Command output being cut off

**Solutions**:
- Increase `maxOutputChars` in config
- Stream output incrementally (future enhancement)
- Write output to file and read in chunks

## Future Enhancements

**Planned Features**:
- Streaming command output (for long-running commands)
- Multi-container support (e.g., database + app)
- Resource limits (CPU, memory, disk)
- Network isolation controls
- Image customization (Dockerfile support)
- Volume management (create/delete volumes)
- Container snapshots (save/restore state)

## Design Decisions

### Why Long-Running Container?

**Alternative**: Create container per command

**Chosen**: Long-running container with `exec`

**Reason**: Performance. Creating/starting/stopping containers adds 500ms+ overhead per command. Using `exec` on a running container is ~50ms.

### Why `tail -f /dev/null`?

This is a standard technique to keep a container running without doing work. The container stays alive waiting for exec commands. Alternatives like `sleep infinity` work too.

### Why Alpine?

Alpine is a minimal Linux distribution (5MB base image) with a package manager (`apk`). It's fast to pull and start. Users can customize with:

```json
{
  "image": "ubuntu:latest",  // More tools pre-installed
  "image": "python:3.11",    // Python environment
  "image": "node:18",        // Node.js environment
}
```

### Why Stream Demultiplexing?

Docker multiplexes stdout/stderr into a single stream with 8-byte headers. The `modem.demuxStream()` function separates them back into individual streams so we can return them separately to the user.

## API Reference

### DockerService

#### `start(): Promise<void>`
Start the Docker container (pull, create, start)

#### `stop(): Promise<void>`
Stop and remove the container

#### `executeCommand(command: string, timeoutMs?: number, workingDir?: string): Promise<CommandResult>`
Execute a command in the container

**Parameters**:
- `command`: Shell command to execute
- `timeoutMs`: Timeout in milliseconds (optional, defaults to config value)
- `workingDir`: Working directory in container (optional)

**Returns**: `CommandResult` object with stdout, stderr, exit code, metadata

#### `isHealthy(): Promise<boolean>`
Check if container is running

#### `buildContainerPath(relativePath: string): string`
Convert relative path to container absolute path

#### `isEnabled(): boolean`
Check if Docker mode is enabled

#### `getConfig(): DockerConfig | undefined`
Get current configuration

#### `getContainerInfo(): Promise<Docker.ContainerInspectInfo | null>`
Get detailed container information from Docker

## Bidirectional Communication

When `enableBidirectional` is enabled (default), processes running inside the container can send messages back to the agent:

### Setup

On container start, callback scripts are automatically created in the workspace:
- `ampelos-callback.sh` - Shell script for sending messages

### Usage from Container

```bash
# From inside the container, send a message to the agent
./ampelos-callback.sh "Task completed successfully!"

# Or using curl directly
curl -X POST http://host.docker.internal:3005/api/docker/callback \
  -H "Content-Type: application/json" \
  -d '{"agentId": "my-agent", "message": "Hello from container!"}'
```

This enables long-running processes to report progress or results back to the agent asynchronously.

## Related Documentation

- [Ampelos Architecture](../../README.md)
- [Docker SDK](https://github.com/apocas/dockerode)
