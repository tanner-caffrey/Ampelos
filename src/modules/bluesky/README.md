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
- `create_post` - Create a new post
- `reply_to_post` - Reply to an existing post
- `quote_post` - Quote-post another post
- `get_post` - Get a specific post by URI
- `like_post` - Like a post
- `repost` - Repost a post

### Feed Actions
- `get_feed` - Get posts from a named feed
- `get_timeline` - Get the agent's home timeline

### DM Actions
- `list_conversations` - List DM conversations
- `get_conversation` - Get messages from a conversation
- `send_dm` - Send a direct message

### Profile Actions
- `get_profile` - Get a user's profile
- `follow` - Follow a user
- `unfollow` - Unfollow a user

### Notification Actions
- `get_notifications` - Get recent notifications

## Safety Features

- **Interaction Allowlist**: Prevents the agent from DMing, replying to, or mentioning users not on the allowlist
- **Rate Limiting**: Built-in rate limit handling for ATProto API
- **Automatic Session Management**: Handles token refresh automatically
