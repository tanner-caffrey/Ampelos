# Embodied Agent Module

Embodied agent architecture with soma processing, body daemon, and periodic reflection. Enables agents to have a sense of physical form with involuntary responses and self-reflection capabilities.

## Features

- **Soma Agent**: Processes involuntary/somatic responses after each interaction
- **Reflection Agent**: Periodic self-reflection sessions
- **Body Daemon**: Background process for state decay and idle handling
- **Shared Memory**: Sub-agents share memory blocks with the primary agent
- **Agent Groups**: Organizes primary + sub-agents in a coordinated group

## Dependencies

This module depends on:
- `body_and_inventory` (embodiment module) - Provides body state management

## Architecture

```
┌─────────────────────────────────────────┐
│           Embodied Agent Group          │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐    ┌──────────────┐   │
│  │   Primary   │    │     Soma     │   │
│  │   Agent     │───►│    Agent     │   │
│  │  (visible)  │    │  (hidden)    │   │
│  └─────────────┘    └──────────────┘   │
│         │                              │
│         │          ┌──────────────┐    │
│         │          │  Reflection  │    │
│         └─────────►│    Agent     │    │
│       (periodic)   │  (hidden)    │    │
│                    └──────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │         Body Daemon              │   │
│  │  (state decay, idle prompts)     │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## Configuration

### Soma Agent

The soma agent processes "involuntary" responses after each chat interaction. It receives the stimulus and response, then can update shared body state.

```json
{
  "soma": {
    "enabled": true,
    "template": "soma-agent",
    "memory_variables": {
      "agent_name": "MyAgent"
    }
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `enabled` | boolean | Enable soma agent processing |
| `template` | string | Letta template version for soma agent |
| `model` | string | LLM model (optional, uses template default) |
| `memory_variables` | object | Variables to pass to template |
| `shared_blocks` | array | Memory blocks to share with soma agent |

### Reflection Agent

The reflection agent runs periodic self-reflection sessions, analyzing the agent's recent experiences and updating long-term patterns.

```json
{
  "reflection": {
    "enabled": true,
    "template": "reflection-agent",
    "interval_minutes": 60,
    "memory_variables": {
      "agent_name": "MyAgent"
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | - | Enable reflection agent |
| `template` | string | - | Letta template version for reflection agent |
| `interval_minutes` | number | 60 | Minutes between reflection sessions |
| `model` | string | - | LLM model (optional) |
| `memory_variables` | object | - | Variables to pass to template |
| `shared_blocks` | array | - | Memory blocks to share |

### Body Daemon

The body daemon runs periodically to handle state decay and idle detection.

```json
{
  "body_daemon": {
    "enabled": true,
    "tick_interval_seconds": 300,
    "idle_threshold_seconds": 3600
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable body daemon |
| `tick_interval_seconds` | number | 300 | Seconds between daemon ticks |
| `idle_threshold_seconds` | number | 3600 | Seconds before agent is considered idle |

### Shared Memory Blocks

Configure which memory blocks are shared between primary and sub-agents:

```json
{
  "shared_blocks": ["body_state"]
}
```

## Example Configuration

```json
{
  "embodied-agent": {
    "soma": {
      "enabled": true,
      "template": "my-project/soma-agent:latest",
      "memory_variables": {
        "agent_name": "Luna"
      }
    },
    "reflection": {
      "enabled": true,
      "template": "my-project/reflection-agent:latest",
      "interval_minutes": 120,
      "memory_variables": {
        "agent_name": "Luna"
      }
    },
    "body_daemon": {
      "enabled": true,
      "tick_interval_seconds": 300,
      "idle_threshold_seconds": 1800
    },
    "shared_blocks": ["body_and_inventory", "somatic_patterns"]
  }
}
```

## How It Works

### Chat Flow with Soma

1. User sends message to primary agent
2. Primary agent processes and responds
3. After response, soma agent receives:
   - The stimulus (user's message)
   - The response (agent's reply)
   - Current body state
4. Soma agent processes involuntary response
5. Any body state changes sync to primary agent

### Periodic Reflection

1. Timer fires at `interval_minutes` intervals
2. Reflection agent receives:
   - Current body state
   - Shared memory blocks
3. Reflection agent analyzes and updates patterns
4. Changes sync back to primary agent

### Body Daemon Ticks

1. Daemon runs every `tick_interval_seconds`
2. Checks for idle state (no activity for `idle_threshold_seconds`)
3. Can trigger state decay rules
4. Can prompt agent for autonomous actions

## Agent Templates

The module uses Letta templates to create soma and reflection agents. Templates define:
- System prompt for the sub-agent role
- Default memory blocks
- Model configuration

Built-in templates are available at:
- `soma-agent` - Default soma processing template
- `reflection-agent` - Default reflection template

Or create custom templates with your own configurations.

## Use Cases

- **Emotional Agents**: Soma processes emotional reactions
- **Embodied Characters**: Full body awareness with state changes
- **Self-Improving Agents**: Reflection enables learning from experiences
- **Autonomous Behavior**: Body daemon can trigger unprompted actions
