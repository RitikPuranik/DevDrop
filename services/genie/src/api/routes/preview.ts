import { Router } from 'express';
import { PreviewService } from '../../services/preview/PreviewService';
import { PreviewServiceWithRetry } from '../../services/preview/PreviewServiceWithRetry';
import { supabase } from '../../storage/SupabaseClient';

const router = Router();

// Check deployment status endpoint
router.get('/preview/status/:generationId', async (req, res) => {
  try {
    const { generationId } = req.params;
    
    // Get deployment status from database
    const { data: generationData, error } = await supabase
      .from('generations')
      .select('preview_url, deployment_status, deployment_error, deployment_started_at, deployment_completed_at')
      .eq('id', generationId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!generationData) {
      return res.status(404).json({
        success: false,
        error: 'Generation not found'
      });
    }

    const status = generationData.deployment_status || 'pending';
    const previewUrl = generationData.preview_url;

    // If deployed, verify the URL is accessible
    if (status === 'deployed' && previewUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(previewUrl, {
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        return res.json({
          success: true,
          data: {
            status: 'deployed',
            ready: response.ok,
            previewUrl,
            deploymentStartedAt: generationData.deployment_started_at,
            deploymentCompletedAt: generationData.deployment_completed_at
          }
        });
      } catch (fetchError) {
        // URL exists but not accessible yet
        return res.json({
          success: true,
          data: {
            status: 'deployed',
            ready: false,
            previewUrl,
            message: 'Preview URL exists but may still be warming up',
            deploymentStartedAt: generationData.deployment_started_at,
            deploymentCompletedAt: generationData.deployment_completed_at
          }
        });
      }
    }

    // Return status from database
    return res.json({
      success: true,
      data: {
        status,
        ready: status === 'deployed',
        previewUrl: previewUrl || null,
        error: generationData.deployment_error || null,
        deploymentStartedAt: generationData.deployment_started_at,
        deploymentCompletedAt: generationData.deployment_completed_at
      }
    });

  } catch (error: any) {
    console.error('Status check error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/preview', async (req, res) => {
  try {
    const { generationId, files: providedFiles, useRetry = true, maxRetries = 3 } = req.body;

    let files: Array<{ path: string; content: string }>;
    let existingPreviewUrl: string | null = null;

    // If files are provided directly in the request, use them
    if (providedFiles && Array.isArray(providedFiles) && providedFiles.length > 0) {
      files = providedFiles;
      
      // Check if preview_url already exists in database
      const { data: generationData } = await supabase
        .from('generations')
        .select('preview_url, deployment_status')
        .eq('id', generationId)
        .maybeSingle();
      
      existingPreviewUrl = generationData?.preview_url || null;
      
      // If already deploying, return status
      if (generationData?.deployment_status === 'deploying') {
        return res.status(202).json({
          success: true,
          data: {
            status: 'deploying',
            message: 'Deployment is already in progress',
            generationId
          }
        });
      }
    } else {
      // Otherwise, retrieve the generated files from the database
      const { data: generationData, error: generationError } = await supabase
        .from('generations')
        .select('files, preview_url, deployment_status, snapshot_id, user_id')
        .eq('id', generationId)
        .maybeSingle();

      if (generationError) {
        throw new Error(generationError.message);
      }

      if (!generationData) {
        return res.status(404).json({ 
          success: false, 
          error: 'Generation not found in database. Please ensure files are provided in the request.' 
        });
      }

      files = generationData.files as Array<{ path: string; content: string }>;
      existingPreviewUrl = generationData.preview_url || null;
      
      // If already deploying, return status
      if (generationData.deployment_status === 'deploying') {
        return res.status(202).json({
          success: true,
          data: {
            status: 'deploying',
            message: 'Deployment is already in progress',
            generationId
          }
        });
      }
    }

    // If preview_url already exists and no force flag, return existing URL
    const forceRegenerate = req.body.forceRegenerate === true;
    if (existingPreviewUrl && !forceRegenerate) {
      console.log(`Preview URL already exists for ${generationId}, returning cached URL`);
      return res.json({ 
        success: true, 
        data: { 
          previewUrl: existingPreviewUrl,
          status: 'deployed',
          cached: true
        } 
      });
    }

    // Mark as deploying in database
    await supabase
      .from('generations')
      .update({ 
        deployment_status: 'deploying',
        deployment_started_at: new Date().toISOString()
      })
      .eq('id', generationId);

    // Return immediately with 202 Accepted status
    res.status(202).json({
      success: true,
      data: {
        status: 'deploying',
        message: 'Deployment started. Use /api/preview/status/:generationId to check progress.',
        generationId
      }
    });

    // Process deployment in background (don't await)
    (async () => {
      try {
        console.log(`🚀 Starting background deployment for ${generationId}`);
        console.log(`Files count: ${files.length}`);
        
        let result: any;
        
        if (useRetry) {
          const previewService = new PreviewServiceWithRetry(maxRetries);
          result = await previewService.generatePreviewWithRetry(generationId, files, maxRetries);
        } else {
          const previewService = new PreviewService();
          result = await previewService.generatePreview(generationId, files);
        }

        if (result.success || result.previewUrl) {
          // Deployment successful
          await supabase
            .from('generations')
            .update({ 
              preview_url: result.previewUrl,
              deployment_status: 'deployed',
              deployment_completed_at: new Date().toISOString()
            })
            .eq('id', generationId);
          
          console.log(`✅ Deployment successful: ${result.previewUrl}`);
        } else {
          // Deployment failed
          await supabase
            .from('generations')
            .update({ 
              deployment_status: 'failed',
              deployment_error: result.error || 'Unknown error',
              deployment_completed_at: new Date().toISOString()
            })
            .eq('id', generationId);
          
          console.error(`❌ Deployment failed: ${result.error}`);
        }
      } catch (error: any) {
        console.error(`❌ Background deployment error:`, error);
        await supabase
          .from('generations')
          .update({ 
            deployment_status: 'failed',
            deployment_error: error.message,
            deployment_completed_at: new Date().toISOString()
          })
          .eq('id', generationId);
      }
    })();

    // Explicitly return to satisfy TypeScript
    return;
    
  } catch (error: any) {
    console.error('Preview error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
