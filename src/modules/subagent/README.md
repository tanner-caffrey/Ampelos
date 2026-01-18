# Subagent Module

Spawn and manage sub-agents from Letta templates with shared memory blocks. Enables agents to delegate tasks to specialized sub-agents that can work autonomously.

## Features

- **Template-Based Spawning**: Create sub-agents from Letta templates
- **Shared Memory Blocks**: Memory blocks sync between parent and sub-agents
- **Bidirectional Messaging**: Parent and sub-agents can message each other
- **Lifecycle Management**: Choose ephemeral (auto-cleanup) or persistent sub-agents
- **Sync/Async Modes**: Wait for results or let sub-agents work in the background

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max_subagents` | number | 10 | Maximum concurrent sub-agents per parent (0 = unlimited) |
| `default_lifecycle` | string | "ephemeral" | Default lifecycle: "ephemeral" or "persistent" |
| `sync_timeout_seconds` | number | 300 | Timeout for synchronous spawn operations |
| `abandoned_timeout_hours` | number | 24 | Auto-cleanup abandoned sub-agents after this duration |

## Example Configuration

```json
{
  "subagent": {
    "max_subagents": 5,
    "default_lifecycle": "ephemeral",
    "sync_timeout_seconds": 600,
    "abandoned_timeout_hours": 48
  }
}
```

## Tools Provided

The module exposes a single `subagent` tool with action-based dispatch:

### Actions

#### `spawn` - Create a Sub-Agent

```json
{
  "action": "spawn",
  "template_version": "researcher_v1",
  "task": "Research the history of quantum computing",
  "wait_for_result": false,
  "shared_blocks": ["context"],
  "lifecycle": "ephemeral"
}
```

Parameters:
- `template_version` (required): Letta template version ID
- `task` (required): Task description for the sub-agent
- `wait_for_result`: If true, wait for task completion (sync mode)
- `shared_blocks`: Memory block labels to share with sub-agent
- `lifecycle`: "ephemeral" (deleted after task) or "persistent" (reusable)
- `memory_variables`: Additional variables to pass to the template

#### `list` - View Sub-Agents

```json
{
  "action": "list",
  "status_filter": "active"
}
```

Parameters:
- `status_filter`: Filter by status - "active", "completed", "failed", "abandoned", or "all"

#### `message` - Send Message to Sub-Agent

```json
{
  "action": "message",
  "subagent_id": "abc123...",
  "message": "What's your progress on the research?",
  "wait_for_reply": true
}
```

Parameters:
- `subagent_id` (required): The sub-agent's ID
- `message` (required): Message to send
- `wait_for_reply`: If true, wait for and return the reply

#### `cleanup` - Delete a Sub-Agent

```json
{
  "action": "cleanup",
  "subagent_id": "abc123..."
}
```

## Shared Memory Blocks

When you specify `shared_blocks`, the sub-agent receives access to those memory blocks from the parent. Changes made by either the parent or sub-agent are synchronized automatically.

Common use cases:
- Share `context` block for task-relevant information
- Share `persona` block for consistent personality
- Share custom blocks for specific data

## Sub-Agent Capabilities

Sub-agents can:
- Work on delegated tasks autonomously
- Access shared memory blocks (changes sync automatically)
- Message the parent agent with updates
- Use any tools available to the parent agent
- Complete tasks and return results

## Lifecycle Modes

### Ephemeral (Default)
- Sub-agent is deleted after completing its task
- Best for one-off tasks
- Automatically cleaned up on completion or failure

### Persistent
- Sub-agent remains available for reuse
- Can be messaged multiple times
- Must be explicitly cleaned up or will timeout after `abandoned_timeout_hours`

## Use Cases

- **Research Tasks**: Spawn a researcher sub-agent to gather information
- **Summarization**: Delegate summarization to a specialized sub-agent
- **Parallel Processing**: Spawn multiple sub-agents for concurrent work
- **Specialized Skills**: Use templates with specific expertise for different tasks
- **Long-Running Tasks**: Let sub-agents work in the background while parent continues

## Example Workflow

```
Parent Agent
    │
    ├─► spawn(template="researcher", task="Find info about X")
    │       │
    │       └─► Sub-agent works autonomously...
    │               │
    │               ├─► Accesses shared memory blocks
    │               ├─► Uses available tools
    │               └─► Completes task, returns result
    │
    ├─► list(status_filter="active") → Check sub-agent status
    │
    ├─► message(id, "Need update?") → Communicate with sub-agent
    │
    └─► cleanup(id) → Delete when done (if persistent)
```
