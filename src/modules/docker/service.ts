/**
 * Docker Service (Singleton)
 *
 * Manages Docker container lifecycle for isolated command execution and filesystem access.
 * This is a global singleton - containers are tracked per-agent internally.
 *
 * Features:
 * - Long-running containers with docker exec (fast, ~50ms per command)
 * - Workspace volume mounting for file persistence
 * - Bidirectional communication: containers can send messages back to agents via HTTP API
 */

import Docker from 'dockerode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Writable } from 'stream';
import type { AgentId } from '../../types/agent.js';
import type { BaseService, ServiceContext } from '../../types/service.js';
import type { DockerConfig, DockerServiceState, CommandResult } from './types.js';
import { createComponentLogger } from '../../core/logger.js';

const log = createComponentLogger('Docker');

const SERVICE_NAME = 'docker';

const DEFAULT_STATE: DockerServiceState = {
  running: false,
  initialized: false,
  image: '',
  callbackConfigured: false
};

class DockerService implements BaseService {
  private docker: Docker;
  private context?: ServiceContext;

  // Per-agent tracking
  private agentConfigs: Map<AgentId, DockerConfig> = new Map();
  private agentContainers: Map<AgentId, Docker.Container> = new Map();

  constructor() {
    this.docker = new Docker();
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
      throw new Error('Docker service not initialized');
    }

    const typedConfig = config as DockerConfig;

    // Generate container name if not provided
    if (!typedConfig.containerName) {
      typedConfig.containerName = `ampelos-${agentId}`;
    }

    // Store agent config
    this.agentConfigs.set(agentId, typedConfig);

    // Get or initialize state
    const state = this.getAgentState(agentId);

    // Update state with current config
    state.containerName = typedConfig.containerName;
    state.image = typedConfig.image;
    this.saveAgentState(agentId, state);

    // Try to reconnect to existing container
    if (state.containerId) {
      try {
        const container = this.docker.getContainer(state.containerId);
        const info = await container.inspect();
        if (info.State.Running) {
          log.info(`Reconnected to existing container for ${agentId}`, { containerId: state.containerId.substring(0, 12) });
          this.agentContainers.set(agentId, container);
          state.running = true;
          this.saveAgentState(agentId, state);
        }
      } catch {
        // Container doesn't exist anymore, will create new one
        state.containerId = undefined;
        state.running = false;
        this.saveAgentState(agentId, state);
      }
    }

    // Start container if enabled and autoStart is true
    if (typedConfig.enabled && typedConfig.autoStart && !this.agentContainers.has(agentId)) {
      await this.startContainer(agentId);
    }

    state.initialized = true;
    this.saveAgentState(agentId, state);

    log.info(`Initialized for agent ${agentId}`);
  }

  /**
   * Check if an agent can reconnect
   */
  canReconnect(agentId: AgentId, state: Record<string, unknown>): boolean {
    const dockerState = state as DockerServiceState;
    return !!dockerState.containerId;
  }

  /**
   * Get agent state
   */
  private getAgentState(agentId: AgentId): DockerServiceState {
    if (!this.context) {
      return { ...DEFAULT_STATE };
    }
    const state = this.context.getState<DockerServiceState>(agentId, SERVICE_NAME);
    return state.get() || { ...DEFAULT_STATE };
  }

  /**
   * Save agent state
   */
  private saveAgentState(agentId: AgentId, newState: DockerServiceState): void {
    if (!this.context) return;
    const state = this.context.getState<DockerServiceState>(agentId, SERVICE_NAME);
    state.set(newState);
  }

  /**
   * Get the Ampelos API URL for container callbacks
   */
  private getAmpelosApiUrl(agentId: AgentId): string {
    const config = this.agentConfigs.get(agentId);
    if (config?.ampelosApiUrl) {
      return config.ampelosApiUrl;
    }

    // Default: use host.docker.internal which works on Docker Desktop
    // On Linux with proper ExtraHosts config, this also works
    const port = config?.ampelosApiPort || 3005;
    return `http://host.docker.internal:${port}`;
  }

  /**
   * Start the Docker container for an agent
   */
  async startContainer(agentId: AgentId): Promise<void> {
    const config = this.agentConfigs.get(agentId);
    if (!config) {
      throw new Error(`Docker not configured for agent ${agentId}`);
    }

    if (!config.enabled) {
      log.info(`Docker mode disabled for ${agentId}, skipping container start`);
      return;
    }

    try {
      // Create workspace directory on host if it doesn't exist
      await this.ensureWorkspaceExists(config.workspaceHost);

      // Pull image if autoPull enabled
      if (config.autoPull) {
        await this.pullImageIfMissing(config.image);
      }

      // Check if container exists
      const existingContainer = await this.findContainer(config.containerName!);

      if (existingContainer) {
        const info = await existingContainer.inspect();

        if (info.State.Running) {
          log.info(`Container already running for ${agentId}`, { containerName: config.containerName });
          this.agentContainers.set(agentId, existingContainer);
          const state = this.getAgentState(agentId);
          state.containerId = info.Id;
          state.running = true;
          this.saveAgentState(agentId, state);
          return;
        } else {
          log.info(`Starting existing container for ${agentId}`, { containerName: config.containerName });
          await existingContainer.start();
          this.agentContainers.set(agentId, existingContainer);
          const state = this.getAgentState(agentId);
          state.containerId = info.Id;
          state.running = true;
          this.saveAgentState(agentId, state);
          return;
        }
      }

      // Create new container with bidirectional communication environment
      log.info(`Creating new container for ${agentId}`, { containerName: config.containerName });

      const ampelosApiUrl = this.getAmpelosApiUrl(agentId);

      const container = await this.docker.createContainer({
        name: config.containerName,
        Image: config.image,
        Cmd: ['tail', '-f', '/dev/null'], // Keep container alive
        WorkingDir: config.workspaceContainer,
        Env: [
          // Bidirectional communication environment variables
          `AMPELOS_API_URL=${ampelosApiUrl}`,
          `AMPELOS_AGENT_ID=${agentId}`,
          `AMPELOS_ENABLED=true`
        ],
        HostConfig: {
          Binds: [`${config.workspaceHost}:${config.workspaceContainer}`],
          AutoRemove: config.autoRemove,
          // Enable host.docker.internal on Linux
          ExtraHosts: ['host.docker.internal:host-gateway']
        }
      });

      await container.start();
      this.agentContainers.set(agentId, container);

      const info = await container.inspect();
      const state = this.getAgentState(agentId);
      state.containerId = info.Id;
      state.running = true;
      this.saveAgentState(agentId, state);

      log.info(`Container started for ${agentId}`, { containerName: config.containerName, containerId: info.Id.substring(0, 12) });

      // Setup callback script if enabled
      if (config.enableBidirectional !== false && config.setupCallbackScript !== false) {
        await this.setupCallbackScript(agentId);
      }
    } catch (error) {
      log.error(`Failed to start container for ${agentId}`, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Setup the callback script in the container workspace
   */
  async setupCallbackScript(agentId: AgentId): Promise<void> {
    const config = this.agentConfigs.get(agentId);
    if (!config) return;

    const ampelosApiUrl = this.getAmpelosApiUrl(agentId);

    // Shell callback script
    const shellScript = `#!/bin/sh
# Ampelos Agent Callback Script
# Usage: ./ampelos-callback.sh "Your message here"
#
# Environment variables (set automatically in container):
#   AMPELOS_API_URL - API endpoint for callbacks
#   AMPELOS_AGENT_ID - This agent's ID

MESSAGE="$1"
if [ -z "$MESSAGE" ]; then
  echo "Usage: $0 <message>"
  echo "Sends a message to the Ampelos agent that owns this container."
  exit 1
fi

curl -s -X POST "\${AMPELOS_API_URL:-${ampelosApiUrl}}/api/agents/\${AMPELOS_AGENT_ID:-${agentId}}/messages" \\
  -H "Content-Type: application/json" \\
  -d "{\\"text\\": \\"\$MESSAGE\\"}"
`;

    // Python callback script
    const pythonScript = `#!/usr/bin/env python3
"""
Ampelos Agent Callback Module

Usage:
    from ampelos_callback import send_to_agent
    response = send_to_agent("Hello from container!")

Or from command line:
    python3 ampelos_callback.py "Your message here"
"""

import os
import sys
import json
import urllib.request
import urllib.error

def send_to_agent(message: str) -> dict:
    """Send a message to the owning Ampelos agent.

    Args:
        message: The message to send to the agent

    Returns:
        dict: Response from the API containing agent's reply

    Raises:
        RuntimeError: If Ampelos environment is not configured
        urllib.error.URLError: If API call fails
    """
    api_url = os.environ.get('AMPELOS_API_URL', '${ampelosApiUrl}')
    agent_id = os.environ.get('AMPELOS_AGENT_ID', '${agentId}')

    url = f'{api_url}/api/agents/{agent_id}/messages'
    data = json.dumps({'text': message}).encode('utf-8')

    req = urllib.request.Request(
        url,
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.URLError as e:
        print(f"Error sending message to agent: {e}", file=sys.stderr)
        raise

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 ampelos_callback.py <message>")
        print("Sends a message to the Ampelos agent that owns this container.")
        sys.exit(1)

    message = ' '.join(sys.argv[1:])
    try:
        result = send_to_agent(message)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"Failed to send message: {e}", file=sys.stderr)
        sys.exit(1)
`;

    try {
      // Write shell script
      await this.executeCommand(
        agentId,
        `cat > /workspace/.ampelos-callback.sh << 'SCRIPT_EOF'
${shellScript}
SCRIPT_EOF
chmod +x /workspace/.ampelos-callback.sh`,
        10000
      );

      // Write Python script
      await this.executeCommand(
        agentId,
        `cat > /workspace/ampelos_callback.py << 'SCRIPT_EOF'
${pythonScript}
SCRIPT_EOF
chmod +x /workspace/ampelos_callback.py`,
        10000
      );

      const state = this.getAgentState(agentId);
      state.callbackConfigured = true;
      this.saveAgentState(agentId, state);

      log.info(`Callback scripts created for ${agentId}`);
    } catch (error) {
      log.warn(`Failed to setup callback scripts for ${agentId}`, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Execute a command in the container
   */
  async executeCommand(
    agentId: AgentId,
    command: string,
    timeoutMs?: number,
    workingDir?: string
  ): Promise<CommandResult> {
    const config = this.agentConfigs.get(agentId);
    const container = this.agentContainers.get(agentId);

    if (!config) {
      throw new Error(`Docker not configured for agent ${agentId}`);
    }

    if (!config.enabled) {
      throw new Error('Docker mode is disabled');
    }

    if (!container) {
      throw new Error('Container is not running');
    }

    // Validate timeout
    const timeout = Math.min(
      timeoutMs || config.commandTimeoutMs,
      config.maxCommandTimeoutMs
    );

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    try {
      // Create exec instance
      const exec = await container.exec({
        Cmd: ['/bin/sh', '-c', command],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: workingDir || config.workspaceContainer
      });

      // Start execution with timeout
      const execPromise = new Promise<void>(async (resolve, reject) => {
        try {
          const stream = await exec.start({ Detach: false });

          // Create writable streams for stdout and stderr
          const stdoutStream = new Writable({
            write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
              stdout += chunk.toString();
              callback();
            }
          });

          const stderrStream = new Writable({
            write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
              stderr += chunk.toString();
              callback();
            }
          });

          // Demux stdout and stderr
          this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

          stream.on('end', resolve);
          stream.on('error', reject);
        } catch (error) {
          reject(error);
        }
      });

      // Race between execution and timeout
      await Promise.race([
        execPromise,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeout)
        )
      ]);

      // Get exit code
      const inspectResult = await exec.inspect();
      const exitCode = inspectResult.ExitCode || 0;

      // Truncate output if needed
      const stdoutTruncated = stdout.length > config.maxOutputChars;
      const stderrTruncated = stderr.length > config.maxOutputChars;

      if (stdoutTruncated) {
        stdout = stdout.substring(0, config.maxOutputChars) + '\n[... STDOUT TRUNCATED ...]';
      }
      if (stderrTruncated) {
        stderr = stderr.substring(0, config.maxOutputChars) + '\n[... STDERR TRUNCATED ...]';
      }

      return {
        stdout,
        stderr,
        exitCode,
        truncated: stdoutTruncated || stderrTruncated,
        stdoutTruncated,
        stderrTruncated,
        durationMs: Date.now() - startTime,
        timedOut: false
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'TIMEOUT') {
        return {
          stdout,
          stderr,
          exitCode: 124, // Standard timeout exit code
          truncated: false,
          stdoutTruncated: false,
          stderrTruncated: false,
          durationMs: timeout,
          timedOut: true
        };
      }
      throw error;
    }
  }

  /**
   * Check if container is healthy for an agent
   */
  async isHealthy(agentId: AgentId): Promise<boolean> {
    const container = this.agentContainers.get(agentId);
    if (!container) {
      return false;
    }

    try {
      const info = await container.inspect();
      const healthy = info.State.Running;

      const state = this.getAgentState(agentId);
      state.running = healthy;
      state.lastHealthCheck = new Date().toISOString();
      this.saveAgentState(agentId, state);

      return healthy;
    } catch (error) {
      const state = this.getAgentState(agentId);
      state.running = false;
      this.saveAgentState(agentId, state);
      return false;
    }
  }

  /**
   * Stop the container for an agent
   */
  async stopContainer(agentId: AgentId): Promise<void> {
    const container = this.agentContainers.get(agentId);
    const config = this.agentConfigs.get(agentId);

    if (!container) {
      return;
    }

    try {
      log.info(`Stopping container for ${agentId}`);
      await container.stop();

      if (!config?.autoRemove) {
        await container.remove();
      }

      this.agentContainers.delete(agentId);

      const state = this.getAgentState(agentId);
      state.running = false;
      state.containerId = undefined;
      this.saveAgentState(agentId, state);

      log.info(`Container stopped for ${agentId}`);
    } catch (error) {
      log.error(`Failed to stop container for ${agentId}`, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Get container info for an agent
   */
  async getContainerInfo(agentId: AgentId): Promise<Docker.ContainerInspectInfo | null> {
    const container = this.agentContainers.get(agentId);
    if (!container) {
      return null;
    }

    try {
      return await container.inspect();
    } catch (error) {
      return null;
    }
  }

  /**
   * Build container path from relative path
   */
  buildContainerPath(agentId: AgentId, relativePath: string): string {
    const config = this.agentConfigs.get(agentId);
    if (!config) {
      throw new Error(`Docker not configured for agent ${agentId}`);
    }

    // Remove leading slash if present
    const cleanPath = relativePath.startsWith('/')
      ? relativePath.substring(1)
      : relativePath;

    return path.posix.join(config.workspaceContainer, cleanPath);
  }

  /**
   * Check if Docker is enabled for an agent
   */
  isEnabled(agentId: AgentId): boolean {
    const config = this.agentConfigs.get(agentId);
    return config?.enabled ?? false;
  }

  /**
   * Get current configuration for an agent
   */
  getConfig(agentId: AgentId): DockerConfig | undefined {
    return this.agentConfigs.get(agentId);
  }

  /**
   * Get current state for an agent (public for tools)
   */
  async getState(agentId?: AgentId): Promise<Record<string, unknown>> {
    if (agentId) {
      return this.getAgentState(agentId);
    }
    return {};
  }

  /**
   * Private: Ensure workspace directory exists
   */
  private async ensureWorkspaceExists(workspaceHost: string): Promise<void> {
    try {
      await fs.access(workspaceHost);
    } catch {
      log.info(`Creating workspace directory`, { path: workspaceHost });
      await fs.mkdir(workspaceHost, { recursive: true });
    }
  }

  /**
   * Private: Pull Docker image if not present
   */
  private async pullImageIfMissing(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
      log.info(`Image already exists`, { image });
    } catch {
      log.info(`Pulling image`, { image });
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) {
            reject(err);
            return;
          }

          this.docker.modem.followProgress(stream, (err: Error | null) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
      log.info(`Image pulled successfully`, { image });
    }
  }

  /**
   * Private: Find existing container by name
   */
  private async findContainer(containerName: string): Promise<Docker.Container | null> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      const found = containers.find(c =>
        c.Names.some(name => name === `/${containerName}`)
      );

      if (found) {
        return this.docker.getContainer(found.Id);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup(): Promise<void> {
    log.info('Cleaning up all containers...');
    for (const agentId of this.agentContainers.keys()) {
      await this.stopContainer(agentId);
    }
  }
}

export default DockerService;
