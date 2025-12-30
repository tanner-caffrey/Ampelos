# Chat Web Module

Web-based chat interface for interacting with Ampelos agents. Provides a Progressive Web App (PWA) that can be installed on mobile and desktop devices.

## Features

- **Real-time Chat**: WebSocket-based messaging with agents
- **Multi-Agent Support**: Switch between different agents
- **PWA Support**: Installable on mobile and desktop
- **Offline Caching**: Service worker for offline access
- **Mobile Optimized**: Touch targets and safe area handling
- **REST API**: HTTP endpoints for chat operations

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable the chat web interface |
| `web_port` | integer | 3001 | Port for standalone web server |
| `use_mcp_server` | boolean | true | Use MCP server's HTTP port instead of separate server |

## Example Configuration

```json
{
  "chat-web": {
    "enabled": true,
    "use_mcp_server": true
  }
}
```

## Development

### Build the Frontend

```bash
# Install dependencies and build
npm run web:setup

# Or run in development mode
npm run web:dev
```

### Start with Backend

```bash
# Start server and web frontend together
npm run dev:all
```

## Accessing the Interface

- **Development**: `http://localhost:5173`
- **Production**: Served from MCP server at `http://localhost:3005`

## API Endpoints

The module exposes REST endpoints on the MCP server:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/:agentId/send` | POST | Send a message to an agent |
| `/api/chat/:agentId/messages` | GET | Get conversation history |
| `/api/agents` | GET | List available agents |

## Frontend Structure

The frontend is a React application located in `web/`:

```
web/
├── src/
│   ├── components/     # React components
│   ├── hooks/          # Custom React hooks
│   └── App.tsx         # Main application
├── public/
│   └── manifest.json   # PWA manifest
└── vite.config.ts      # Vite configuration
```
