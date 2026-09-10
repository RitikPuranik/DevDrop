import { Router } from 'express';
import { optionalAuth, AuthenticatedRequest } from '../middleware/supabaseAuth';
import { supabase } from '../../storage/SupabaseClient';

const router = Router();

/**
 * Get job by ID
 */
router.get('/:jobId', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { jobId } = req.params;
    
    const { data: job, error } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (error) {
      res.status(404).json({
        success: false,
        error: 'Job not found',
      });
      return;
    }
    
    res.json({
      success: true,
      data: { job },
    });
  } catch (error: any) {
    console.error('Error fetching job:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get all jobs for a user
 */
router.get('/user/:userId', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    
    const { data: jobs, error } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50); // Limit to last 50 jobs
    
    if (error) {
      console.error('Error fetching user jobs:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
      return;
    }
    
    res.json({
      success: true,
      data: {
        jobs: jobs || [],
        count: jobs?.length || 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching user jobs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Cancel a job
 */
router.delete('/:jobId', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { jobId } = req.params;
    
    // Update status to cancelled
    const { data: job, error } = await supabase
      .from('background_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('status', 'pending') // Only cancel pending jobs
      .select()
      .single();
    
    if (error || !job) {
      res.status(400).json({
        success: false,
        error: 'Cannot cancel job (not found or already processed)',
      });
      return;
    }
    
    res.json({
      success: true,
      data: { job },
    });
  } catch (error: any) {
    console.error('Error cancelling job:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Retry a failed job
 */
router.post('/:jobId/retry', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { jobId } = req.params;
    
    // Get the failed job
    const { data: oldJob, error: fetchError } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('status', 'failed')
      .single();
    
    if (fetchError || !oldJob) {
      res.status(400).json({
        success: false,
        error: 'Cannot retry job (not found or not failed)',
      });
      return;
    }
    
    // Create new job with same data
    const { data: newJob, error: createError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: oldJob.user_id,
        session_id: oldJob.session_id,
        type: oldJob.type,
        status: 'pending',
        user_message: oldJob.user_message,
        context: oldJob.context,
        progress: 0,
      })
      .select()
      .single();
    
    if (createError || !newJob) {
      console.error('Error creating retry job:', createError);
      res.status(500).json({
        success: false,
        error: 'Failed to create retry job',
      });
      return;
    }
    
    res.json({
      success: true,
      data: { job: newJob },
    });
  } catch (error: any) {
    console.error('Error retrying job:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
