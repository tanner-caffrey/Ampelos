# Ampelos: Modular MCP Service Framework for Letta Agents

## Overview

Ampelos is a modular MCP (Model Context Protocol) server framework designed to provide stateful, persistent services to Letta AI agents. It enables easy addition of tools and services while maintaining per-agent state isolation and data persistence across restarts.

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Database**: LowDB (embedded JSON database)
- **Build Tool**: tsx (fast TypeScript execution)
- **Schema Validation**: TBD (likely Zod)

## Goals

- **Modularity**: Easy to add new tools and services without modifying core code
- **Agent-scoped state**: Each agent maintains isolated state for its services
- **Persistence**: Service state survives server restarts and rebuilds
- **Simplicity**: Clear, organized codebase that's easy to understand and extend
- **Flexibility**: Support standalone tools, standalone services, and paired tool+service modules

## Core Concepts

### Module Types

Ampelos supports three types of modules:

1. **Standalone Tools**: MCP tools with no persistent state (e.g., calculator)
2. **Standalone Services**: Background services with no tool interface (e.g., telemetry)
3. **Paired Modules**: Tool + Service combination where the tool provides the interface and the service manages state (e.g., inventory system)

### Agent Identity

**Critical Distinction**:
- **agent_id**: Unique identifier from Letta (primary key for all operations)
- **agent_name**: Human-readable display name (NOT used for data access)

Services MUST use `agent_id` internally. The `agent_name` is for display and logging only. This distinction must be enforced through typing/interfaces to prevent cross-wiring.

**Agent Metadata**:
- `agent_id` (string, required)
- `agent_name` (string, required)
- `enabled` (boolean)
- `last_request_time` (timestamp)
- `last_response_time` (timestamp)
- Additional stats as needed

## Architecture

### Directory Structure

```
ampelos/
├── src/
│   ├── core/                    # Core server logic
│   │   ├── server.ts           # MCP server implementation
│   │   ├── agent-registry.ts   # Agent management
│   │   ├── module-loader.ts    # Module discovery and loading
│   │   └── service-manager.ts  # Service lifecycle management
│   ├── modules/
│   │   ├── tools/              # Standalone tools
│   │   │   └── calculator/
│   │   ├── services/           # Standalone services
│   │   │   └── telemetry/
│   │   └── inventory/          # Example paired module
│   │       ├── index.ts
│   │       ├── manifest.json   # Module metadata
│   │       ├── tool.ts         # Tool implementation
│   │       └── service.ts      # Service implementation
│   └── types/                  # TypeScript type definitions
│       ├── service.ts
│       ├── tool.ts
│       └── config.ts
├── storage/
│   └── ampelos.db.json        # LowDB database file
├── configs/
│   ├── agents.json            # Agent configuration
│   └── server.json            # Server configuration
├── package.json
├── tsconfig.json
└── README.md
```

### Module Structure

Each module lives in its own directory and contains:

**manifest.json** - Module metadata:
```json
{
  "name": "inventory",
  "version": "1.0.0",
  "provides": ["tool", "service"],
  "dependencies": [],
  "config_schema": {
    "type": "object",
    "properties": {
      "max_items": {"type": "integer", "default": 50},
      "lazy": {"type": "boolean", "default": true}
    }
  },
  "advertise": true
}
```

**Key manifest fields**:
- `name`: Module identifier
- `version`: Semantic version
- `provides`: Array containing "tool", "service", or both
- `dependencies`: Array of other service names this module depends on
- `config_schema`: JSON Schema for validation
- `advertise`: If false, tool won't be advertised to Letta (default: true)

## Service Architecture

### Service Interface

All services must implement the following base interface:

```typescript
interface BaseService {
    /**
     * Initialize service for a specific agent
     * 
     * @param agentId - Letta agent identifier
     * @param config - Validated configuration object
     * @param context - Service context (database access, other services)
     */
    init(agentId: string, config: object, context: ServiceContext): Promise<void>;
    
    /**
     * Handle configuration changes at runtime
     * 
     * Called when config is hot-reloaded. Service should reconcile
     * any state changes needed (e.g., connection string changed,
     * limits adjusted, features enabled/disabled).
     * 
     * @param oldConfig - Previous configuration
     * @param newConfig - New validated configuration
     */
    onConfigChange(oldConfig: object, newConfig: object): Promise<void>;
    
    /**
     * Return current service state for persistence
     * 
     * @returns Object representing complete service state
     */
    getState(): Promise<object>;
    
    /**
     * Restore service state from persistence
     * 
     * @param state - Previously saved state object
     */
    setState(state: object): Promise<void>;
    
    /**
     * Optional cleanup on service shutdown
     * 
     * Release resources, close connections, etc.
     */
    cleanup?(): Promise<void>;
    
    /**
     * Optional: Declare service dependencies
     * 
     * @returns Array of service names this service depends on
     */
    dependsOn?(): string[];
}

interface ServiceContext {
    /**
     * Get scoped database access for this service
     * Path: states.{agentId}.{serviceName}
     */
    getDB(): ScopedDatabase;
    
    /**
     * Access another service for this agent
     */
    getService(serviceName: string): BaseService;
    
    /**
     * Get current agent metadata
     */
    getAgentMetadata(): AgentMetadata;
}
```

### Service Instantiation

- **One service instance per agent** (not singleton)
- **Lazy vs Eager initialization**:
  - `lazy: true` (default): Service created on first tool call
  - `lazy: false`: Service initialized at server startup if agent is enabled
- Services can access other services via service manager
- Services maintain their own in-memory state between calls

### Service Lifecycle

1. **Initialization**: Agent enabled, service config loaded, `__init__()` called
2. **State Restoration**: `set_state()` called with persisted data from storage
3. **Runtime**: Service handles tool calls and maintains state
4. **Config Hot-Reload**: `on_config_change()` called when config changes
5. **Persistence**: `get_state()` called periodically or on shutdown
6. **Cleanup**: `cleanup()` called on service destruction

## Tool Architecture

### Tool Definition

Tools can directly access their agent-scoped service:

```typescript
async function handleInventoryAdd(
    params: { item: string },
    context: ToolContext
): Promise<ToolResult> {
    /**
     * Tool handler with access to agent context
     * 
     * @param params - Tool parameters from agent
     * @param context - Provides agentId and service access
     */
    const service = context.getService('inventory') as InventoryService;
    const result = await service.addItem(params.item);
    
    return {
        content: [{ type: "text", text: `Added ${params.item} to inventory` }]
    };
}
```

### Tool Registration

- Tools are advertised to Letta based on `advertise` field in manifest
- Only tools for configured agents are actually available to those agents
- Tools for disabled agents are not initialized

## Configuration System

### Agent Configuration (agents.json)

```json
{
  "agents": {
    "agent-123e4567": {
      "name": "CompanionBot",
      "enabled": true,
      "modules": {
        "inventory": {
          "lazy": false,
          "max_items": 100
        },
        "telemetry": {
          "config_file": "configs/telemetry_verbose.json"
        },
        "calculator": {}
      }
    }
  }
}
```

### Module Configuration Options

Three ways to configure a module:

1. **Default config**: Empty object `{}`
2. **External file**: `{"config_file": "path/to/config.json"}`
3. **Inline config**: Specify parameters directly in module block

**Config resolution priority**: Inline > config_file > module defaults

### Configuration Changes

**Hot-reload** (no restart required):
- Changes to existing module configurations
- Triggers `on_config_change()` on affected services
- Config validated against schema before applying

**Restart required**:
- Adding new modules to an agent
- Removing modules from an agent
- Changes to agent enabled status

## Storage System

### Database Architecture: LowDB

**Single shared database file**: `storage/ampelos.db.json`

**Rationale**:
- JSON-native storage (no schema migrations for service state)
- Human-readable and directly editable
- Single file for simple backup/restore
- Atomic writes across services when needed
- Easy to query across agents for admin purposes

**Database Structure**:
```json
{
  "agents": {
    "agent-123": {
      "name": "CompanionBot",
      "enabled": true,
      "modules": ["inventory", "telemetry"],
      "metadata": {
        "last_request_time": "2025-01-07T10:30:00Z",
        "last_response_time": "2025-01-07T10:30:01Z"
      }
    }
  },
  "states": {
    "agent-123": {
      "inventory": {
        "items": [],
        "max_items": 100
      },
      "telemetry": {
        "events": []
      }
    }
  },
  "configs": {
    "agent-123": {
      "inventory": {
        "lazy": false,
        "max_items": 100
      }
    }
  }
}
```

**Key Design Decisions**:
- Services get scoped database access to their state path
- Cannot accidentally access other agent/service data
- Additional service "tables" are part of the service's state blob
- Services structure their state as nested JSON however needed

### State Management

**Service Database Access**:
Services receive a scoped database handle:
```typescript
// Service gets access to its own state namespace
const db = context.getDB(); // Scoped to agent-{id}.states.{service_name}

// Update state
await db.update((state) => {
  state.items.push(newItem);
  return state;
});

// Read state
const state = await db.read();
```

**State Structure Flexibility**:
Services can organize their state with nested structures:
```typescript
{
  "items": [...],        // Main data
  "metadata": {...},     // Service metadata
  "cache": {...},        // Computed values
  "indexes": {...}       // Performance optimizations
}
```

**Persistence**:
- LowDB handles automatic persistence to disk
- Services implement `get_state()` and `set_state()` for serialization
- Core system manages state restoration on service initialization

### Manual State Editing

**Direct Editing**:
1. Stop Ampelos server
2. Edit `storage/ampelos.db.json` directly
3. Restart server (validates and loads changes)

**Safety**:
- Edits while server is running will be overwritten
- Schema validation on startup prevents corrupt data
- Invalid configs are rejected with clear error messages

## Inter-Service Communication

Services can depend on and communicate with other services:

1. **Declaration**: Service declares dependencies via `depends_on()`
2. **Access**: Service manager ensures dependencies are initialized first
3. **Service lookup**: Services access others through service manager API
4. **Scoping**: All inter-service calls are within the same agent's scope

**Example**: Quest system depends on inventory system to check item requirements

## API Design

### MCP Server Interface

Standard MCP protocol:
- Tool discovery and invocation
- Agent identification via headers (agent_id)
- Result streaming where applicable

### Management API (Future)

For runtime operations:
- Agent status queries
- Service state inspection
- Config validation and reloading
- Manual sync operations

## Error Handling

### Tool Calls to Uninitialized Services

**Default behavior**: Return error to agent
**Configurable**: Per-module option to auto-initialize with defaults

```json
"modules": {
  "inventory": {
    "auto_initialize": false  // Explicit error if not initialized
  }
}
```

### Service Initialization Failures

- Log error with full context
- Mark service as failed for that agent
- Allow retry via management API
- Don't crash entire server

### Configuration Validation Failures

- Validate on load using JSON Schema from manifest
- Report specific validation errors
- Fall back to previous working config
- Prevent invalid configs from being applied

## Implementation Phases

### Phase 1: Core Framework
- Module discovery and loading system
- Agent registry and service manager
- Basic service lifecycle (init, cleanup)
- SQLite storage backend
- Simple config file loading

### Phase 2: Full Service Features
- Config hot-reloading with `on_config_change()`
- Inter-service dependencies and communication
- JSON mirror with manual sync
- Schema validation

### Phase 3: Enhanced Features
- Management API for runtime operations
- Advanced JSON sync strategies
- Service health monitoring
- Performance metrics

## Design Principles

1. **Explicit over implicit**: Clear declarations in manifests and configs
2. **Fail safely**: Errors should be contained and recoverable
3. **Validate early**: Check configs and schemas before initialization
4. **Isolate state**: Agent data never leaks across boundaries
5. **Simple by default**: Common cases require minimal configuration
6. **Extensible by design**: Core never needs modification for new modules

## Non-Goals

- Real-time collaboration between agents on shared state
- Built-in user authentication/authorization (handled by Letta)
- Web UI for management (CLI/API first)
- Complex workflow orchestration (use Letta's multi-agent features)

## Open Questions

- Module loader implementation: Discovery, validation, and instantiation flow
- Service manager API: Instance caching, lifecycle management, inter-service lookup
- Tool context API: Full interface definition and capabilities
- Schema validation: Zod integration for configs and manifests
- Error handling patterns: TypeScript error types and propagation
- Logging strategy: Console, file, or structured logging library
- Testing approach: Unit tests for services, integration tests for modules

---

**Document Status**: Initial Design  
**Last Updated**: 2025-01-07  
**Version**: 0.1.0