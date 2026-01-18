# Bluesky Module

Bluesky/ATProto integration for Ampelos agents with social features including posts, DMs, follows, and notifications.

## Features

- **Social Posting**: Create posts, replies, and quote posts
- **Direct Messages**: Send and receive DMs via ATProto chat
- **Notifications**: Listen for likes, reposts, follows, mentions, and replies
- **Feed Access**: Read custom feeds and the agent's timeline
- **Profile Management**: View and interact with user profiles
- **Interaction Allowlist**: Restrict which accounts the agent can interact with

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `handle` | string | *required* | Bluesky handle (e.g., 'user.bsky.social') |
| `service` | string | 'https://bsky.social' | PDS service URL |
| `feeds` | array | [] | Named feeds the agent can access |
| `notification_listener.enabled` | boolean | true | Enable notification polling |
| `notification_listener.pollIntervalMs` | number | 60000 | Notification poll interval (ms) |
| `notification_listener.notifyTypes` | array | all | Types: like, repost, follow, mention, reply, quote |
| `dm_listener.enabled` | boolean | true | Enable DM polling |
| `dm_listener.pollIntervalMs` | number | 10000 | DM poll interval (ms) |
| `interaction_allowlist.enabled` | boolean | false | Enable interaction restrictions |
| `interaction_allowlist.handles` | array | [] | Handles the agent can interact with |

## Environment Variables

The module reads app passwords from environment variables:

```env
# Format: BLUESKY_<AGENTNAME>_PASSWORD=<app-password>
BLUESKY_MYAGENT_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

Get app passwords from: https://bsky.app/settings/app-passwords

## Example Configuration

```json
{
  "bluesky": {
    "handle": "myagent.bsky.social",
    "feeds": [
      {
        "name": "Following",
        "uri": "at://did:plc:xxx/app.bsky.feed.generator/following"
      }
    ],
    "notification_listener": {
      "enabled": true,
      "pollIntervalMs": 60000,
      "notifyTypes": ["mention", "reply"]
    },
    "dm_listener": {
      "enabled": true,
      "pollIntervalMs": 10000
    },
    "interaction_allowlist": {
      "enabled": true,
      "handles": ["trusted-user.bsky.social"]
    }
  }
}
```

## Tools Provided

The module exposes a single `bluesky` tool with action-based dispatch:

### Post Actions
- `post` - Create a new post with optional images
- `reply` - Reply to an existing post
- `read` - Read posts from various sources:
  - Single post by URI/URL
  - Author's posts by handle
  - Named feed or home timeline
  - **Thread mode**: Pass `thread: true` to read an author's reply chain

### Reading Options
```json
// Read a single post
{ "action": "read", "source": "https://bsky.app/profile/.../post/..." }

// Read with replies
{ "action": "read", "source": "at://...", "replies": 5 }

// Read a thread (follow author's reply chain)
{ "action": "read", "source": "at://...", "thread": true }

// Read author's feed
{ "action": "read", "source": "@username.bsky.social", "limit": 20 }

// Read home timeline
{ "action": "read", "source": "home" }

// Read named feed
{ "action": "read", "source": "Following" }
```

### Search & Discovery
- `search` - Search for posts by keyword
- `profile` - Get a user's profile information
- `followers` - Get a user's followers
- `list_feeds` - List configured named feeds

### Social Actions
- `follow` - Follow a user
- `update_profile` - Update the agent's profile

### DM Actions
- `dm` with sub-actions:
  - `send` - Send a direct message
  - `list_conversations` - List DM conversations
  - `read_conversation` - Read messages from a conversation

### Notification Actions
- `notifications` - Get recent notifications

### Account Actions
- `account` with sub-actions:
  - `status` - Get account status
  - `enable_notifications` - Enable notification polling
  - `disable_notifications` - Disable notification polling

## Safety Features

- **Interaction Allowlist**: Prevents the agent from DMing, replying to, or mentioning users not on the allowlist
- **Rate Limiting**: Built-in rate limit handling for ATProto API
- **Automatic Session Management**: Handles token refresh automatically
