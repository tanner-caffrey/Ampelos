# Chat Web Module

Web-based chat interface for interacting with Ampelos agents. Provides a Progressive Web App (PWA) that can be installed on mobile and desktop devices.

## Features

- **Real-time Chat**: Server-Sent Events (SSE) for streaming agent responses
- **Multi-Agent Support**: Switch between different agents dynamically
- **PWA Support**: Installable on mobile and desktop with offline caching
- **Push Notifications**: Receive notifications when agents message you
- **Multi-Modal Input**: Send text and images to agents
- **Tool Call Streaming**: Watch tool calls execute in real-time
- **Mobile Optimized**: Responsive design with touch targets and safe area handling
- **Admin Panel**: Built-in admin interface for agent management

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
- **Admin Panel**: `http://localhost:3005/admin`

## API Endpoints

The module exposes REST endpoints on the MCP server:

### Chat Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents/:agentId/messages` | POST | Send a message (supports text + images) |
| `/api/agents/:agentId/messages` | GET | Get conversation history |
| `/api/agents/:agentId/messages/stream` | GET | SSE stream for real-time responses |

### Agent Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents` | GET | List available agents |
| `/api/agents/:agentId` | GET | Get agent details |
| `/api/agents/:agentId/tools` | GET | List agent's available tools |

### Push Notification Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/push/vapid-public-key` | GET | Get VAPID public key for subscription |
| `/api/push/subscribe` | POST | Register push subscription |
| `/api/push/unsubscribe` | POST | Remove push subscription |

## Push Notifications

The module supports PWA push notifications so agents can notify users even when the app is closed.

### Setup

1. **Generate VAPID Keys** (done automatically on first run, or set in `.env`):
   ```env
   VAPID_PUBLIC_KEY=your-public-key
   VAPID_PRIVATE_KEY=your-private-key
   VAPID_SUBJECT=mailto:your-email@example.com
   ```

2. **Enable in Frontend**: Users can enable notifications from the chat interface

3. **Agent Tool**: Agents can send notifications using the `send_notification` tool:
   ```json
   {
     "action": "send_notification",
     "title": "Hello!",
     "body": "I have something to tell you",
     "user_id": "user-123"
   }
   ```

## Multi-Modal Messages

The chat interface supports sending images along with text:

### Request Format

```json
{
  "text": "What's in this image?",
  "images": [
    {
      "type": "base64",
      "data": "base64-encoded-image-data",
      "mimeType": "image/jpeg"
    }
  ]
}
```

Images are processed by the vision module (if available) and passed to the agent.

## Frontend Structure

The frontend is a React application located in `web/`:

```
web/
├── src/
│   ├── components/     # React components
│   │   ├── Chat/       # Chat interface components
│   │   └── Admin/      # Admin panel components
│   ├── admin/          # Admin panel pages
│   ├── hooks/          # Custom React hooks
│   └── App.tsx         # Main application
├── public/
│   ├── manifest.json   # PWA manifest
│   └── sw.js           # Service worker
└── vite.config.ts      # Vite configuration
```

## PWA Features

- **Installable**: Add to home screen on mobile/desktop
- **Offline Support**: Service worker caches static assets
- **Background Sync**: Messages queued when offline
- **Push Notifications**: Receive agent notifications when app is closed

### Cache Invalidation

The service worker version is controlled by `CACHE_VERSION` in `sw.js`. Update this to force cache refresh after deployments.
