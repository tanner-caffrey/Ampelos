import type { ToolDefinition } from '../../types/tool.js';
import type WebReaderService from './service.js';
import type VisionService from '../vision/service.js';

export const webReadTool: ToolDefinition = {
  name: 'web_read',
  description:
    'Fetch a web page and return its content as clean, readable markdown. ' +
    'Results are cached to avoid redundant fetches. ' +
    'Use this to read articles, documentation, or any web content.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch (e.g., "https://example.com" or "example.com")',
      },
      force_refresh: {
        type: 'boolean',
        description: 'Bypass cache and fetch fresh content (default: false)',
      },
    },
    required: ['url'],
  },
  handler: async (params, context) => {
    const url = params.url as string;
    const forceRefresh = (params.force_refresh as boolean) ?? false;

    if (!url || typeof url !== 'string') {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: url parameter is required' }],
      };
    }

    try {
      const service = context.getService('web-reader') as WebReaderService;
      const { page, fromCache } = await service.fetchPage(url, forceRefresh);

      const cacheNote = fromCache ? '(from cache)' : '(freshly fetched)';

      return {
        content: [
          {
            type: 'text',
            text: `# ${page.title}\n\n**URL:** ${page.url}\n**Status:** ${cacheNote}\n\n---\n\n${page.content}`,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error fetching page: ${(error as Error).message}`,
          },
        ],
      };
    }
  },
};

export const redditBrowseTool: ToolDefinition = {
  name: 'reddit_browse',
  description:
    'Browse Reddit subreddits and read posts with comments. ' +
    'Actions: "subreddit" to list posts, "post" to read a specific post with comments.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['subreddit', 'post'],
        description: 'Action to perform: "subreddit" to browse posts, "post" to read a specific post',
      },
      subreddit: {
        type: 'string',
        description: 'Subreddit name (e.g., "programming" or "r/programming")',
      },
      post_id: {
        type: 'string',
        description: 'Post ID (required for "post" action). Found in post URLs or listing results.',
      },
      sort: {
        type: 'string',
        enum: ['hot', 'new', 'top', 'rising'],
        description: 'Sort order for subreddit browsing (default: "hot")',
      },
      timeframe: {
        type: 'string',
        enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
        description: 'Timeframe for "top" sort (default: "day")',
      },
      limit: {
        type: 'number',
        description: 'Number of posts/comments to fetch (default: 10, max: 25)',
      },
      describe_image: {
        type: 'boolean',
        description: 'If true, generate AI descriptions for image posts (requires vision module, slower)',
      },
    },
    required: ['action', 'subreddit'],
  },
  handler: async (params, context) => {
    const action = params.action as string;
    const subreddit = params.subreddit as string;
    const describeImage = (params.describe_image as boolean) ?? false;

    if (!subreddit) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: subreddit parameter is required' }],
      };
    }

    // Get vision service if image descriptions requested
    let visionService: VisionService | null = null;
    if (describeImage) {
      try {
        visionService = context.getService('vision') as VisionService;
      } catch {
        // Vision module not available - will skip image descriptions
      }
    }

    try {
      const service = context.getService('web-reader') as WebReaderService;

      if (action === 'subreddit') {
        // Browse subreddit posts
        const sort = (params.sort as 'hot' | 'new' | 'top' | 'rising') ?? 'hot';
        const timeframe = (params.timeframe as 'hour' | 'day' | 'week' | 'month' | 'year' | 'all') ?? 'day';
        const limit = Math.min((params.limit as number) ?? 10, 25);

        const result = await service.browseSubreddit(subreddit, { sort, timeframe, limit });

        // Format posts for display
        const lines: string[] = [];
        lines.push(`# r/${result.subreddit} - ${sort}${sort === 'top' ? ` (${timeframe})` : ''}`);
        lines.push('');

        for (const post of result.posts) {
          lines.push(`### ${post.title}`);
          lines.push(`**ID:** ${post.id} | **Score:** ${post.score} | **Comments:** ${post.num_comments} | **Author:** u/${post.author}`);

          if (!post.is_self && post.url) {
            lines.push(`**Link:** ${post.url}`);
          }
          if (post.is_self && post.selftext) {
            // Truncate long text posts
            const preview = post.selftext.length > 200
              ? post.selftext.substring(0, 200) + '...'
              : post.selftext;
            lines.push(`> ${preview.replace(/\n/g, ' ')}`);
          }
          if (post.preview?.images?.[0]?.source) {
            const imgUrl = post.preview.images[0].source.url.replace(/&amp;/g, '&');
            lines.push(`**Image:** ${imgUrl}`);

            // Get AI description if vision service available
            if (visionService) {
              try {
                const description = await visionService.describeImage(
                  context.agentId,
                  imgUrl,
                  'Describe this Reddit post image concisely.'
                );
                lines.push(`**Image Description:** ${description}`);
              } catch (err) {
                lines.push(`**Image Description:** (failed: ${(err as Error).message})`);
              }
            }
          }
          lines.push('');
        }

        lines.push(`---`);
        lines.push(`*Use action "post" with post_id to read full post and comments*`);
        if (describeImage && !visionService) {
          lines.push(`*Note: describe_image was requested but vision module is not enabled for this agent*`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };

      } else if (action === 'post') {
        // Read specific post with comments
        const postId = params.post_id as string;
        if (!postId) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: post_id is required for "post" action' }],
          };
        }

        const limit = Math.min((params.limit as number) ?? 15, 25);
        const result = await service.getRedditPost(subreddit, postId, { commentLimit: limit });

        // Format output
        const postFormatted = service.formatRedditPost(result.post);
        const commentsFormatted = service.formatRedditComments(result.comments);

        // Add image description if requested and available
        let imageDescription = '';
        if (visionService && result.post.preview?.images?.[0]?.source) {
          const imgUrl = result.post.preview.images[0].source.url.replace(/&amp;/g, '&');
          try {
            const description = await visionService.describeImage(
              context.agentId,
              imgUrl,
              'Describe this Reddit post image in detail.'
            );
            imageDescription = `\n\n**Image Description:**\n${description}`;
          } catch (err) {
            imageDescription = `\n\n**Image Description:** (failed: ${(err as Error).message})`;
          }
        }

        const output = [
          postFormatted,
          imageDescription,
          '',
          '---',
          '## Comments',
          '',
          commentsFormatted || '*No comments yet*',
        ].join('\n');

        return {
          content: [{ type: 'text', text: output }],
        };

      } else {
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown action: ${action}. Use "subreddit" or "post".` }],
        };
      }
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Reddit error: ${(error as Error).message}` }],
      };
    }
  },
};

export const tools: ToolDefinition[] = [webReadTool, redditBrowseTool];
