
import { Router } from 'express';
import { ReviewWorkflow } from '../../workflows/ReviewWorkflow';
import { z } from 'zod';
import { optionalAuth } from '../middleware/supabaseAuth';

const router = Router();

// Validation schema
const reviewRequestSchema = z.object({
  code: z.union([
    z.string(), // Single code string
    z.array(z.union([
      z.string(), // Array of code strings
      z.object({
        path: z.string(),
        content: z.string(),
      })
    ]))
  ]),
  language: z.string().optional(), // Auto-detect from file extensions if not provided
  options: z.object({
    checkSecurity: z.boolean().default(true),
    checkPerformance: z.boolean().default(true),
    checkStyle: z.boolean().default(true),
    checkBugs: z.boolean().default(true),
  }).optional(),
});

/**
 * POST /api/review - Review code with specialized agents
 */
router.post('/review', optionalAuth, async (req, res) => {
  try {
    console.log('[POST /review] Request received');

    // Validate request
    const validatedRequest = reviewRequestSchema.parse(req.body);

    // Normalize code to array format
    let codeArray: any[];
    if (typeof validatedRequest.code === 'string') {
      codeArray = [{ path: 'code.ts', content: validatedRequest.code }];
    } else if (Array.isArray(validatedRequest.code)) {
      codeArray = validatedRequest.code.map((item, index) => {
        if (typeof item === 'string') {
          return { path: `code${index + 1}.ts`, content: item };
        }
        return item;
      });
    } else {
      codeArray = [];
    }
    
    console.log(`[POST /review] Reviewing ${codeArray.length} files`);

    // Run review workflow
    const reviewWorkflow = new ReviewWorkflow();
    const result = await reviewWorkflow.run({
      code: codeArray,
      language: validatedRequest.language,
      options: validatedRequest.options,
    });

    console.log(`[POST /review] Review complete: ${result.findings.length} findings, score: ${result.overallScore}/100`);

    // Return results
    res.json({
      success: true,
      data: {
        ...result,
        metadata: {
          timestamp: new Date().toISOString(),
          filesReviewed: codeArray.length,
          agentsUsed: result.agentsInvolved,
        },
      },
    });
  } catch (error: any) {
    console.error('[POST /review] Error:', error);

    // Handle validation errors
    if (error.name === 'ZodError') {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
      return;
    }

    // Handle other errors
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to review code',
    });
  }
});

export default router;
