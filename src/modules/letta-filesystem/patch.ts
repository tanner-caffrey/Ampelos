/**
 * Unified-diff patch parser and applier for text files.
 *
 * The patch format is a simplified unified diff that supports one or more hunks.
 * Each hunk may optionally start with a line beginning with @@ and then contains
 * lines that begin with one of:
 *
 *   " " (space): context lines that must match the current content
 *   "-": lines to remove (must match exactly)
 *   "+": lines to add
 *
 * Example patch:
 * ```
 * @@
 *  context line that must match
 * -line to remove
 * +line to add
 *  more context
 * ```
 */

export interface PatchHunk {
  /** Context lines before the change (must match) */
  contextBefore: string[];
  /** Lines to remove (must match exactly) */
  removals: string[];
  /** Lines to add */
  additions: string[];
  /** Context lines after the change (must match) */
  contextAfter: string[];
}

export interface PatchResult {
  success: boolean;
  content?: string;
  error?: string;
  /** Details about which context didn't match */
  mismatchDetails?: {
    hunkIndex: number;
    expected: string[];
    found: string[];
    position: 'before' | 'removals' | 'after';
  };
}

/**
 * Normalize a line for matching by converting tabs to spaces.
 * This ensures consistent matching regardless of tab/space usage.
 */
function normalizeLine(line: string): string {
  return line.replace(/\t/g, '  ');
}

/**
 * Parse a unified-diff style patch into hunks.
 *
 * @param patch - The patch string to parse
 * @returns Array of parsed hunks
 */
export function parsePatch(patch: string): PatchHunk[] {
  const lines = patch.split('\n');
  const hunks: PatchHunk[] = [];

  let currentHunk: PatchHunk | null = null;
  let inRemovalsSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines at the start
    if (line === '' && currentHunk === null) {
      continue;
    }

    // Check for hunk separator
    if (line.startsWith('@@')) {
      // Save previous hunk if exists
      if (currentHunk !== null) {
        hunks.push(currentHunk);
      }
      // Start new hunk
      currentHunk = {
        contextBefore: [],
        removals: [],
        additions: [],
        contextAfter: []
      };
      inRemovalsSection = false;
      continue;
    }

    // If no hunk started yet, create one (for patches without @@ header)
    if (currentHunk === null) {
      currentHunk = {
        contextBefore: [],
        removals: [],
        additions: [],
        contextAfter: []
      };
    }

    // Parse line based on prefix
    if (line.startsWith('-')) {
      // Line to remove
      currentHunk.removals.push(line.substring(1));
      inRemovalsSection = true;
    } else if (line.startsWith('+')) {
      // Line to add
      currentHunk.additions.push(line.substring(1));
      inRemovalsSection = true;
    } else if (line.startsWith(' ') || line === '') {
      // Context line (strip the leading space if present)
      const contextLine = line.startsWith(' ') ? line.substring(1) : line;

      // Determine if this is before or after context
      if (!inRemovalsSection && currentHunk.removals.length === 0 && currentHunk.additions.length === 0) {
        // Before the change
        currentHunk.contextBefore.push(contextLine);
      } else {
        // After the change
        currentHunk.contextAfter.push(contextLine);
        inRemovalsSection = false;
      }
    }
  }

  // Don't forget the last hunk
  if (currentHunk !== null) {
    hunks.push(currentHunk);
  }

  return hunks;
}

/**
 * Find the position in content where a hunk should be applied.
 * Uses context lines to locate the correct position.
 *
 * @param contentLines - Array of content lines
 * @param hunk - The hunk to locate
 * @returns The starting line index, or -1 if not found
 */
function findHunkPosition(contentLines: string[], hunk: PatchHunk): number {
  // Build the pattern to search for: contextBefore + removals
  const pattern: string[] = [...hunk.contextBefore, ...hunk.removals];

  if (pattern.length === 0) {
    // No context or removals - this is a pure insertion
    // If there's contextAfter, search for that instead
    if (hunk.contextAfter.length > 0) {
      const normalizedAfter = hunk.contextAfter.map(normalizeLine);
      for (let i = 0; i < contentLines.length; i++) {
        let match = true;
        for (let j = 0; j < normalizedAfter.length && i + j < contentLines.length; j++) {
          if (normalizeLine(contentLines[i + j]) !== normalizedAfter[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          return i; // Insert before the contextAfter
        }
      }
      return -1;
    }
    // No context at all - insert at the beginning
    return 0;
  }

  const normalizedPattern = pattern.map(normalizeLine);

  // Search for the pattern in content
  for (let i = 0; i <= contentLines.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (normalizeLine(contentLines[i + j]) !== normalizedPattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }

  return -1;
}

/**
 * Apply a single hunk to content lines.
 *
 * @param contentLines - Array of content lines (will be modified)
 * @param hunk - The hunk to apply
 * @param hunkIndex - Index of this hunk (for error reporting)
 * @returns Result of the application
 */
function applyHunk(
  contentLines: string[],
  hunk: PatchHunk,
  hunkIndex: number
): PatchResult {
  // Find where to apply this hunk
  const position = findHunkPosition(contentLines, hunk);

  if (position === -1) {
    // Build context for error message
    const expectedContext = [...hunk.contextBefore, ...hunk.removals];
    return {
      success: false,
      error: `Hunk ${hunkIndex + 1} failed: Could not find matching context in file`,
      mismatchDetails: {
        hunkIndex,
        expected: expectedContext,
        found: contentLines.slice(0, Math.min(10, contentLines.length)),
        position: 'before'
      }
    };
  }

  // Verify contextBefore matches
  for (let i = 0; i < hunk.contextBefore.length; i++) {
    if (normalizeLine(contentLines[position + i]) !== normalizeLine(hunk.contextBefore[i])) {
      return {
        success: false,
        error: `Hunk ${hunkIndex + 1} failed: Context before change doesn't match at line ${position + i + 1}`,
        mismatchDetails: {
          hunkIndex,
          expected: [hunk.contextBefore[i]],
          found: [contentLines[position + i]],
          position: 'before'
        }
      };
    }
  }

  // Verify removals match
  const removalsStart = position + hunk.contextBefore.length;
  for (let i = 0; i < hunk.removals.length; i++) {
    if (normalizeLine(contentLines[removalsStart + i]) !== normalizeLine(hunk.removals[i])) {
      return {
        success: false,
        error: `Hunk ${hunkIndex + 1} failed: Line to remove doesn't match at line ${removalsStart + i + 1}. Expected: "${hunk.removals[i]}", Found: "${contentLines[removalsStart + i]}"`,
        mismatchDetails: {
          hunkIndex,
          expected: [hunk.removals[i]],
          found: [contentLines[removalsStart + i]],
          position: 'removals'
        }
      };
    }
  }

  // Verify contextAfter matches (if present and within bounds)
  const afterStart = removalsStart + hunk.removals.length;
  for (let i = 0; i < hunk.contextAfter.length && afterStart + i < contentLines.length; i++) {
    if (normalizeLine(contentLines[afterStart + i]) !== normalizeLine(hunk.contextAfter[i])) {
      return {
        success: false,
        error: `Hunk ${hunkIndex + 1} failed: Context after change doesn't match at line ${afterStart + i + 1}`,
        mismatchDetails: {
          hunkIndex,
          expected: [hunk.contextAfter[i]],
          found: [contentLines[afterStart + i]],
          position: 'after'
        }
      };
    }
  }

  // All checks passed - apply the hunk
  // Remove the old lines (removals) and insert the new lines (additions)
  const deleteCount = hunk.removals.length;
  const insertPosition = position + hunk.contextBefore.length;

  contentLines.splice(insertPosition, deleteCount, ...hunk.additions);

  return { success: true };
}

/**
 * Apply a unified-diff patch to text content.
 *
 * @param content - The original text content
 * @param patch - The patch string to apply
 * @returns Result containing the patched content or error details
 */
export function applyPatch(content: string, patch: string): PatchResult {
  // Parse the patch into hunks
  const hunks = parsePatch(patch);

  if (hunks.length === 0) {
    return {
      success: false,
      error: 'Patch contains no hunks to apply'
    };
  }

  // Split content into lines
  // Preserve trailing newline info
  const hasTrailingNewline = content.endsWith('\n');
  const contentLines = content.split('\n');

  // Remove empty last element if content ends with newline
  if (hasTrailingNewline && contentLines[contentLines.length - 1] === '') {
    contentLines.pop();
  }

  // Apply each hunk in order
  for (let i = 0; i < hunks.length; i++) {
    const result = applyHunk(contentLines, hunks[i], i);
    if (!result.success) {
      return result;
    }
  }

  // Reconstruct content
  let result = contentLines.join('\n');
  if (hasTrailingNewline) {
    result += '\n';
  }

  return {
    success: true,
    content: result
  };
}

/**
 * Validate a patch string without applying it.
 *
 * @param patch - The patch string to validate
 * @returns Object with validity status and any parsing errors
 */
export function validatePatch(patch: string): { valid: boolean; error?: string; hunkCount: number } {
  try {
    const hunks = parsePatch(patch);

    if (hunks.length === 0) {
      return { valid: false, error: 'Patch contains no hunks', hunkCount: 0 };
    }

    // Check each hunk has at least some content
    for (let i = 0; i < hunks.length; i++) {
      const hunk = hunks[i];
      const hasContent =
        hunk.contextBefore.length > 0 ||
        hunk.removals.length > 0 ||
        hunk.additions.length > 0 ||
        hunk.contextAfter.length > 0;

      if (!hasContent) {
        return { valid: false, error: `Hunk ${i + 1} is empty`, hunkCount: hunks.length };
      }
    }

    return { valid: true, hunkCount: hunks.length };
  } catch (error: any) {
    return { valid: false, error: `Parse error: ${error.message}`, hunkCount: 0 };
  }
}
