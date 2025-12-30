/**
 * HTML Scraper
 *
 * Extracts blog posts from HTML pages when no RSS/Atom feed is available.
 * Uses the web-reader service to fetch pages as markdown, then parses
 * for post links using common blog patterns.
 */

import type { DiscoveredPost, ParsedFeed } from './types.js';

/** Interface for the web-reader service's fetchPage method */
interface WebReaderService {
  fetchPage(url: string, forceRefresh?: boolean): Promise<{
    page: { url: string; title: string; content: string; fetchedAt: string };
    fromCache: boolean;
  }>;
}

/**
 * Common patterns for blog post URLs
 */
const POST_URL_PATTERNS = [
  // Date-based patterns: /2024/12/post-title, /2024/12/24/post-title
  /\/\d{4}\/\d{1,2}\/[\w-]+/,
  /\/\d{4}\/\d{1,2}\/\d{1,2}\/[\w-]+/,
  // /blog/post-title, /posts/post-title, /articles/post-title
  /\/(?:blog|posts?|articles?)\/[\w-]+/,
  // /p/post-title (common on some platforms)
  /\/p\/[\w-]+/,
  // AT Protocol blog (whtwnd.com): /[handle]/[rkey]
  /\/[\w.-]+\/[\w]+$/,
];

/**
 * Patterns to exclude (navigation, footer, etc.)
 */
const EXCLUDE_PATTERNS = [
  /\/about\/?$/i,
  /\/contact\/?$/i,
  /\/privacy\/?$/i,
  /\/terms\/?$/i,
  /\/login\/?$/i,
  /\/signup\/?$/i,
  /\/register\/?$/i,
  /\/search\/?$/i,
  /\/tags?\/?$/i,
  /\/categories?\/?$/i,
  /\/archives?\/?$/i,
  /\/#/,
  /\/feed\/?$/i,
  /\/rss\/?$/i,
  /\.xml$/i,
];

/**
 * Extract the base URL (origin) from a full URL
 */
function getBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url;
  }
}

/**
 * Check if a URL looks like a blog post
 */
function looksLikePost(url: string, baseUrl: string): boolean {
  // Must be on the same domain
  if (!url.startsWith(baseUrl) && !url.startsWith('/')) {
    return false;
  }

  // Check against exclude patterns
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(url)) {
      return false;
    }
  }

  // Check against post patterns
  for (const pattern of POST_URL_PATTERNS) {
    if (pattern.test(url)) {
      return true;
    }
  }

  return false;
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
 * Extract links from markdown content
 * Markdown links look like: [text](url) or [text](url "title")
 */
function extractMarkdownLinks(content: string): Array<{ text: string; url: string }> {
  const links: Array<{ text: string; url: string }> = [];
  const linkPattern = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    const text = match[1].trim();
    const url = match[2].trim();

    // Skip empty or anchor-only links
    if (!url || url === '#' || url.startsWith('#')) {
      continue;
    }

    // Skip image links (usually ![alt](url))
    if (match[0].startsWith('!')) {
      continue;
    }

    links.push({ text, url });
  }

  return links;
}

/**
 * Try to extract a date from a URL path
 */
function extractDateFromUrl(url: string): Date | null {
  // Pattern: /2024/12/24/ or /2024/12/
  const dateMatch = url.match(/\/(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?/);
  if (dateMatch) {
    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1; // 0-indexed
    const day = dateMatch[3] ? parseInt(dateMatch[3], 10) : 1;

    try {
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch {
      // Invalid date
    }
  }

  return null;
}

/**
 * Clean up a title extracted from a link
 */
function cleanTitle(text: string): string {
  return text
    .replace(/^\s*[-•·]\s*/, '') // Remove leading bullets
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Scrape a web page for blog posts
 */
export async function scrapeHtmlForPosts(
  url: string,
  webReaderService: WebReaderService
): Promise<ParsedFeed> {
  const baseUrl = getBaseUrl(url);

  // Fetch the page via web-reader (Jina API converts to markdown)
  const { page } = await webReaderService.fetchPage(url, false);

  // Extract all links from the markdown content
  const allLinks = extractMarkdownLinks(page.content);

  // Filter to likely blog posts
  const postLinks = allLinks.filter(
    (link) => looksLikePost(link.url, baseUrl) || looksLikePost(resolveUrl(baseUrl, link.url), baseUrl)
  );

  // Deduplicate by resolved URL
  const seen = new Set<string>();
  const uniqueLinks = postLinks.filter((link) => {
    const resolved = resolveUrl(baseUrl, link.url);
    if (seen.has(resolved)) {
      return false;
    }
    seen.add(resolved);
    return true;
  });

  // Convert to DiscoveredPost format
  const posts: DiscoveredPost[] = uniqueLinks.map((link) => {
    const resolvedUrl = resolveUrl(baseUrl, link.url);
    const title = cleanTitle(link.text);
    const dateFromUrl = extractDateFromUrl(resolvedUrl);

    return {
      id: resolvedUrl,
      title: title || 'Untitled',
      url: resolvedUrl,
      published_at: dateFromUrl?.toISOString(),
    };
  });

  // Sort by date (newest first) if dates are available
  posts.sort((a, b) => {
    if (a.published_at && b.published_at) {
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    }
    if (a.published_at) return -1;
    if (b.published_at) return 1;
    return 0;
  });

  return {
    title: page.title || 'Unknown Site',
    url: page.url,
    posts,
    type: 'html',
  };
}

/**
 * Specialized scraper for WhiteWind (AT Protocol blog platform)
 * whtwnd.com/[handle]/[rkey] structure
 */
export async function scrapeWhitewindBlog(
  url: string,
  webReaderService: WebReaderService
): Promise<ParsedFeed> {
  // WhiteWind blogs typically have a feed at /[handle] that lists posts
  // Each post is at /[handle]/[rkey]

  const baseUrl = getBaseUrl(url);
  const { page } = await webReaderService.fetchPage(url, false);

  // Extract links that look like WhiteWind posts
  const allLinks = extractMarkdownLinks(page.content);

  // WhiteWind post URLs: /handle/rkey (alphanumeric rkey)
  const postPattern = /^\/[\w.-]+\/[\w]+$/;
  const postLinks = allLinks.filter((link) => {
    try {
      const parsed = new URL(link.url, baseUrl);
      const path = parsed.pathname;
      return postPattern.test(path) && !EXCLUDE_PATTERNS.some((p) => p.test(path));
    } catch {
      return false;
    }
  });

  // Deduplicate
  const seen = new Set<string>();
  const uniquePosts = postLinks.filter((link) => {
    const resolved = resolveUrl(baseUrl, link.url);
    if (seen.has(resolved)) return false;
    seen.add(resolved);
    return true;
  });

  const posts: DiscoveredPost[] = uniquePosts.map((link) => ({
    id: resolveUrl(baseUrl, link.url),
    title: cleanTitle(link.text) || 'Untitled',
    url: resolveUrl(baseUrl, link.url),
  }));

  return {
    title: page.title || 'WhiteWind Blog',
    url: page.url,
    posts,
    type: 'html',
  };
}
