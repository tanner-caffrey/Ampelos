export interface CachedPage {
  url: string;
  title: string;
  content: string;
  fetchedAt: string; // ISO timestamp
}

export interface WebReaderState {
  cache: Record<string, CachedPage>; // keyed by URL
}

export interface WebReaderConfig {
  cache_ttl_minutes: number;
  max_cached_pages: number;
}

export interface JinaReaderResponse {
  code: number;
  status: number;
  data: {
    title: string;
    description: string;
    url: string;
    content: string;
    usage: {
      tokens: number;
    };
  };
}

// Reddit API Types
export interface RedditPost {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  created_utc: number;
  selftext: string; // Post body (for text posts)
  url: string; // Link URL (for link posts)
  permalink: string;
  is_self: boolean; // true = text post, false = link post
  thumbnail: string;
  preview?: {
    images: Array<{
      source: { url: string; width: number; height: number };
    }>;
  };
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  created_utc: number;
  depth: number;
  replies?: RedditComment[];
}

export interface RedditListingResponse {
  kind: string;
  data: {
    children: Array<{
      kind: string;
      data: RedditPost;
    }>;
    after: string | null;
    before: string | null;
  };
}

export interface SubredditResult {
  subreddit: string;
  posts: RedditPost[];
  fetchedAt: string;
}

export interface RedditPostResult {
  post: RedditPost;
  comments: RedditComment[];
  fetchedAt: string;
}
