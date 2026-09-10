/**
 * File Patcher Utility
 * 
 * Provides intelligent file patching capabilities for agents
 * Instead of rewriting entire files, agents can specify exact changes
 * using line numbers, search/replace, or unified diff format
 */

export interface FilePatch {
  path: string;
  type: 'line-range' | 'search-replace' | 'unified-diff';
  changes: LineRangePatch | SearchReplacePatch | UnifiedDiffPatch;
}

export interface LineRangePatch {
  startLine: number; // 1-indexed
  endLine: number; // 1-indexed, inclusive
  newContent: string; // Content to replace lines with
}

export interface SearchReplacePatch {
  search: string; // Exact text to find (must be unique)
  replace: string; // Text to replace with
  occurrences?: 'first' | 'all'; // Default: 'first'
}

export interface UnifiedDiffPatch {
  diff: string; // Standard unified diff format
}

export class FilePatcher {
  /**
   * Apply a patch to file content
   */
  static applyPatch(originalContent: string, patch: FilePatch): {
    success: boolean;
    content?: string;
    error?: string;
  } {
    try {
      switch (patch.type) {
        case 'line-range':
          return this.applyLineRangePatch(originalContent, patch.changes as LineRangePatch);
        case 'search-replace':
          return this.applySearchReplacePatch(originalContent, patch.changes as SearchReplacePatch);
        case 'unified-diff':
          return this.applyUnifiedDiffPatch(originalContent, patch.changes as UnifiedDiffPatch);
        default:
          return { success: false, error: 'Unknown patch type' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Apply line range patch (replace specific lines)
   */
  private static applyLineRangePatch(
    content: string,
    patch: LineRangePatch
  ): { success: boolean; content?: string; error?: string } {
    const lines = content.split('\n');
    const { startLine, endLine, newContent } = patch;

    // Validate line numbers
    if (startLine < 1 || startLine > lines.length) {
      return { 
        success: false, 
        error: `Invalid startLine: ${startLine}. File has ${lines.length} lines.` 
      };
    }

    if (endLine < startLine || endLine > lines.length) {
      return { 
        success: false, 
        error: `Invalid endLine: ${endLine}. Must be between ${startLine} and ${lines.length}.` 
      };
    }

    // Replace lines (convert to 0-indexed)
    const before = lines.slice(0, startLine - 1);
    const newLines = newContent.split('\n');
    const after = lines.slice(endLine);

    const result = [...before, ...newLines, ...after].join('\n');

    return { success: true, content: result };
  }

  /**
   * Apply search/replace patch
   */
  private static applySearchReplacePatch(
    content: string,
    patch: SearchReplacePatch
  ): { success: boolean; content?: string; error?: string } {
    const { search, replace, occurrences = 'first' } = patch;

    // Check if search text exists
    if (!content.includes(search)) {
      return { 
        success: false, 
        error: `Search text not found in file. Make sure the search text is exact.` 
      };
    }

    // Count occurrences
    const count = (content.match(new RegExp(this.escapeRegex(search), 'g')) || []).length;

    if (count > 1 && occurrences === 'first') {
      console.warn(`[FilePatcher] Warning: Search text appears ${count} times. Replacing first occurrence only.`);
    }

    // Apply replacement
    let result: string;
    if (occurrences === 'all') {
      result = content.split(search).join(replace);
    } else {
      result = content.replace(search, replace);
    }

    return { success: true, content: result };
  }

  /**
   * Apply unified diff patch
   */
  private static applyUnifiedDiffPatch(
    _content: string,
    _patch: UnifiedDiffPatch
  ): { success: boolean; content?: string; error?: string } {
    // This would require a full diff parser library
    // For now, return error suggesting to use other patch types
    return {
      success: false,
      error: 'Unified diff not yet implemented. Please use line-range or search-replace patch types.',
    };
  }

  /**
   * Validate a patch before applying
   */
  static validatePatch(
    originalContent: string,
    patch: FilePatch
  ): { valid: boolean; error?: string; warnings?: string[] } {
    const warnings: string[] = [];

    switch (patch.type) {
      case 'line-range': {
        const p = patch.changes as LineRangePatch;
        const lineCount = originalContent.split('\n').length;

        if (p.startLine < 1 || p.startLine > lineCount) {
          return { valid: false, error: `Invalid startLine: ${p.startLine}` };
        }

        if (p.endLine < p.startLine || p.endLine > lineCount) {
          return { valid: false, error: `Invalid endLine: ${p.endLine}` };
        }

        // Warn if replacing many lines
        const replacingLines = p.endLine - p.startLine + 1;
        if (replacingLines > 50) {
          warnings.push(`Replacing ${replacingLines} lines. Consider breaking into smaller patches.`);
        }

        break;
      }

      case 'search-replace': {
        const p = patch.changes as SearchReplacePatch;

        if (!originalContent.includes(p.search)) {
          return { valid: false, error: 'Search text not found' };
        }

        // Count occurrences
        const count = (originalContent.match(new RegExp(this.escapeRegex(p.search), 'g')) || []).length;

        if (count > 1) {
          warnings.push(`Search text appears ${count} times. Will replace ${p.occurrences || 'first'}.`);
        }

        // Warn if search text is very short (might be ambiguous)
        if (p.search.length < 20) {
          warnings.push('Search text is short. Ensure it uniquely identifies the target.');
        }

        break;
      }
    }

    return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  /**
   * Generate a preview of patch changes
   */
  static previewPatch(
    originalContent: string,
    patch: FilePatch
  ): { 
    success: boolean; 
    preview?: string; 
    stats?: { linesAdded: number; linesRemoved: number; linesChanged: number };
    error?: string;
  } {
    const result = this.applyPatch(originalContent, patch);
    
    if (!result.success || !result.content) {
      return { success: false, error: result.error };
    }

    // Generate diff-style preview
    const originalLines = originalContent.split('\n');
    const newLines = result.content.split('\n');

    const preview: string[] = [];
    let linesAdded = 0;
    let linesRemoved = 0;
    let linesChanged = 0;

    // Simple diff (can be improved with proper diff algorithm)
    const maxLines = Math.max(originalLines.length, newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = originalLines[i];
      const newLine = newLines[i];

      if (oldLine === newLine) {
        preview.push(`  ${oldLine || ''}`);
      } else if (oldLine && !newLine) {
        preview.push(`- ${oldLine}`);
        linesRemoved++;
      } else if (!oldLine && newLine) {
        preview.push(`+ ${newLine}`);
        linesAdded++;
      } else {
        preview.push(`- ${oldLine}`);
        preview.push(`+ ${newLine}`);
        linesChanged++;
      }
    }

    return {
      success: true,
      preview: preview.slice(0, 100).join('\n') + (preview.length > 100 ? '\n... (truncated)' : ''),
      stats: { linesAdded, linesRemoved, linesChanged },
    };
  }

  /**
   * Create a line-range patch from line numbers
   */
  static createLineRangePatch(
    path: string,
    startLine: number,
    endLine: number,
    newContent: string
  ): FilePatch {
    return {
      path,
      type: 'line-range',
      changes: { startLine, endLine, newContent },
    };
  }

  /**
   * Create a search-replace patch
   */
  static createSearchReplacePatch(
    path: string,
    search: string,
    replace: string,
    occurrences: 'first' | 'all' = 'first'
  ): FilePatch {
    return {
      path,
      type: 'search-replace',
      changes: { search, replace, occurrences },
    };
  }

  /**
   * Escape special regex characters
   */
  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Apply multiple patches to a file
   */
  static applyPatches(
    originalContent: string,
    patches: FilePatch[]
  ): { success: boolean; content?: string; errors?: string[] } {
    let content = originalContent;
    const errors: string[] = [];

    for (const patch of patches) {
      const result = this.applyPatch(content, patch);
      
      if (!result.success) {
        errors.push(`Patch failed: ${result.error}`);
        continue;
      }

      content = result.content!;
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true, content };
  }
}

export default FilePatcher;
