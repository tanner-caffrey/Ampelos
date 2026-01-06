/**
 * Subagent Module
 *
 * Spawn and manage sub-agents from Letta templates with shared memory blocks.
 * Supports both synchronous and asynchronous spawning with shared memory.
 */

export { default as SubagentService } from './service.js';
export { tools } from './tool.js';
export * from './types.js';
