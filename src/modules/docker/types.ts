/**
 * Docker module type definitions
 */

import { z } from 'zod';

/**
 * Docker module configuration schema
 */
export const DockerConfigSchema = z.object({
  // Core configuration
  enabled: z.boolean().default(true).describe('Enable Docker sandbox mode'),
  image: z.string().default('alpine:latest').describe('Docker image to use'),
  containerName: z.string().optional().describe('Container name (auto-generated if not provided)'),
  workspaceHost: z.string().describe('Host directory to mount as workspace'),
  workspaceContainer: z.string().default('/workspace').describe('Container mount point'),

  // Execution limits
  commandTimeoutMs: z.number().default(30000).describe('Default command timeout (30 seconds)'),
  maxCommandTimeoutMs: z.number().default(300000).describe('Max allowed timeout (5 minutes)'),
  maxOutputChars: z.number().default(32000).describe('Output truncation limit'),

  // Container lifecycle
  autoStart: z.boolean().default(true).describe('Start container on service init'),
  autoPull: z.boolean().default(true).describe('Auto-pull image if missing'),
  autoRemove: z.boolean().default(false).describe('Auto-remove container on stop'),
  lazy: z.boolean().default(false).describe('Lazy-load the service'),

  // Bidirectional communication
  enableBidirectional: z.boolean().default(true).describe('Enable container-to-agent messaging'),
  ampelosApiUrl: z.string().optional().describe('Ampelos API URL for callbacks (auto-configured if not provided)'),
  ampelosApiPort: z.number().default(3005).describe('Ampelos API port for callbacks'),
  setupCallbackScript: z.boolean().default(true).describe('Auto-create callback scripts in workspace')
});

export type DockerConfig = z.infer<typeof DockerConfigSchema>;

/**
 * Command execution result
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Docker service state
 */
export interface DockerServiceState extends Record<string, unknown> {
  containerId?: string;
  containerName?: string;
  image: string;
  running: boolean;
  initialized: boolean;
  lastHealthCheck?: string;
  /** Whether callback scripts have been set up */
  callbackConfigured?: boolean;
}

/**
 * File/directory entry from ls output
 */
export interface FileEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;
  modified?: string;
  permissions?: string;
  owner?: string;
  group?: string;
}
