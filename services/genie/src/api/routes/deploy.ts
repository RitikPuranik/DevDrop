import { Router } from 'express';
import { supabase } from '../../storage/SupabaseClient';
import { z } from 'zod';
import { optionalAuth, AuthenticatedRequest } from '../middleware/supabaseAuth';
import { PreviewServiceWithRetry } from '../../services/preview/PreviewServiceWithRetry';
import JobEventEmitter from '../../services/JobEventEmitter';

const router = Router();

// Validation schema for deploy request
const deployRequestSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })).optional(), // Optional - can load from snapshot instead
  platform: z.enum(['fly.io']).default('fly.io'),
});

// POST /deploy - Deploy generated project to fly.io (requires auth)
router.post('/deploy', optionalAuth, async (req, res) => {
  try {
    let userId = (req as AuthenticatedRequest).userId;
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const allowUnauthenticatedDeploy = process.env.ALLOW_UNAUTHENTICATED_DEPLOY === 'true' || isDevelopment;
    
    console.log(`[POST /deploy] Request received. UserId: ${userId || 'NOT AUTHENTICATED'}`);
    
    // Validate request body first
    const validatedRequest = deployRequestSchema.parse(req.body);
    const { projectId, platform } = validatedRequest;
    let files = validatedRequest.files;

    // Try to get generation to extract userId if not authenticated
    let generation: any = null;
    let fetchError: any = null;
    
    try {
      const result = await supabase
        .from('generations')
        .select('id, user_id, status')
        .eq('id', projectId)
        .single();
      
      generation = result.data;
      fetchError = result.error;
      
      // If no userId from auth but we found the generation, use that user_id in dev mode
      if (!userId && generation?.user_id && allowUnauthenticatedDeploy) {
        console.warn(`[POST /deploy] ⚠️ No auth, but using user_id from generation in ${isDevelopment ? 'development' : 'unauthenticated-allowed'} mode`);
        userId = generation.user_id;
      }
    } catch (dbError) {
      console.error(`[POST /deploy] Database query failed:`, dbError);
      fetchError = dbError;
    }
    
    // Check if user is authenticated (or in dev mode with valid generation)
    if (!userId) {
      console.warn('[POST /deploy] No userId found - authentication failed');
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in to deploy projects.',
      });
      return;
    }

    console.log(`[POST /deploy] Deploying project ${projectId} to ${platform} for user ${userId}`);

    // Verify generation exists
    if (fetchError || !generation) {
      console.error(`[POST /deploy] Project not found:`, fetchError);
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    // Verify ownership (skip in dev mode if auth failed but generation exists)
    if (generation.user_id !== userId && !allowUnauthenticatedDeploy) {
      console.warn(`[POST /deploy] Permission denied for user ${userId}`);
      res.status(403).json({
        success: false,
        error: 'You do not have permission to deploy this project',
      });
      return;
    }

    if (generation.status !== 'completed') {
      res.status(400).json({
        success: false,
        error: 'Project must be completed before deployment',
      });
      return;
    }

    // Load files from database if not provided
    if (!files && generation.files) {
      console.log(`[POST /deploy] Using files from database (${generation.files.length} files)`);
      files = generation.files;
    }

    // Verify we have files to deploy
    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No files found to deploy. Project must have files.',
      });
      return;
    }

    // Check if FLY_API_TOKEN is configured
    if (!process.env.FLY_API_TOKEN) {
      console.error('[POST /deploy] FLY_API_TOKEN not configured');
      res.status(500).json({
        success: false,
        error: 'Deployment service not configured. Please contact administrator.',
      });
      return;
    }

    // Update deployment status to 'deploying' with initial progress
    await supabase
      .from('generations')
      .update({
        deployment_status: 'deploying',
        deployment_started_at: new Date().toISOString(),
        deployment_progress: JSON.stringify([{
          step: 'Initializing',
          status: 'running',
          timestamp: new Date().toISOString(),
          message: 'Starting deployment process...'
        }]),
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    // Start deployment in background
    // Return immediately to user, they can poll for status
    deployInBackground(projectId, files!, platform, userId).catch((error) => {
      console.error(`[POST /deploy] Background deployment error:`, error);
    });

    res.json({
      success: true,
      data: {
        projectId,
        deploymentStatus: 'deploying',
        message: 'Deployment started. Check status with GET /deploy/:id',
      },
    });
    return;
  } catch (error: any) {
    console.error('[POST /deploy] Deployment error:', error);
    
    // Handle validation errors
    if (error.name === 'ZodError') {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start deployment',
    });
    return;
  }
});

// Helper function to update deployment progress
async function updateDeploymentProgress(
  projectId: string,
  userId: string,
  step: string,
  status: 'running' | 'completed' | 'failed',
  message?: string
): Promise<void> {
  try {
    // Get current progress
    const { data: generation } = await supabase
      .from('generations')
      .select('deployment_progress')
      .eq('id', projectId)
      .single();

    let progress: any[] = [];
    if (generation?.deployment_progress) {
      try {
        progress = typeof generation.deployment_progress === 'string' 
          ? JSON.parse(generation.deployment_progress)
          : generation.deployment_progress;
      } catch (e) {
        console.warn('Failed to parse existing deployment_progress:', e);
      }
    }

    // Mark previous running step as completed if this is a new step
    if (status === 'running' && progress.length > 0) {
      const lastStep = progress[progress.length - 1];
      if (lastStep.status === 'running') {
        lastStep.status = 'completed';
      }
    }

    // Add new progress step
    progress.push({
      step,
      status,
      timestamp: new Date().toISOString(),
      ...(message && { message })
    });

    // Update database
    await supabase
      .from('generations')
      .update({
        deployment_progress: JSON.stringify(progress),
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    console.log(`[Progress] ${step}: ${status}${message ? ` - ${message}` : ''}`);
    
    // 🔔 Emit realtime WebSocket event
    JobEventEmitter.emitDeploymentProgress(userId, projectId, step, status, message);
  } catch (error) {
    console.error(`[updateDeploymentProgress] Error:`, error);
    // Don't throw - progress update failure shouldn't break deployment
  }
}

// Background deployment function
async function deployInBackground(
  projectId: string, 
  files: any[], 
  platform: string,
  userId: string
): Promise<void> {
  try {
    console.log(`[deployInBackground] Starting deployment for ${projectId} to ${platform}`);
    
    await updateDeploymentProgress(projectId, userId, 'Preparing files', 'running', `Validating ${files.length} files`);
    
    await updateDeploymentProgress(projectId, userId, 'Creating Dockerfile', 'running', 'Generating deployment configuration');
    
    await updateDeploymentProgress(projectId, userId, 'Building image', 'running', 'Building Docker container');
    
    const previewService = new PreviewServiceWithRetry(3);
    
    // Create a wrapper for the progress callback that includes projectId and userId
    const progressCallback = async (step: string, status: 'running' | 'completed' | 'failed', message?: string) => {
      await updateDeploymentProgress(projectId, userId, step, status, message);
    };
    
    const previewResult = await previewService.generatePreviewWithRetry(
      projectId,
      files,
      3, // max retries
      progressCallback // Pass progress callback
    );

    if (previewResult.success && previewResult.previewUrl) {
      await updateDeploymentProgress(projectId, userId, 'Deployment complete', 'completed', `App available at ${previewResult.previewUrl}`);
      
      // Update with success
      await supabase
        .from('generations')
        .update({
          preview_url: previewResult.previewUrl,
          deployment_status: 'deployed',
          deployment_completed_at: new Date().toISOString(),
          deployment_logs: previewResult.logs || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);
      
      // 🔔 Emit realtime completion event
      JobEventEmitter.emitDeploymentComplete(
        userId,
        projectId,
        true,
        previewResult.previewUrl,
        undefined,
        previewResult.logs
      );
      
      console.log(`[deployInBackground] ✓ Deployment successful: ${previewResult.previewUrl}`);
    } else {
      await updateDeploymentProgress(projectId, userId, 'Deployment failed', 'failed', previewResult.error || 'Unknown error');
      
      // Update with failure
      await supabase
        .from('generations')
        .update({
          deployment_status: 'failed',
          deployment_error: previewResult.error || 'Unknown deployment error',
          deployment_completed_at: new Date().toISOString(),
          deployment_logs: previewResult.logs || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);
      
      // 🔔 Emit realtime completion event (failed)
      JobEventEmitter.emitDeploymentComplete(
        userId,
        projectId,
        false,
        undefined,
        previewResult.error || 'Unknown deployment error',
        previewResult.logs
      );
      
      console.warn(`[deployInBackground] ✗ Deployment failed:`, previewResult.error);
    }
  } catch (error: any) {
    console.error(`[deployInBackground] Deployment error:`, error);
    
    await updateDeploymentProgress(projectId, userId, 'Deployment failed', 'failed', error.message);
    
    // Update with failure
    await supabase
      .from('generations')
      .update({
        deployment_status: 'failed',
        deployment_error: error.message,
        deployment_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);
    
    // 🔔 Emit realtime completion event (error)
    JobEventEmitter.emitDeploymentComplete(
      userId,
      projectId,
      false,
      undefined,
      error.message
    );
  }
}

// GET /deploy/:id/status - Get quick deployment status (requires auth)
router.get('/deploy/:id/status', optionalAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { id } = req.params;

    console.log(`[GET /deploy/${id}/status] Request received. UserId: ${userId || 'NOT AUTHENTICATED'}`);

    // Check if user is authenticated
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Fetch deployment status (minimal fields for quick check)
    const { data: generation, error } = await supabase
      .from('generations')
      .select('id, user_id, deployment_status, preview_url')
      .eq('id', id)
      .single();

    if (error || !generation) {
      res.status(404).json({
        success: false,
        error: 'Deployment not found',
      });
      return;
    }

    if (generation.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: 'You do not have permission to view this deployment',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        status: generation.deployment_status,
        url: generation.preview_url,
      },
    });
    return;
  } catch (error: any) {
    console.error('[GET /deploy/:id/status] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch deployment status',
    });
    return;
  }
});

// GET /deploy/:id - Get deployment status (requires auth)
router.get('/deploy/:id', optionalAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { id } = req.params;

    console.log(`[GET /deploy/${id}] Request received. UserId: ${userId || 'NOT AUTHENTICATED'}`);

    // Check if user is authenticated
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Fetch deployment status
    const { data: generation, error } = await supabase
      .from('generations')
      .select('id, user_id, deployment_status, preview_url, deployment_error, deployment_started_at, deployment_completed_at, deployment_progress, deployment_logs')
      .eq('id', id)
      .single();

    if (error || !generation) {
      res.status(404).json({
        success: false,
        error: 'Deployment not found',
      });
      return;
    }

    if (generation.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: 'You do not have permission to view this deployment',
      });
      return;
    }

    // Parse deployment progress
    let progress: any[] = [];
    if (generation.deployment_progress) {
      try {
        progress = typeof generation.deployment_progress === 'string'
          ? JSON.parse(generation.deployment_progress)
          : generation.deployment_progress;
      } catch (e) {
        console.warn('Failed to parse deployment_progress:', e);
      }
    }

    res.json({
      success: true,
      data: {
        projectId: generation.id,
        deploymentStatus: generation.deployment_status,
        deploymentUrl: generation.preview_url,
        error: generation.deployment_error,
        startedAt: generation.deployment_started_at,
        completedAt: generation.deployment_completed_at,
        progress: progress,
        logs: generation.deployment_logs,
      },
    });
    return;
  } catch (error: any) {
    console.error('[GET /deploy/:id] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch deployment status',
    });
    return;
  }
});

export default router;
