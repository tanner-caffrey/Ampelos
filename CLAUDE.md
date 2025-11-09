# Ampelos - Letta Agent Framework

A modular MCP (Model Context Protocol) service framework for building Letta AI agents with persistent memory and continuous identity.

## Overview

Ampelos provides a clean, modular architecture for creating stateful Letta agents that:

- **Maintain continuous identity** across conversations
- **Self-manage memory** using Letta's built-in tools
- **Build deep relationships** through persistent memory
- **Scale per-agent** with complete state isolation

## Key Architecture Decisions

### 1. Built-in Memory Tools (Not Custom)

**Letta agents come with memory management tools pre-installed:**
- `archival_memory_search` / `archival_memory_insert` - Long-term memory
- `conversation_search` - Recent conversation history
- Core memory editing tools - Update identity, persona, etc.
- `send_message` - Generate responses to users

**We removed custom memory tools** because they were redundant. The system prompt guides agents on when and how to use their built-in tools.

### 2. Official Letta SDK (@letta-ai/letta-client)

**Correct SDK usage:**
```typescript
import { LettaClient, Letta } from '@letta-ai/letta-client';

// Create agent
const agent = await client.agents.create({
  name: "AgentName",
  model: "anthropic/claude-3-5-sonnet-20241022",
  embedding: "openai/text-embedding-3-small",
  memoryBlocks: [
    { label: "identity", value: "...", limit: 3000 },
    { label: "persona", value: "...", limit: 2000 }
  ]
});

// Send message
const response = await client.agents.messages.create(agentId, {
  messages: [{ role: 'user', content: 'Hello!' }]
});

// Update memory
await client.agents.blocks.modify(agentId, "identity", {
  value: "Updated identity..."
});
```

### 3. MCP Tools for External Interaction

Ampelos exposes **MCP tools for external systems** (like Claude Desktop) to interact with agents:

- `letta_chat` - Send messages to agent
- `letta_get_memory` - View core memory blocks
- `letta_update_memory` - Update memory blocks externally
- `letta_get_messages` - Get conversation history
- `letta_get_agent_info` - Get agent metadata

**These are not for the agent to use** - they're for external systems to interact with the agent.

### 4. Template-Based Agent Configuration

Agents are configured via JSON with three memory block modes:

**Template Mode** (with variable substitution):
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

**Direct Value Mode**:
```json
{
  "human": {
    "limit": 2000,
    "value": "Name: Tanner\nInterests: AI, D&D, photography"
  }
}
```

**File Reference Mode**:
```json
{
  "persona": {
    "limit": 2000,
    "file": "/path/to/custom-persona.txt"
  }
}
```

## Module Structure

```
src/modules/letta/
├── service.ts              # Agent lifecycle management
├── client.ts               # Letta SDK wrapper
├── tool.ts                 # MCP tools for external interaction
├── manifest.json           # Module metadata & config schema
├── templates/
│   ├── memory_blocks/      # Memory block templates
│   │   ├── identity_default.txt
│   │   ├── relationship_default.txt
│   │   ├── persona_conversational.txt
│   │   └── human_default.txt
│   └── system_prompts/
│       └── conversational_companion.txt
└── utils/
    ├── template-engine.ts  # {{variable}} substitution
    ├── memory-builder.ts   # Config → memory blocks
    └── config-validator.ts # Zod schemas
```

## Agent Lifecycle

1. **Configuration** - Define agent in `configs/agents.json`
2. **Initialization** - Service connects to Letta server
3. **Agent Creation** - If agent doesn't exist, create with templates
4. **State Persistence** - Letta agent ID stored in Ampelos DB
5. **Operation** - Agent maintains memory across restarts

## Memory Philosophy

### Three-Tier Memory System

1. **Core Memory Blocks** (always loaded)
   - `identity` - Agent's sense of self
   - `relationship_context` - Relationship with user
   - `persona` - Communication style & memory philosophy
   - `human` - User facts

2. **Archival Memory** (searchable long-term)
   - Tagged memories with semantic retrieval
   - Identity realizations, relationship milestones
   - Important facts and emotional moments

3. **Recall Memory** (recent context)
   - Managed automatically by Letta
   - Searchable via `conversation_search`

### Memory Tags

Agents tag archival memories for retrieval:

**Identity:** `#identity-realization` `#growth-moment` `#personality-trait`
**Relationship:** `#relationship-milestone` `#emotional-shift` `#trust-moment`
**General:** `#recurring-topic` `#user-fact` `#user-emotion`

## System Prompt Design

The `conversational_companion` template guides agents to:

1. **Remember reflexively** - After emotional moments, not on a schedule
2. **Use memory tools naturally** - Search when uncertain, insert when significant
3. **Maintain continuity** - Memory is essence, not overhead
4. **Tag appropriately** - Use taxonomy for effective retrieval

## Integration with Ampelos

### BaseService Implementation

```typescript
class LettaService implements BaseService {
  async init(agentId, config, context) {
    // Initialize Letta client
    // Restore state from DB
    // Ensure Letta agent exists
  }

  async getState() {
    // Return { letta_agent_id, agent_info, ... }
  }

  async setState(state) {
    // Restore from persisted state
  }
}
```

### Per-Agent State Isolation

Each Ampelos agent gets:
- Its own Letta agent instance
- Isolated state in database: `states.{agentId}.letta`
- Independent memory and configuration

### Configuration Schema

Validated with Zod:
- Server connection (URL, token)
- Agent config (model, embedding, memory blocks)
- Memory block validation (one of: template/value/file)

## Quick Start

1. **Start Letta server**: `letta server` (port 8283)
2. **Configure agent** in `configs/agents.json`
3. **Start Ampelos**: `npm run dev`
4. **Interact via MCP tools** from Claude Desktop or other client

See [LETTA_QUICKSTART.md](LETTA_QUICKSTART.md) for detailed setup.

## Common Patterns

### Viewing Agent Memory

```typescript
// External system checks agent's memory
const memory = await letta_get_memory({});
// Returns: { identity: "...", persona: "...", human: "..." }
```

### Agent Autonomously Manages Memory

The agent uses its **built-in tools** based on system prompt:

```
After emotional conversation:
→ Agent calls archival_memory_insert()
→ Content: "User shared vulnerability about career change #vulnerability-exchange #trust-moment"
→ Updates relationship_context core block
```

### Template Customization

Create custom persona in `templates/memory_blocks/custom_persona.txt`:
```
You are {{agent_name}}, a {{role}}.

Core traits: {{core_traits}}
Mission: {{mission}}
```

Reference in config:
```json
{
  "persona": {
    "template": "custom_persona",
    "customizations": {
      "agent_name": "Mentor",
      "role": "technical guide",
      "core_traits": ["patient", "analytical"],
      "mission": "Help developers learn through Socratic questioning"
    }
  }
}
```

## Design Principles

1. **Agent Autonomy** - Self-managed memory, not enforced externally
2. **Letta-Native** - Use built-in tools, don't recreate them
3. **Emotional Prioritization** - Remember what matters relationally
4. **Template Flexibility** - Easy per-agent customization
5. **Per-Agent Isolation** - Complete state separation

## API Correctness

**Key SDK Methods:**
- `agents.create()` - Create agent (not createAgent)
- `agents.retrieve()` - Get agent (not get)
- `agents.blocks.modify()` - Update memory block (not update)
- `agents.messages.create()` - Send message (not sendMessage)
- `agents.blocks.list()` - Get all blocks

**Type Imports:**
```typescript
import { LettaClient, Letta } from '@letta-ai/letta-client';

// Use Letta.LettaRequest, Letta.LettaMessageUnion, etc.
```

## Future Enhancements

**Phase 2 (Planned):**
- Memory analytics dashboard
- Template inheritance (base + overrides)
- CLI for agent management
- Memory export/import
- Multi-agent memory sharing
- External enforcement checking

## Documentation

- **Quick Start**: [LETTA_QUICKSTART.md](LETTA_QUICKSTART.md)
- **Full Docs**: [src/modules/letta/README.md](src/modules/letta/README.md)
- **Examples**: [configs/agents.letta-example.json](configs/agents.letta-example.json)
- **Ampelos Design**: [docs/design.md](docs/design.md)

## Key Files

- `service.ts` - Agent lifecycle & Ampelos integration
- `client.ts` - Letta SDK wrapper with correct API calls
- `tool.ts` - MCP tools (external interaction only)
- `templates/system_prompts/conversational_companion.txt` - Memory guidance
- `templates/memory_blocks/*.txt` - Default memory structures
- `utils/template-engine.ts` - {{variable}} substitution

## Testing

```bash
# Type check
npm run type-check

# Build
npm run build

# Run
npm run dev
```

## Commits

Three key commits implemented this:

1. **feat: Add Letta Agent Framework module** - Initial implementation
2. **fix: Update Letta module to use official SDK** - Correct SDK usage
3. **fix: Correct Letta SDK API method calls** - Fix all API methods
4. **doc: Update Letta documentation** - Clarify built-in vs MCP tools

## Summary

Ampelos + Letta = **Conversational agents with genuine memory and continuous identity**, built on:

- Official Letta SDK (correct API usage)
- Built-in memory tools (not custom implementations)
- Template-based configuration (easy customization)
- MCP tools for external interaction (not for agents)
- Per-agent state isolation (scalable architecture)

The result: Agents that authentically remember, grow, and build relationships across conversations.
