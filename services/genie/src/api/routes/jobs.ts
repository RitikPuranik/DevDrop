import express from 'express';
import { queueManager } from '../../jobs/QueueManager';
import { JobType, AgentTaskJobData } from '../../jobs/types';

const router = express.Router();

/**
 * POST /api/jobs/agent-task
 * Submit a new agent task to background queue
 */
router.post('/agent-task', async (req, res) => {
  try {
    const { userId, sessionId, userMessage, agentType, context } = req.body;

    // Validation
    if (!userId || !sessionId || !userMessage) {
      return res.status(400).json({
        error: 'Missing required fields: userId, sessionId, userMessage',
      });
    }

    // Create job data
    const jobData: AgentTaskJobData = {
      userId,
      sessionId,
      userMessage,
      agentType,
      context,
    };

    // Add to queue
    const job = await queueManager.addJob(JobType.AGENT_TASK, jobData);

    res.json({
      success: true,
      jobId: job.id,
      message: 'Task submitted to background queue',
      status: 'queued',
    });
  } catch (error: any) {
    console.error('Error submitting job:', error);
    res.status(500).json({
      error: 'Failed to submit job',
      details: error.message,
    });
  }
});

/**
 * GET /api/jobs/:jobId
 * Get status and details of a specific job
 */
router.get('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { type = JobType.AGENT_TASK } = req.query;

    const jobInfo = await queueManager.getJobInfo(type as JobType, jobId);

    if (!jobInfo) {
      return res.status(404).json({
        error: 'Job not found',
      });
    }

    res.json({
      success: true,
      job: jobInfo,
    });
  } catch (error: any) {
    console.error('Error fetching job:', error);
    res.status(500).json({
      error: 'Failed to fetch job',
      details: error.message,
    });
  }
});

/**
 * GET /api/jobs/user/:userId
 * Get all jobs for a specific user
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;

    const jobs = await queueManager.getUserJobs(userId, parseInt(limit as string, 10));

    res.json({
      success: true,
      jobs,
      count: jobs.length,
    });
  } catch (error: any) {
    console.error('Error fetching user jobs:', error);
    res.status(500).json({
      error: 'Failed to fetch user jobs',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/jobs/:jobId
 * Cancel a job
 */
router.delete('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { type = JobType.AGENT_TASK } = req.query;

    const success = await queueManager.cancelJob(type as JobType, jobId);

    if (!success) {
      return res.status(404).json({
        error: 'Job not found or already completed',
      });
    }

    res.json({
      success: true,
      message: 'Job cancelled successfully',
    });
  } catch (error: any) {
    console.error('Error cancelling job:', error);
    res.status(500).json({
      error: 'Failed to cancel job',
      details: error.message,
    });
  }
});

/**
 * POST /api/jobs/:jobId/retry
 * Retry a failed job
 */
router.post('/:jobId/retry', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { type = JobType.AGENT_TASK } = req.query;

    const success = await queueManager.retryJob(type as JobType, jobId);

    if (!success) {
      return res.status(404).json({
        error: 'Job not found or cannot be retried',
      });
    }

    res.json({
      success: true,
      message: 'Job retry initiated',
    });
  } catch (error: any) {
    console.error('Error retrying job:', error);
    res.status(500).json({
      error: 'Failed to retry job',
      details: error.message,
    });
  }
});

/**
 * GET /api/jobs/stats/queue
 * Get queue statistics
 */
router.get('/stats/queue', async (req, res) => {
  try {
    const { type = JobType.AGENT_TASK } = req.query;

    const stats = await queueManager.getQueueStats(type as JobType);

    if (!stats) {
      return res.status(404).json({
        error: 'Queue not found',
      });
    }

    res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({
      error: 'Failed to fetch queue stats',
      details: error.message,
    });
  }
});

export default router;
