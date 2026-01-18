# Vision Module

Image description via a shared Letta vision agent. Provides image understanding capabilities to agents that may not have vision themselves and allows tool calls to include image descriptions to the agent in responses.

## Features

- **Shared Vision Agent**: Single vision-capable agent serves all agents
- **Image Description**: Get detailed descriptions of images
- **Vision Model Selection**: Configurable vision-capable model
- **Efficient Resource Use**: One vision agent handles all requests

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | 'anthropic/claude-sonnet-4-20250514' | Vision-capable model (OpenRouter format) |

## Example Configuration

```json
{
  "vision": {
    "model": "anthropic/claude-sonnet-4-20250514"
  }
}
```

## How It Works

1. **Vision Agent Creation**: On startup, creates a dedicated Letta agent with vision capabilities
2. **Request Routing**: When an agent needs image description, request goes to vision agent
3. **Description Generation**: Vision agent analyzes the image and returns description
4. **Response Delivery**: Description is returned to the requesting agent

## Supported Image Sources

- **URLs**: Direct links to images
- **Base64**: Base64-encoded image data
- **File Paths**: Local file system paths

## Use Cases

- **Image Understanding**: Describe what's in an image
- **Content Moderation**: Check images for specific content
- **Accessibility**: Generate alt text for images
- **Visual Context**: Help text-only agents understand visual content

## Integration with Other Modules

- **Bluesky**: Describe images attached to posts
- **Web Reader**: Describe images found on web pages
- **Chat Web**: Handle image uploads in chat
