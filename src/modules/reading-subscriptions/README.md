# Reading Subscriptions Module

Subscribe to blogs and authors to receive notifications when new content is published. Supports RSS, Atom, and HTML feeds.

## Features

- **Feed Subscriptions**: Subscribe to RSS, Atom, or HTML feeds
- **Auto-Detection**: Automatically detect feed type
- **New Content Alerts**: Notify agents of new posts
- **Configurable Intervals**: Set check frequency per subscription
- **Seen Post Tracking**: Remember which posts have been shown

## Dependencies

This module depends on:
- `web-reader` - For fetching and parsing web content

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `default_interval_minutes` | number | 30 | Default check interval |
| `max_subscriptions` | number | 20 | Maximum subscriptions per agent |
| `max_seen_posts` | number | 100 | Maximum seen post IDs to store |
| `auto_detect` | boolean | true | Auto-detect feed type |

## Example Configuration

```json
{
  "reading-subscriptions": {
    "default_interval_minutes": 60,
    "max_subscriptions": 10,
    "max_seen_posts": 200,
    "auto_detect": true
  }
}
```

## Tools Provided

### Subscription Management
- `subscribe` - Subscribe to a feed
- `unsubscribe` - Remove a subscription
- `list_subscriptions` - List all active subscriptions

### Content Access
- `check_feed` - Check a feed for new content
- `get_latest` - Get the latest posts from a subscription

## Supported Feed Formats

- **RSS 2.0** - Standard RSS feeds
- **Atom** - Atom syndication format
- **HTML** - Parse HTML pages for new content (using web-reader)

## Use Cases

- **News Monitoring**: Track news sources for topics of interest
- **Blog Following**: Follow favorite authors and blogs
- **Content Curation**: Aggregate content from multiple sources
- **Research Alerts**: Stay updated on new publications
