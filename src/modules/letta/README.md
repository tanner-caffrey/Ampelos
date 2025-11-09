# Letta Agent Framework Module

A comprehensive framework for creating and managing Letta agents with persistent identity, deep relationship memory, and self-managed memory systems.

## Overview

The Letta module integrates Letta AI's agent framework into Ampelos, providing:

- **Persistent Identity**: Agents maintain continuous identity across conversations
- **Deep Relationship Memory**: Three-tier memory system (core blocks, archival, recall)
- **Self-Managed Memory**: Agents reflexively manage their own memory using built-in tools
- **Template-Based Configuration**: Easily customize agents via JSON configs
- **Per-Agent State Isolation**: Each Ampelos agent gets its own Letta agent instance

## Architecture

### Components

```
src/modules/letta/
├── service.ts              # Main service (agent lifecycle management)
├── client.ts               # Letta SDK client wrapper
├── tool.ts                 # MCP tools for agent interaction
├── custom-tools.ts         # Custom tools for agent self-management
├── manifest.json           # Module metadata and config schema
├── templates/
│   ├── memory_blocks/      # Memory block templates
│   │   ├── identity_default.txt
│   │   ├── relationship_default.txt
│   │   ├── persona_conversational.txt
│   │   └── human_default.txt
│   └── system_prompts/     # System prompt templates
│       └── conversational_companion.txt
└── utils/
    ├── template-engine.ts  # Template rendering and variable substitution
    ├── memory-builder.ts   # Memory block construction from config
    └── config-validator.ts # Zod schemas for configuration validation
```

### Three-Tier Memory System

1. **Core Memory Blocks** (always loaded)
   - `identity`: Agent's evolving sense of self
   - `relationship_context`: Dynamics with the user
   - `persona`: Communication style and memory philosophy
   - `human`: Basic facts about the user

2. **Archival Memory** (searchable long-term storage)
   - Significant conversations and moments
   - Identity realizations and growth
   - Relationship milestones
   - Tagged for semantic retrieval

3. **Recall Memory** (recent conversation context)
   - Automatically managed by Letta
   - Searchable via `conversation_search`

## Configuration

### Server Configuration

Connect to your local Letta server:

```json
{
  "server": {
    "base_url": "http://localhost:8283",
    "token": "optional-auth-token"
  }
}
```

### Agent Configuration

Define agent memory and behavior:

```json
{
  "letta_agent_config": {
    "model": "anthropic/claude-3-5-sonnet-20241022",
    "embedding": "openai/text-embedding-3-small",
    "memory_blocks": {
      "identity": {
        "limit": 3000,
        "template": "identity_default"
      },
      "relationship_context": {
        "limit": 2500,
        "template": "relationship_default"
      },
      "persona": {
        "limit": 2000,
        "template": "persona_conversational",
        "customizations": {
          "agent_name": "Sam",
          "core_traits": ["curious", "thoughtful", "playful"]
        }
      },
      "human": {
        "limit": 2000,
        "value": "Name: Tanner\\nInterests: AI, D&D, photography"
      }
    },
    "system_prompt_template": "conversational_companion",
    "custom_tools": ["reflect_and_commit_memory"]
  }
}
```

### Memory Block Configuration Modes

Each memory block supports three configuration modes:

#### 1. Template Mode
Use a pre-defined template with variable substitution:

```json
{
  "persona": {
    "limit": 2000,
    "template": "persona_conversational",
    "customizations": {
      "agent_name": "Sam",
      "core_traits": ["curious", "thoughtful", "playful"]
    }
  }
}
```

Variables in templates use `{{variable}}` syntax. Arrays are formatted naturally:
- `["a"]` → "a"
- `["a", "b"]` → "a and b"
- `["a", "b", "c"]` → "a, b, and c"

#### 2. Direct Value Mode
Provide content directly:

```json
{
  "human": {
    "limit": 2000,
    "value": "Name: Tanner\\nInterests: AI, D&D, photography"
  }
}
```

#### 3. File Reference Mode
Load content from an external file:

```json
{
  "persona": {
    "limit": 2000,
    "file": "/path/to/custom/persona.txt"
  }
}
```

## Available MCP Tools

### Agent Interaction Tools

**`letta_chat`** - Send a message to the agent
```typescript
{
  message: string  // Message to send
}
```

**`letta_get_memory`** - Retrieve core memory blocks
```typescript
{}  // No parameters
```

**`letta_update_memory`** - Update a specific memory block
```typescript
{
  block_name: string,  // e.g., "identity", "relationship_context"
  content: string      // New content
}
```

**`letta_search_archival`** - Search long-term memory
```typescript
{
  query: string,  // Search query
  page?: number   // Page number (default: 0)
}
```

**`letta_insert_archival`** - Add to archival memory
```typescript
{
  content: string  // Content with tags (e.g., "Text #tag1 #tag2")
}
```

**`letta_get_messages`** - Get conversation history
```typescript
{
  limit?: number  // Number of messages (default: 50)
}
```

**`letta_get_agent_info`** - Get agent metadata
```typescript
{}  // No parameters
```

### Custom Agent Self-Management Tools

These tools are available TO the Letta agent for managing its own memory:

**`reflect_and_commit_memory`** - Reflect and commit insights
```typescript
{
  reflection: string,                    // Reflection with tags
  memory_block_updates?: {               // Optional core block updates
    identity?: string,
    relationship_context?: string
  }
}
```

**`quick_memory_note`** - Store factual notes quickly
```typescript
{
  note: string  // Factual note with tags
}
```

**`update_identity`** - Update identity block with reflection
```typescript
{
  updated_identity: string,  // New identity content
  reflection: string         // Why it changed
}
```

**`update_relationship`** - Update relationship context with reflection
```typescript
{
  updated_relationship: string,  // New relationship content
  reflection: string             // What changed relationally
}
```

## Memory Tags

Tags help agents retrieve relevant memories. Use `#tag` format in archival content.

### Identity Tags
- `#identity-realization` - Moments of self-discovery
- `#growth-moment` - Times of evolution
- `#personality-trait` - Character aspects
- `#communication-pattern` - Interaction styles

### Relationship Tags
- `#relationship-milestone` - Significant moments
- `#emotional-shift` - Changes in emotional tone
- `#inside-reference` - Shared jokes/terminology
- `#vulnerability-exchange` - Moments of openness
- `#trust-moment` - Trust building/deepening

### General Tags
- `#recurring-topic` - Repeated themes
- `#user-fact` - Important user information
- `#user-emotion` - Emotional context
- `#important-preference` - User preferences

## Templates

### Creating Custom Templates

Templates use simple `{{variable}}` substitution:

**Example: `templates/memory_blocks/custom_persona.txt`**
```
You are {{agent_name}}, with these traits: {{core_traits}}.

Your purpose: {{purpose}}

Communication style: {{style}}
```

**Usage:**
```json
{
  "persona": {
    "limit": 2000,
    "template": "custom_persona",
    "customizations": {
      "agent_name": "Alex",
      "core_traits": ["analytical", "empathetic"],
      "purpose": "Technical mentorship",
      "style": "Socratic questioning"
    }
  }
}
```

### Built-in Templates

**Memory Blocks:**
- `identity_default` - Default identity structure
- `relationship_default` - Relationship tracking template
- `persona_conversational` - Conversational companion persona
- `human_default` - Basic human context template

**System Prompts:**
- `conversational_companion` - Comprehensive memory-focused agent prompt

## Agent Lifecycle

### 1. Configuration
Define agent in `configs/agents.json`:

```json
{
  "agents": {
    "agent-uuid": {
      "name": "AgentName",
      "enabled": true,
      "modules": {
        "letta": {
          "server": { "base_url": "http://localhost:8283" },
          "letta_agent_config": { /* ... */ }
        }
      }
    }
  }
}
```

### 2. Initialization
On service init:
1. Connect to Letta server
2. Check if agent exists (by stored Letta agent ID)
3. If not, create new agent with rendered templates
4. Save Letta agent ID to Ampelos state

### 3. Operation
- Agent persists across Ampelos restarts
- Memory maintained in Letta server
- State (Letta agent ID) persisted in Ampelos database

### 4. Hot-Reload
- Server config changes → reconnect
- Agent config changes → requires restart (agents not modified in-place)

## Usage Examples

### Basic Chat

```typescript
// Via MCP tool
const result = await letta_chat({
  message: "Tell me about our previous conversations"
});
```

### Memory Management

```typescript
// Get current memory
const memory = await letta_get_memory({});

// Update identity after growth
await letta_update_memory({
  block_name: "identity",
  content: "Updated identity reflecting new understanding..."
});

// Search for relationship moments
const results = await letta_search_archival({
  query: "relationship-milestone",
  page: 0
});
```

### Agent Self-Reflection

From within a Letta agent:

```typescript
// After a significant conversation
await reflect_and_commit_memory({
  reflection: "User shared their fear of AI replacing creative work. Important vulnerability moment. #vulnerability-exchange #user-emotion #trust-moment",
  memory_block_updates: {
    relationship_context: "Updated relationship context acknowledging deeper trust..."
  }
});
```

## Design Principles

1. **Agent Autonomy**: Agents self-manage memory; we guide, not enforce
2. **Letta-Native**: Use built-in tools, work with the framework
3. **Emotional Prioritization**: Remember what matters relationally, not just factually
4. **Template Flexibility**: Easy customization per-agent
5. **Clear Separation**: Agent ID (data key) vs Agent Name (display)

## Integration with Ampelos

### Service Pattern
- Implements `BaseService` interface
- Per-agent state isolation
- Scoped database access
- Dependency injection via `ServiceContext`

### Tool Pattern
- Standard MCP tool interface
- Access service via `ToolContext`
- Error handling with `isError` flag
- Text-based responses

### Module Discovery
- Automatic discovery via `ModuleLoader`
- Manifest-based configuration
- Schema validation with Zod
- Hot-reload support

## Development

### Adding New Templates

1. Create template file in `templates/memory_blocks/` or `templates/system_prompts/`
2. Use `{{variable}}` for substitution
3. Reference by name (without `.txt` extension) in config

### Adding New Tools

1. Define in `tool.ts` (interaction tools) or `custom-tools.ts` (agent tools)
2. Follow `ToolDefinition` interface
3. Access service via context: `context.getService<LettaService>('letta')`
4. Return `ToolResult` with proper error handling

### Extending Memory Strategy

Customize system prompts and persona templates to guide memory behavior:
- When to commit memories
- How to tag content
- Memory taxonomy
- Reflection triggers

## Troubleshooting

### Agent Not Created
- Check Letta server is running at configured URL
- Verify model and embedding names are correct
- Check logs for template rendering errors
- Ensure all required memory blocks are configured

### Memory Not Persisting
- Verify Letta server has persistent storage
- Check agent hasn't been deleted from Letta
- Ensure Ampelos state database is writable

### Templates Not Found
- Verify template files exist in `templates/` directory
- Check template names match (case-sensitive, no `.txt` extension in config)
- Ensure files are readable

### Connection Errors
- Verify Letta server URL is accessible
- Check authentication token if required
- Review firewall/network settings

## Future Enhancements (Phase 2)

- External enforcement checking
- Periodic memory nudge system
- Memory analytics and insights
- Template inheritance
- CLI for agent creation
- Memory export/import
- Multi-agent memory sharing

## References

- [Letta Documentation](https://docs.letta.com)
- [Ampelos Design Doc](../../docs/design.md)
- [MCP Protocol](https://modelcontextprotocol.io)
