# Multi-Agent Chat Module

Multi-agent conversation management using Letta Groups. Enables multiple agents to participate in coordinated conversations.

## Features

- **Letta Groups**: Uses Letta's native group chat functionality
- **Manager Types**: Different coordination strategies for agent turns
- **Conversation Routing**: Route messages to appropriate agents
- **Shared Context**: Agents can share conversation context

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `default_manager_type` | string | 'round_robin' | Default coordination strategy |

### Manager Types

- `round_robin` - Agents take turns in order
- `supervisor` - A supervisor agent delegates to others
- `dynamic` - Agents determine turn order dynamically
- `sleeptime` - Agents participate based on sleeptime scheduling

## Example Configuration

```json
{
  "multi-agent-chat": {
    "default_manager_type": "round_robin"
  }
}
```

## How It Works

1. **Group Creation**: Create a Letta Group with multiple agents
2. **Message Routing**: Incoming messages are routed to the group
3. **Turn Management**: The manager type determines which agent responds
4. **Shared Memory**: Agents can access shared conversation context

## Use Cases

- **Collaborative Tasks**: Multiple agents working on the same problem
- **Expert Panels**: Different agents with different expertise areas
- **Roleplay Scenarios**: Multiple characters in a conversation
- **Debate Format**: Agents with different perspectives engaging in discussion
