/**
 * Utility functions for formatting and text processing
 */

/**
 * Parse tool arguments that may be a string (JSON) or already an object
 * Returns undefined if parsing fails or input is empty
 */
export function parseToolArguments(args: unknown): Record<string, unknown> | undefined {
  if (!args) return undefined;

  if (typeof args === 'object' && args !== null) {
    return args as Record<string, unknown>;
  }

  if (typeof args === 'string') {
    // Skip if it looks like incomplete/malformed JSON
    const trimmed = args.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      // Return undefined for malformed JSON rather than displaying garbage
      return undefined;
    }
  }

  return undefined;
}

/**
 * Format an object as pretty-printed JSON for display
 */
export function formatJson(obj: unknown): string {
  if (obj === undefined || obj === null) {
    return '';
  }

  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

/**
 * Get diff parts for memory block highlighting
 * Compares old and new text to find what changed
 */
export function getDiffParts(oldText: string, newText: string) {
  if (!oldText) return { prefix: '', changed: newText, suffix: '' };
  if (!newText) return { prefix: '', changed: '', suffix: '' };

  let prefixLen = 0;
  while (prefixLen < oldText.length && prefixLen < newText.length && oldText[prefixLen] === newText[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (suffixLen < (oldText.length - prefixLen) && suffixLen < (newText.length - prefixLen) &&
         oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]) {
    suffixLen++;
  }

  const prefix = newText.substring(0, prefixLen);
  const changed = newText.substring(prefixLen, newText.length - suffixLen);
  const suffix = newText.substring(newText.length - suffixLen);

  return { prefix, changed, suffix };
}

/**
 * Format a timestamp as relative time (e.g., "5m ago", "2h ago")
 */
export function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
