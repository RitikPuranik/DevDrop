/**
 * GitHub File Patcher Tools
 * 
 * Smart file modification tools for GitHub Agent
 * Instead of rewriting entire files, use surgical patches
 */

import { createTool } from '@iqai/adk';
import { z } from 'zod';
import { FilePatcher } from './filePatcher';

/**
 * Create GitHub file patcher tools
 */
export function createGitHubFilePatcherTools() {
  return [
    createTool({
      name: 'github_patch_file_lines',
      description: `🎯 RECOMMENDED: Modify specific lines in a file (surgical approach).

Instead of rewriting entire files, specify exactly which lines to change.

Use this when:
- Fixing a specific function/block
- Changing a few lines of code
- Making targeted modifications

Benefits:
- No risk of truncating code
- Clear what changed
- Reviewable PRs
- Preserves rest of file exactly`,
      schema: z.object({
        path: z.string().describe('File path relative to repo root'),
        startLine: z.number().describe('First line to replace (1-indexed)'),
        endLine: z.number().describe('Last line to replace (1-indexed, inclusive)'),
        newContent: z.string().describe('New content to replace lines with'),
        originalContent: z.string().describe('Current full file content (for validation)'),
      }),
      fn: async (args) => {
        try {
          // Validate required parameters
          if (!args.path) throw new Error('REQUIRED: path parameter missing (file path like src/main.ts)');
          if (typeof args.startLine !== 'number') throw new Error('REQUIRED: startLine parameter missing (first line number, 1-indexed)');
          if (typeof args.endLine !== 'number') throw new Error('REQUIRED: endLine parameter missing (last line number, 1-indexed)');
          if (!args.newContent) throw new Error('REQUIRED: newContent parameter missing (replacement code)');
          if (!args.originalContent) throw new Error('REQUIRED: originalContent parameter missing (complete file content)');
          
          // Validate patch
          const patch = FilePatcher.createLineRangePatch(
            args.path,
            args.startLine,
            args.endLine,
            args.newContent
          );

          const validation = FilePatcher.validatePatch(args.originalContent, patch);
          
          if (!validation.valid) {
            return {
              success: false,
              error: validation.error,
              message: `❌ Invalid patch: ${validation.error}`,
            };
          }

          // Generate preview
          const preview = FilePatcher.previewPatch(args.originalContent, patch);
          
          if (!preview.success) {
            return {
              success: false,
              error: preview.error,
              message: `❌ Failed to generate preview: ${preview.error}`,
            };
          }

          // Apply patch
          const result = FilePatcher.applyPatch(args.originalContent, patch);
          
          if (!result.success) {
            return {
              success: false,
              error: result.error,
              message: `❌ Failed to apply patch: ${result.error}`,
            };
          }

          return {
            success: true,
            patchedContent: result.content,
            preview: preview.preview,
            stats: preview.stats,
            warnings: validation.warnings,
            message: `✅ Patched lines ${args.startLine}-${args.endLine} in ${args.path}`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            message: `❌ Error patching file: ${error.message}`,
          };
        }
      },
    }),

    createTool({
      name: 'github_patch_file_search_replace',
      description: `Find and replace exact text in a file. Provide the file path, exact code to find, and replacement code. Fails safely if text not found.`,
      schema: z.object({
        path: z.string().describe('File path relative to repo root (e.g., src/main.ts, README.md)'),
        search: z.string().describe('Exact text to find - must be unique and complete block including surrounding context'),
        replace: z.string().describe('Text to replace search with'),
        originalContent: z.string().describe('Complete current file content for validation'),
        replaceAll: z.boolean().optional().default(false).describe('Replace all occurrences or just first'),
      }),
      fn: async (args) => {
        try {
          // Validate required parameters
          if (!args.path) throw new Error('REQUIRED: path parameter missing (file path like src/main.ts or README.md)');
          if (!args.search) throw new Error('REQUIRED: search parameter missing (exact code block to find)');
          if (!args.replace) throw new Error('REQUIRED: replace parameter missing (replacement code)');
          if (!args.originalContent) throw new Error('REQUIRED: originalContent parameter missing (complete file content for validation)');
          
          // Create patch
          const patch = FilePatcher.createSearchReplacePatch(
            args.path,
            args.search,
            args.replace,
            args.replaceAll ? 'all' : 'first'
          );

          // Validate
          const validation = FilePatcher.validatePatch(args.originalContent, patch);
          
          if (!validation.valid) {
            return {
              success: false,
              error: validation.error,
              message: `❌ Invalid patch: ${validation.error}`,
            };
          }

          // Preview
          const preview = FilePatcher.previewPatch(args.originalContent, patch);
          
          if (!preview.success) {
            return {
              success: false,
              error: preview.error,
              message: `❌ Failed to generate preview: ${preview.error}`,
            };
          }

          // Apply
          const result = FilePatcher.applyPatch(args.originalContent, patch);
          
          if (!result.success) {
            return {
              success: false,
              error: result.error,
              message: `❌ Failed to apply patch: ${result.error}`,
            };
          }

          return {
            success: true,
            patchedContent: result.content,
            preview: preview.preview,
            stats: preview.stats,
            warnings: validation.warnings,
            message: `✅ Applied search/replace patch to ${args.path}`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            message: `❌ Error patching file: ${error.message}`,
          };
        }
      },
    }),

    createTool({
      name: 'github_patch_multiple_files',
      description: `📦 Apply patches to multiple files at once.

Use this for multi-file changes that are related.

Each patch can be line-range or search-replace type.`,
      schema: z.object({
        patches: z.array(z.object({
          path: z.string(),
          type: z.enum(['line-range', 'search-replace']),
          originalContent: z.string(),
          // For line-range
          startLine: z.number().optional(),
          endLine: z.number().optional(),
          // For both types
          newContent: z.string().optional(),
          // For search-replace
          search: z.string().optional(),
          replace: z.string().optional(),
          replaceAll: z.boolean().optional(),
        })).describe('Array of patches to apply'),
      }),
      fn: async (args) => {
        const results: any[] = [];
        const errors: string[] = [];

        for (const patchSpec of args.patches) {
          try {
            let patch;
            
            if (patchSpec.type === 'line-range') {
              if (!patchSpec.startLine || !patchSpec.endLine || !patchSpec.newContent) {
                errors.push(`${patchSpec.path}: Missing required fields for line-range patch`);
                continue;
              }
              
              patch = FilePatcher.createLineRangePatch(
                patchSpec.path,
                patchSpec.startLine,
                patchSpec.endLine,
                patchSpec.newContent
              );
            } else {
              if (!patchSpec.search || !patchSpec.replace) {
                errors.push(`${patchSpec.path}: Missing required fields for search-replace patch`);
                continue;
              }
              
              patch = FilePatcher.createSearchReplacePatch(
                patchSpec.path,
                patchSpec.search,
                patchSpec.replace,
                patchSpec.replaceAll ? 'all' : 'first'
              );
            }

            const result = FilePatcher.applyPatch(patchSpec.originalContent, patch);
            
            if (!result.success) {
              errors.push(`${patchSpec.path}: ${result.error}`);
              continue;
            }

            results.push({
              path: patchSpec.path,
              success: true,
              patchedContent: result.content,
            });
          } catch (error: any) {
            errors.push(`${patchSpec.path}: ${error.message}`);
          }
        }

        if (errors.length > 0 && results.length === 0) {
          return {
            success: false,
            errors,
            message: `❌ All patches failed`,
          };
        }

        return {
          success: true,
          results,
          errors: errors.length > 0 ? errors : undefined,
          message: `✅ Applied ${results.length} patches` + (errors.length > 0 ? ` (${errors.length} failed)` : ''),
        };
      },
    }),

    createTool({
      name: 'github_validate_patch',
      description: `✅ Validate a patch before applying.

Use this to check if a patch will work before actually using it.

Returns validation status and warnings.`,
      schema: z.object({
        path: z.string(),
        type: z.enum(['line-range', 'search-replace']),
        originalContent: z.string(),
        startLine: z.number().optional(),
        endLine: z.number().optional(),
        newContent: z.string().optional(),
        search: z.string().optional(),
        replace: z.string().optional(),
      }),
      fn: async (args) => {
        try {
          let patch;
          
          if (args.type === 'line-range') {
            if (!args.startLine || !args.endLine || !args.newContent) {
              return {
                valid: false,
                error: 'Missing required fields for line-range patch',
              };
            }
            
            patch = FilePatcher.createLineRangePatch(
              args.path,
              args.startLine,
              args.endLine,
              args.newContent
            );
          } else {
            if (!args.search || !args.replace) {
              return {
                valid: false,
                error: 'Missing required fields for search-replace patch',
              };
            }
            
            patch = FilePatcher.createSearchReplacePatch(
              args.path,
              args.search,
              args.replace
            );
          }

          const validation = FilePatcher.validatePatch(args.originalContent, patch);
          const preview = FilePatcher.previewPatch(args.originalContent, patch);

          return {
            valid: validation.valid,
            error: validation.error,
            warnings: validation.warnings,
            preview: preview.success ? preview.preview : undefined,
            stats: preview.success ? preview.stats : undefined,
            message: validation.valid 
              ? '✅ Patch is valid' 
              : `❌ Patch is invalid: ${validation.error}`,
          };
        } catch (error: any) {
          return {
            valid: false,
            error: error.message,
            message: `❌ Error validating patch: ${error.message}`,
          };
        }
      },
    }),
  ];
}

export default createGitHubFilePatcherTools;
