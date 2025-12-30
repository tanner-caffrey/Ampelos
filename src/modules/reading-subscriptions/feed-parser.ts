/**
 * Feed Parser
 *
 * Handles parsing of RSS and Atom feeds using the rss-parser library.
 * Provides automatic feed type detection and normalized post output.
 */

import Parser from 'rss-parser';
import type { DiscoveredPost, ParsedFeed, DetectedType } from './types.js';

// Configure rss-parser with custom fields we want to extract
const parser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['dc:creator', 'dcCreator'],
      ['author', 'author'],
    ],
  },
});

/**
 * Attempt to detect if a URL points to an RSS/Atom feed
 * Returns null if the URL doesn't appear to be a feed
 */
export async function detectFeedType(url: string): Promise<DetectedType | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        'User-Agent': 'Ampelos/1.0 (Reading Subscriptions)',
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    // Check content type header
    if (contentType.includes('rss') || contentType.includes('xml')) {
      // Parse the text to determine if it's RSS or Atom
      if (text.includes('<feed') && text.includes('xmlns="http://www.w3.org/2005/Atom"')) {
        return 'atom';
      }
      if (text.includes('<rss') || text.includes('<channel>')) {
        return 'rss';
      }
      // Generic XML that might be a feed
      if (text.includes('<item>') || text.includes('<entry>')) {
        return text.includes('<entry>') ? 'atom' : 'rss';
      }
    }

    // Check for feed content even without proper content type
    if (text.includes('<feed') || text.includes('<rss') || text.includes('<channel>')) {
      if (text.includes('<feed')) {
        return 'atom';
      }
      return 'rss';
    }

    return null;
  } catch (error) {
    // Network error or other issue
    return null;
  }
}

/**
 * Try to find a feed URL from an HTML page
 * Looks for link tags with type="application/rss+xml" or type="application/atom+xml"
 */
export async function discoverFeedUrl(pageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(pageUrl, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Ampelos/1.0 (Reading Subscriptions)',
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    // Look for RSS/Atom link tags
    // Pattern: <link rel="alternate" type="application/rss+xml" href="...">
    const rssMatch = html.match(/<link[^>]*type=["']application\/rss\+xml["'][^>]*href=["']([^"']+)["']/i);
    if (rssMatch) {
      return resolveUrl(pageUrl, rssMatch[1]);
    }

    const atomMatch = html.match(/<link[^>]*type=["']application\/atom\+xml["'][^>]*href=["']([^"']+)["']/i);
    if (atomMatch) {
      return resolveUrl(pageUrl, atomMatch[1]);
    }

    // Also check href before type (different order)
    const rssMatch2 = html.match(/<link[^>]*href=["']([^"']+)["'][^>]*type=["']application\/rss\+xml["']/i);
    if (rssMatch2) {
      return resolveUrl(pageUrl, rssMatch2[1]);
    }

    const atomMatch2 = html.match(/<link[^>]*href=["']([^"']+)["'][^>]*type=["']application\/atom\+xml["']/i);
    if (atomMatch2) {
      return resolveUrl(pageUrl, atomMatch2[1]);
    }

    // Common feed paths to try
    const baseUrl = new URL(pageUrl);
    const commonPaths = ['/feed', '/feed.xml', '/rss', '/rss.xml', '/atom.xml', '/index.xml'];

    for (const path of commonPaths) {
      const feedUrl = `${baseUrl.origin}${path}`;
      const feedType = await detectFeedType(feedUrl);
      if (feedType) {
        return feedUrl;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Resolve a potentially relative URL against a base URL
 */
function resolveUrl(baseUrl: string, relativeUrl: string): string {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
}

/**
 * Parse a feed URL and return normalized posts
 */
export async function parseFeed(url: string): Promise<ParsedFeed> {
  const feed = await parser.parseURL(url);

  const posts: DiscoveredPost[] = (feed.items || []).map((item) => {
    // Generate a stable ID - prefer guid, fall back to link
    const id = item.guid || item.link || item.title || '';

    // Get author from various possible fields
    const author = item.creator || item.dcCreator || item.author || feed.title || undefined;

    // Get summary/description
    const summary = item.contentSnippet || item.content?.substring(0, 300) || undefined;

    // Parse published date
    let publishedAt: string | undefined;
    if (item.isoDate) {
      publishedAt = item.isoDate;
    } else if (item.pubDate) {
      try {
        publishedAt = new Date(item.pubDate).toISOString();
      } catch {
        // Invalid date, skip
      }
    }

    return {
      id,
      title: item.title || 'Untitled',
      url: item.link || url,
      published_at: publishedAt,
      author,
      summary,
    };
  });

  // Determine feed type based on content
  const isAtom = feed.feedUrl?.includes('atom') || feed.link?.includes('atom');

  return {
    title: feed.title || 'Unknown Feed',
    url: feed.feedUrl || url,
    posts,
    type: isAtom ? 'atom' : 'rss',
  };
}

/**
 * Try to parse a URL as a feed, with automatic discovery
 * Returns null if the URL is not a feed and no feed could be discovered
 */
export async function tryParseFeed(url: string): Promise<ParsedFeed | null> {
  // First, try to parse directly as a feed
  try {
    const result = await parseFeed(url);
    if (result.posts.length > 0) {
      return result;
    }
  } catch {
    // Not a direct feed URL, try discovery
  }

  // Try to discover a feed from the HTML page
  const discoveredUrl = await discoverFeedUrl(url);
  if (discoveredUrl) {
    try {
      return await parseFeed(discoveredUrl);
    } catch {
      // Discovered URL wasn't a valid feed
    }
  }

  return null;
}
