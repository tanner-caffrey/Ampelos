# Web Reader Module

Fetch web pages as clean markdown using the Jina Reader API. Converts web content into agent-friendly text.

## Features

- **Clean Extraction**: Removes ads, navigation, and clutter
- **Markdown Output**: Web content converted to readable markdown
- **Caching**: Configurable cache to reduce repeated fetches
- **Page Metadata**: Extracts titles, descriptions, and other metadata

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cache_ttl_minutes` | number | 60 | How long to cache pages (0 = forever) |
| `max_cached_pages` | number | 50 | Maximum pages to cache per agent (0 = unlimited) |

## Example Configuration

```json
{
  "web-reader": {
    "cache_ttl_minutes": 120,
    "max_cached_pages": 100
  }
}
```

## Tools Provided

### Page Fetching
- `read_page` - Fetch and convert a web page to markdown
- `read_page_section` - Fetch a specific section of a page
- `get_page_metadata` - Get page title, description, and metadata

### Cache Management
- `clear_cache` - Clear cached pages
- `list_cached` - List currently cached URLs

## How It Works

1. **URL Request**: Agent requests a web page URL
2. **Jina Reader**: URL is sent to Jina Reader API
3. **Content Extraction**: Main content is extracted, clutter removed
4. **Markdown Conversion**: HTML converted to clean markdown
5. **Caching**: Result cached for future requests
6. **Response**: Markdown returned to agent

## Use Cases

- **Research**: Read articles and documentation
- **News Monitoring**: Fetch and summarize news articles
- **Content Aggregation**: Collect content from multiple sources
- **Link Following**: Explore links shared in conversations

## Dependencies

This module is a dependency for:
- `reading-subscriptions` - Uses web-reader for feed parsing
