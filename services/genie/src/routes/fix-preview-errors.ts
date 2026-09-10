/**
 * Fix Preview Errors Route
 * Endpoint for fixing runtime errors detected in the preview
 */

import { Router, Request, Response } from 'express';
import { chatQueue } from '../services/ChatQueue';
import { supabase } from '../storage/SupabaseClient';
import { z } from 'zod';
import { escapeAdkTemplateVariables } from '../utils/adkEscaping';

const router = Router();

// Request validation schema
const fixPreviewErrorsSchema = z.object({
  generationId: z.string().min(1, 'Generation ID is required'),
  currentFiles: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
    })
  ).min(1, 'At least one file is required'),
  errors: z.array(
    z.object({
      type: z.string(),
      message: z.string().optional().default('Unknown error'),
      stack: z.string().optional(),
      file: z.string().optional(),
      line: z.number().optional(),
      column: z.number().optional(),
    })
  ).min(1, 'At least one error is required'),
  language: z.string().min(1, 'Language is required'),
});

/**
 * POST /api/fix-preview-errors
 * Submit preview errors for LLM to fix
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request
    const validation = fixPreviewErrorsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: validation.error.issues,
      });
    }

    const { generationId, currentFiles, errors, language } = validation.data;

    console.log(`[FixPreviewErrors] Received request to fix ${errors.length} error(s) for generation ${generationId}`);

    // Get userId from generation (can be null for anonymous users)
    const { data: generationData, error: genError } = await supabase
      .from('generations')
      .select('user_id')
      .eq('id', generationId)
      .single();
    
    if (genError || !generationData) {
      console.error('[FixPreviewErrors] Failed to get generation:', genError);
      return res.status(404).json({
        success: false,
        error: 'Generation not found',
      });
    }

    // Use a placeholder UUID for anonymous users
    const userId = generationData.user_id || '00000000-0000-0000-0000-000000000000';

    // Format errors for LLM
    const errorReport = formatErrorsForLLM(errors);
    
    // CRITICAL: Escape curly braces in error report to prevent ADK template variable errors
    // Error messages often contain {variable} syntax from code examples
    const escapedErrorReport = escapeAdkTemplateVariables(errorReport);

    // Create a message asking LLM to fix the errors
    const message = `
🔴 PREVIEW ERRORS DETECTED - PLEASE FIX

The preview is showing errors. Please analyze and fix them:

${escapedErrorReport}

INSTRUCTIONS:
1. Read the error messages carefully
2. Identify which files need to be fixed
3. Make the necessary changes to fix ALL errors
4. Return ALL files (both modified and unchanged)
5. Provide a summary of what you fixed

⚠️ CRITICAL: You MUST return ALL ${currentFiles.length} files, not just the modified ones.
    `.trim();

    // Queue the chat request with CodeModification agent explicitly set
    const jobId = `fix-${generationId}-${Date.now()}`;
    
    await chatQueue.enqueue({
      id: jobId,
      generationId,
      message,
      currentFiles,
      language,
      userId, // Use actual user ID from generation
      // 🚨 IMPORTANT: Force routing to CodeModificationAgent
      specialistAgent: 'CodeModification',
      // Pass detailed error context for better fixes (already escaped above)
      errorContext: escapedErrorReport,
    });

    console.log(`[FixPreviewErrors] Job queued: ${jobId}`);

    return res.json({
      success: true,
      data: {
        jobId: jobId,
        status: 'pending',
        message: 'Error fix request queued',
      },
    });
  } catch (error) {
    console.error('[FixPreviewErrors] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/fix-preview-errors/:jobId
 * Get status of error fix job
 */
router.get('/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const job = await chatQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
      });
    }

    return res.json({
      success: true,
      data: {
        status: job.status,
        message: job.result?.summary,
        files: job.result?.files,
        error: job.error,
      },
    });
  } catch (error) {
    console.error('[FixPreviewErrors] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * Format errors for LLM consumption
 */
function formatErrorsForLLM(errors: Array<{
  type: string;
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
}>): string {
  let formatted = '';

  // Group errors by type
  const errorsByType = errors.reduce((acc, error) => {
    if (!acc[error.type]) {
      acc[error.type] = [];
    }
    acc[error.type].push(error);
    return acc;
  }, {} as Record<string, typeof errors>);

  // Format each group
  for (const [type, typeErrors] of Object.entries(errorsByType)) {
    formatted += `\n═══ ${type.toUpperCase()} ERRORS (${typeErrors.length}) ═══\n`;

    typeErrors.forEach((error, index) => {
      formatted += `\n${index + 1}. ${error.message}\n`;

      if (error.file) {
        formatted += `   File: ${error.file}`;
        if (error.line) formatted += `:${error.line}`;
        if (error.column) formatted += `:${error.column}`;
        formatted += '\n';
      }

      if (error.stack) {
        const stackLines = error.stack.split('\n').slice(0, 5);
        formatted += `   Stack:\n`;
        stackLines.forEach(line => {
          formatted += `     ${line}\n`;
        });
      }
    });
  }

  formatted += '\n═══ END OF ERROR REPORT ═══\n';

  return formatted;
}

export default router;
