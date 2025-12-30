/**
 * Scheduled Messages Service Tests
 *
 * Tests for ScheduledMessagesService singleton.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import ScheduledMessagesService from '../../../modules/scheduled-messages/service.js';
import { createMockServiceContext, createMockReactiveState, MockServiceContext } from '../../mocks/service-context.mock.js';
import type { AgentId } from '../../../types/agent.js';

// Mock LettaService
function createMockLettaService() {
  return {
    chat: vi.fn().mockResolvedValue({ messages: [] }),
    registerOnChatComplete: vi.fn(),
    unregisterOnChatComplete: vi.fn()
  };
}

describe('ScheduledMessagesService', () => {
  let service: ScheduledMessagesService;
  let mockContext: MockServiceContext;
  let mockLettaService: ReturnType<typeof createMockLettaService>;

  const testConfig = {
    max_schedules: 10,
    min_interval_seconds: 60
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    service = new ScheduledMessagesService();
    mockContext = createMockServiceContext();
    mockLettaService = createMockLettaService();

    mockContext.getService.mockReturnValue(mockLettaService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('init', () => {
    it('should initialize service context', async () => {
      await service.init(mockContext as any);

      expect(service).toBeDefined();
    });
  });

  describe('initAgent', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should initialize for a specific agent', async () => {
      const agentId = 'test-agent' as AgentId;

      const agentState = createMockReactiveState<any>({
        schedules: {},
        total_loops: 0
      });
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent(agentId, testConfig);

      expect(mockLettaService.registerOnChatComplete).toHaveBeenCalled();
    });

    it('should throw if letta service not available', async () => {
      const agentId = 'test-agent' as AgentId;

      mockContext.getService.mockImplementation(() => {
        throw new Error('Service not found');
      });

      const agentState = createMockReactiveState<any>({
        schedules: {},
        total_loops: 0
      });
      mockContext.getState.mockReturnValue(agentState);

      await expect(
        service.initAgent(agentId, testConfig)
      ).rejects.toThrow(/letta/i);
    });

    it('should throw if service not initialized', async () => {
      const freshService = new ScheduledMessagesService();
      const agentId = 'test-agent' as AgentId;

      await expect(
        freshService.initAgent(agentId, testConfig)
      ).rejects.toThrow(/not initialized/i);
    });
  });

  describe('canReconnect', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should always return true', () => {
      const result = service.canReconnect('test-agent' as AgentId, {});
      expect(result).toBe(true);
    });
  });

  describe('createSchedule', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const agentState = createMockReactiveState<any>({
        schedules: {},
        total_loops: 0
      });
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    it('should create time-based schedule', async () => {
      const agentId = 'test-agent' as AgentId;

      const schedule = await service.createSchedule(agentId, {
        type: 'time',
        interval: 300,
        message: 'Reminder: Check your tasks!'
      });

      expect(schedule.id).toMatch(/^sched-/);
      expect(schedule.type).toBe('time');
      expect(schedule.interval).toBe(300);
      expect(schedule.enabled).toBe(true);
    });

    it('should create loop-based schedule', async () => {
      const agentId = 'test-agent' as AgentId;

      const schedule = await service.createSchedule(agentId, {
        type: 'loop',
        interval: 5,
        message: 'Status update'
      });

      expect(schedule.type).toBe('loop');
      expect(schedule.interval).toBe(5);
    });

    it('should fail if interval is below minimum', async () => {
      const agentId = 'test-agent' as AgentId;

      await expect(
        service.createSchedule(agentId, {
          type: 'time',
          interval: 30, // Below minimum of 60
          message: 'Too frequent'
        })
      ).rejects.toThrow(/minimum interval/i);
    });

    it('should fail if max schedules reached', async () => {
      const agentId = 'test-agent' as AgentId;

      // Create state with max schedules
      const schedules: Record<string, any> = {};
      for (let i = 0; i < 10; i++) {
        schedules[`sched-${i}`] = { id: `sched-${i}`, enabled: true };
      }

      const agentState = createMockReactiveState<any>({
        schedules,
        total_loops: 0
      });
      mockContext.getState.mockReturnValue(agentState);

      await expect(
        service.createSchedule(agentId, {
          type: 'time',
          interval: 300,
          message: 'New schedule'
        })
      ).rejects.toThrow(/maximum schedule limit/i);
    });

    it('should use user role by default', async () => {
      const agentId = 'test-agent' as AgentId;

      const schedule = await service.createSchedule(agentId, {
        type: 'time',
        interval: 300,
        message: 'Test'
      });

      expect(schedule.role).toBe('user');
    });

    it('should allow system role', async () => {
      const agentId = 'test-agent' as AgentId;

      const schedule = await service.createSchedule(agentId, {
        type: 'time',
        interval: 300,
        message: 'System message',
        role: 'system'
      });

      expect(schedule.role).toBe('system');
    });
  });

  describe('stopSchedule', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const agentState = createMockReactiveState<any>({
        schedules: {
          'sched-123': {
            id: 'sched-123',
            type: 'time',
            interval: 300,
            message: 'Test',
            enabled: true
          }
        },
        total_loops: 0
      });
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    it('should stop existing schedule', async () => {
      const agentId = 'test-agent' as AgentId;

      const result = await service.stopSchedule(agentId, 'sched-123');

      expect(result).toBe(true);
    });

    it('should return false for non-existent schedule', async () => {
      const agentId = 'test-agent' as AgentId;

      const result = await service.stopSchedule(agentId, 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('stopAllSchedules', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const agentState = createMockReactiveState<any>({
        schedules: {
          'sched-1': { id: 'sched-1', type: 'time', interval: 300, enabled: true },
          'sched-2': { id: 'sched-2', type: 'loop', interval: 5, enabled: true }
        },
        total_loops: 0
      });
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    it('should stop all schedules', async () => {
      const agentId = 'test-agent' as AgentId;

      const count = await service.stopAllSchedules(agentId);

      expect(count).toBe(2);
    });
  });

  describe('listSchedules', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const agentState = createMockReactiveState<any>({
        schedules: {
          'sched-1': { id: 'sched-1', type: 'time', interval: 300, message: 'Test 1', enabled: true },
          'sched-2': { id: 'sched-2', type: 'loop', interval: 5, message: 'Test 2', enabled: true }
        },
        total_loops: 0
      });
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    it('should return all schedules', () => {
      const agentId = 'test-agent' as AgentId;

      const schedules = service.listSchedules(agentId);

      expect(schedules).toHaveLength(2);
    });
  });

  describe('time-based schedule firing', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const agentState = createMockReactiveState<any>({
        schedules: {},
        total_loops: 0
      });
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    it('should fire schedule after interval', async () => {
      const agentId = 'test-agent' as AgentId;

      await service.createSchedule(agentId, {
        type: 'time',
        interval: 300, // 5 minutes
        message: 'Scheduled message'
      });

      // Advance time by 5 minutes
      await vi.advanceTimersByTimeAsync(300 * 1000);

      expect(mockLettaService.chat).toHaveBeenCalledWith(
        agentId,
        '[SCHEDULED] Scheduled message',
        expect.any(Object)
      );
    });
  });

  describe('cleanupAgent', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const agentState = createMockReactiveState<any>({
        schedules: {},
        total_loops: 0
      });
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent('test-agent' as AgentId, testConfig);
    });

    it('should cleanup agent and unregister callback', async () => {
      await service.cleanupAgent('test-agent' as AgentId);

      expect(mockLettaService.unregisterOnChatComplete).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should cleanup without errors', async () => {
      await service.init(mockContext as any);

      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});
