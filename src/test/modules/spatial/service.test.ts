/**
 * Spatial Service Tests
 *
 * Tests for SpatialService singleton.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import SpatialService from '../../../modules/spatial/service.js';
import { createMockServiceContext, createMockReactiveState, MockServiceContext } from '../../mocks/service-context.mock.js';
import type { AgentId } from '../../../types/agent.js';

// Mock LettaService
function createMockLettaService() {
  return {
    getClient: vi.fn().mockReturnValue({
      updateMemoryBlock: vi.fn().mockResolvedValue(undefined),
      getMemoryBlocks: vi.fn().mockResolvedValue({})
    }),
    getLettaAgentId: vi.fn().mockReturnValue('letta-agent-123')
  };
}

describe('SpatialService', () => {
  let service: SpatialService;
  let mockContext: MockServiceContext;
  let mockLettaService: ReturnType<typeof createMockLettaService>;

  const testConfig = {
    worlds: {
      'test-world': {
        name: 'Test World',
        description: 'A test world',
        default_location: 'entrance',
        locations: {
          entrance: {
            name: 'Entrance',
            description: 'The main entrance',
            connections: ['hallway']
          },
          hallway: {
            name: 'Hallway',
            description: 'A long hallway',
            connections: ['entrance', 'room']
          },
          room: {
            name: 'Room',
            description: 'A small room',
            connections: ['hallway']
          }
        }
      }
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SpatialService();
    mockContext = createMockServiceContext();
    mockLettaService = createMockLettaService();

    mockContext.getService.mockReturnValue(mockLettaService);
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

    it('should initialize agent with valid config', async () => {
      const agentId = 'test-agent' as AgentId;

      const globalState = createMockReactiveState<any>({ worlds: {} });
      const agentState = createMockReactiveState<any>({});
      mockContext.getGlobalState.mockReturnValue(globalState);
      mockContext.getState.mockReturnValue(agentState);

      await service.initAgent(agentId, testConfig);

      // Should set agent state with world_id and current_location
      expect(agentState.set).toHaveBeenCalledWith(
        expect.objectContaining({
          world_id: 'test-world',
          current_location: 'entrance'
        })
      );
    });

    it('should throw with invalid config', async () => {
      const agentId = 'test-agent' as AgentId;
      const invalidConfig = { worlds: 'not-an-object' };

      await expect(
        service.initAgent(agentId, invalidConfig)
      ).rejects.toThrow();
    });

    it('should throw if service not initialized', async () => {
      const freshService = new SpatialService();
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

    it('should return true if state has world_id and current_location', () => {
      const state = {
        world_id: 'test-world',
        current_location: 'entrance'
      };

      const result = service.canReconnect('test-agent' as AgentId, state);

      expect(result).toBe(true);
    });

    it('should return false if state is missing world_id', () => {
      const state = {
        current_location: 'entrance'
      };

      const result = service.canReconnect('test-agent' as AgentId, state);

      expect(result).toBe(false);
    });

    it('should return false if state is missing current_location', () => {
      const state = {
        world_id: 'test-world'
      };

      const result = service.canReconnect('test-agent' as AgentId, state);

      expect(result).toBe(false);
    });
  });

  describe('look', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        worlds: {
          'test-world': {
            name: 'Test World',
            description: 'A test world',
            default_location: 'entrance',
            locations: {
              entrance: {
                name: 'Entrance',
                description: 'The main entrance',
                connections: ['hallway']
              },
              hallway: {
                name: 'Hallway',
                description: 'A long hallway',
                connections: ['entrance', 'room']
              },
              room: {
                name: 'Room',
                description: 'A small room',
                connections: ['hallway']
              }
            },
            objects: {},
            agents: {
              'test-agent': { location: 'entrance', position: 'here' }
            }
          }
        }
      });
      const agentState = createMockReactiveState<any>({
        world_id: 'test-world',
        current_location: 'entrance',
        current_position: 'here'
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
      mockContext.getState.mockReturnValue(agentState);
    });

    it('should return location description', async () => {
      const agentId = 'test-agent' as AgentId;

      const result = await service.look(agentId);

      expect(result).toContain('entrance');
      expect(result).toContain('The main entrance');
    });

    it('should return detailed look when requested', async () => {
      const agentId = 'test-agent' as AgentId;

      const result = await service.look(agentId, true);

      expect(typeof result).toBe('string');
    });
  });

  describe('moveTo', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        worlds: {
          'test-world': {
            name: 'Test World',
            description: 'A test world',
            default_location: 'entrance',
            locations: testConfig.worlds['test-world'].locations,
            objects: {},
            agents: {
              'test-agent': { location: 'entrance', position: 'here' }
            }
          }
        }
      });
      const agentState = createMockReactiveState<any>({
        world_id: 'test-world',
        current_location: 'entrance',
        current_position: 'here'
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
      mockContext.getState.mockReturnValue(agentState);
    });

    it('should move agent to valid location', async () => {
      const agentId = 'test-agent' as AgentId;

      const result = await service.moveTo(agentId, 'hallway');

      expect(result.success).toBe(true);
    });

    it('should fail for non-existent location', async () => {
      const agentId = 'test-agent' as AgentId;

      const result = await service.moveTo(agentId, 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('listLocations', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        worlds: {
          'test-world': {
            name: 'Test World',
            description: 'A test world',
            default_location: 'entrance',
            locations: testConfig.worlds['test-world'].locations,
            objects: {},
            agents: {}
          }
        }
      });
      const agentState = createMockReactiveState<any>({
        world_id: 'test-world',
        current_location: 'entrance',
        current_position: 'here'
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
      mockContext.getState.mockReturnValue(agentState);
    });

    it('should return all locations in current world', async () => {
      const agentId = 'test-agent' as AgentId;

      const result = await service.listLocations(agentId);

      expect(result).toContain('entrance');
      expect(result).toContain('hallway');
      expect(result).toContain('room');
    });
  });

  describe('createLocations', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        worlds: {
          'test-world': {
            name: 'Test World',
            description: 'A test world',
            default_location: 'entrance',
            locations: { ...testConfig.worlds['test-world'].locations },
            objects: {},
            agents: {}
          }
        }
      });
      const agentState = createMockReactiveState<any>({
        world_id: 'test-world',
        current_location: 'entrance',
        current_position: 'here'
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
      mockContext.getState.mockReturnValue(agentState);
    });

    it('should create new locations', async () => {
      const agentId = 'test-agent' as AgentId;
      const newLocations = [
        { name: 'garden', description: 'A beautiful garden' }
      ];

      const result = await service.createLocations(agentId, newLocations);

      expect(result.success).toBe(true);
      expect(result.created).toContain('garden');
    });
  });

  describe('createObjects', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        worlds: {
          'test-world': {
            name: 'Test World',
            description: 'A test world',
            default_location: 'entrance',
            locations: testConfig.worlds['test-world'].locations,
            objects: {},
            agents: {}
          }
        }
      });
      const agentState = createMockReactiveState<any>({
        world_id: 'test-world',
        current_location: 'entrance',
        current_position: 'here'
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
      mockContext.getState.mockReturnValue(agentState);
    });

    it('should create new objects', async () => {
      const agentId = 'test-agent' as AgentId;
      const newObjects = [
        {
          name: 'sword',
          type: 'weapon' as const,
          location: 'entrance',
          position: 'on the ground'
        }
      ];

      const result = await service.createObjects(agentId, newObjects);

      expect(result.success).toBe(true);
      expect(result.created).toHaveLength(1);
    });
  });

  describe('switchWorld', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);

      const globalState = createMockReactiveState<any>({
        worlds: {
          'test-world': {
            name: 'Test World',
            description: 'A test world',
            default_location: 'entrance',
            locations: {
              entrance: {
                name: 'Entrance',
                description: 'The main entrance',
                connections: ['hallway']
              },
              hallway: {
                name: 'Hallway',
                description: 'A long hallway',
                connections: ['entrance', 'room']
              },
              room: {
                name: 'Room',
                description: 'A small room',
                connections: ['hallway']
              }
            },
            objects: {},
            agents: {
              'test-agent': { location: 'entrance', position: 'here' }
            }
          },
          'other-world': {
            name: 'Other World',
            description: 'Another test world',
            default_location: 'start',
            locations: {
              start: { name: 'Start', description: 'Starting point', connections: [] }
            },
            objects: {},
            agents: {}
          }
        }
      });
      const agentState = createMockReactiveState<any>({
        world_id: 'test-world',
        current_location: 'entrance',
        current_position: 'here'
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
      mockContext.getState.mockReturnValue(agentState);
    });

    it('should switch to another world', async () => {
      const agentId = 'test-agent' as AgentId;

      const result = await service.switchWorld(agentId, 'other-world');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Other World');
    });

    it('should fail for non-existent world', async () => {
      const agentId = 'test-agent' as AgentId;

      const result = await service.switchWorld(agentId, 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('cleanupAgent', () => {
    beforeEach(async () => {
      await service.init(mockContext as any);
    });

    it('should cleanup agent without errors', async () => {
      const globalState = createMockReactiveState<any>({
        worlds: {
          'test-world': {
            name: 'Test World',
            agents: { 'test-agent': { location: 'entrance' } }
          }
        }
      });
      const agentState = createMockReactiveState<any>({
        world_id: 'test-world',
        current_location: 'entrance'
      });
      mockContext.getGlobalState.mockReturnValue(globalState);
      mockContext.getState.mockReturnValue(agentState);

      await expect(
        service.cleanupAgent('test-agent' as AgentId)
      ).resolves.not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should cleanup without errors', async () => {
      await service.init(mockContext as any);

      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});
