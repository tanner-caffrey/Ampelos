# Letta Agent Framework - Quick Start Guide

This guide will help you get started with the Letta Agent Framework module in Ampelos.

## Prerequisites

1. **Letta Server Running**
   - Install Letta: `pip install letta`
   - Start the server: `letta server`
   - Default URL: `http://localhost:8283`

2. **Node.js 18+** installed

3. **Ampelos Setup**
   ```bash
   npm install
   npm run build
   ```

## Step 1: Configure Your Agent

Create or modify `configs/agents.json`:

```json
{
  "agents": {
    "agent-your-unique-id": {
      "name": "YourAgentName",
      "enabled": true,
      "modules": {
        "letta": {
          "server": {
            "base_url": "http://localhost:8283",
            "token": ""
          },
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
                  "agent_name": "YourAgentName",
                  "core_traits": ["curious", "thoughtful", "helpful"]
                }
              },
              "human": {
                "limit": 2000,
                "value": "Name: Your Name\\nInterests: Your interests here"
              }
            },
            "system_prompt_template": "conversational_companion"
          }
        }
      }
    }
  }
}
```

## Step 2: Start Ampelos

```bash
npm run dev
# or for production:
npm run build && npm start
```

On first run, the Letta module will:
1. Connect to your Letta server
2. Check if an agent exists for this Ampelos agent
3. If not, create a new Letta agent with the configured memory blocks
4. Store the Letta agent ID for future sessions

## Step 3: Interact with Your Agent

### Via MCP Tools

Use any MCP client (like Claude Desktop) to call the tools:

**Chat with the agent:**
```json
{
  "tool": "letta_chat",
  "params": {
    "message": "Hello! Tell me about yourself."
  }
}
```

**View agent memory:**
```json
{
  "tool": "letta_get_memory",
  "params": {}
}
```

**Note:** Agents can search their own archival memory using the built-in `archival_memory_search` tool. The MCP tools above are for external interaction with the agent.

## Configuration Options

### Memory Block Modes

**1. Template Mode** (recommended)
```json
{
  "persona": {
    "limit": 2000,
    "template": "persona_conversational",
    "customizations": {
      "agent_name": "Sam",
      "core_traits": ["curious", "playful"]
    }
  }
}
```

**2. Direct Value Mode**
```json
{
  "human": {
    "limit": 2000,
    "value": "Name: Tanner\\nAge: 30\\nInterests: AI, music"
  }
}
```

**3. File Reference Mode**
```json
{
  "persona": {
    "limit": 2000,
    "file": "/path/to/custom-persona.txt"
  }
}
```

### Available Templates

**Memory Blocks:**
- `identity_default` - Agent identity structure
- `relationship_default` - Relationship tracking
- `persona_conversational` - Conversational companion persona
- `human_default` - Basic human context

**System Prompts:**
- `conversational_companion` - Memory-focused conversational agent

## Available Tools

### Built-in Agent Tools (Letta)

Letta agents automatically have these **built-in tools** for self-managing memory:
- `send_message` - Generate messages to users
- `archival_memory_search` - Search long-term memory
- `archival_memory_insert` - Insert into long-term memory
- `conversation_search` - Search recent conversation history
- Core memory tools - Edit memory blocks (identity, persona, human, etc.)

These are used BY the agent autonomously based on the system prompt guidance.

### MCP Tools (External Interaction)

These Ampelos MCP tools are for **external systems** to interact with agents:
- `letta_chat` - Send messages and get responses
- `letta_get_memory` - View core memory blocks
- `letta_update_memory` - Update a memory block
- `letta_get_messages` - Get conversation history
- `letta_get_agent_info` - Get agent metadata

## Memory Tags

When the agent stores memories, it should tag them:

**Identity:** `#identity-realization` `#growth-moment` `#personality-trait`
**Relationship:** `#relationship-milestone` `#emotional-shift` `#inside-reference` `#trust-moment`
**General:** `#recurring-topic` `#user-fact` `#user-emotion`

Example:
```
"Learned that user prefers direct communication without pleasantries #user-preference #communication-pattern"
```

## Creating Custom Templates

1. Create a new `.txt` file in `src/modules/letta/templates/memory_blocks/`
2. Use `{{variable}}` for substitution
3. Reference by name (without `.txt`) in config

Example `custom_persona.txt`:
```
You are {{agent_name}}.

Your mission: {{mission}}
Your traits: {{traits}}
```

Use it:
```json
{
  "persona": {
    "limit": 2000,
    "template": "custom_persona",
    "customizations": {
      "agent_name": "Helper",
      "mission": "Assist with coding",
      "traits": ["precise", "patient"]
    }
  }
}
```

## Troubleshooting

### "Failed to connect to Letta server"
- Ensure Letta server is running: `letta server`
- Check the URL in config matches your server
- Verify no firewall blocking localhost:8283

### "Agent not created"
- Check Letta server logs for errors
- Verify model names are correct (e.g., `anthropic/claude-3-5-sonnet-20241022`)
- Ensure embedding model is valid (e.g., `openai/text-embedding-3-small`)

### "Template not found"
- Verify template file exists in `src/modules/letta/templates/memory_blocks/`
- Check template name matches (case-sensitive)
- Don't include `.txt` extension in config

### Memory not persisting
- Letta server needs persistent storage
- Check Letta server hasn't been reset
- Verify agent ID stored in Ampelos database

## Next Steps

- Read the full documentation: `src/modules/letta/README.md`
- Explore example configurations: `configs/agents.letta-example.json`
- Customize memory blocks and system prompts for your use case
- Experiment with memory tags and search patterns

## Architecture Overview

```
Ampelos Agent (you configure)
    ↓
Letta Module (manages lifecycle)
    ↓
Letta Server (runs agents)
    ↓
Letta Agent (persistent memory & identity)
```

Each Ampelos agent gets its own Letta agent instance. The Letta agent ID is stored in Ampelos state and persists across restarts.

## Support

For issues or questions:
- Check `src/modules/letta/README.md` for detailed docs
- Review example configs in `configs/agents.letta-example.json`
- Examine template files in `src/modules/letta/templates/`
