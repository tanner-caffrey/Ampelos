# Ampelos

A modular MCP (Model Context Protocol) service framework designed to provide stateful, persistent services to Letta AI agents.

## About

Ampelos is named after the Satyr of Greek mythology who was a personification of the grapevine and lover of Dionysus. Like the mythological Ampelos who transformed into the first grapevine, this project aims to orchestrate and transform complex agent workflows into productive outcomes.

## Project Status

🚧 **In Development** - Core framework implemented, ready for module development and testing.

## Overview

Ampelos enables easy addition of tools and services while maintaining per-agent state isolation and data persistence across restarts. It supports:

- **Standalone Tools**: MCP tools with no persistent state (e.g., calculator)
- **Standalone Services**: Background services with no tool interface (e.g., telemetry)
- **Paired Modules**: Tool + Service combination where the tool provides the interface and the service manages state (e.g., inventory system)

## Features

- ✅ Modular architecture with easy module discovery
- ✅ Agent-scoped state isolation
- ✅ Persistent state using LowDB
- ✅ Lazy and eager service initialization
- ✅ Configuration hot-reloading
- ✅ Inter-service dependencies
- ✅ Schema validation with Zod
- ✅ Example modules (calculator, inventory)

## Installation

```bash
npm install
```

## Configuration

1. Create `configs/agents.json` with your agent configurations:

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
        "calculator": {}
      }
    }
  }
}
```

2. (Optional) Create `configs/server.json` for server configuration.

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## Module Development

See `docs/design.md` for detailed architecture and module development guidelines.

## License

TBD
