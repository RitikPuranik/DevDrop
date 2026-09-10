import Bull, { Queue, Job, JobOptions } from 'bull';
import { JobType, AgentTaskJobData, JobInfo, JobStatus } from './types';

class QueueManager {
  private queues: Map<JobType, Queue> = new Map();
  private redisUrl: string;

  constructor() {
    // Use Heroku Redis URL or local Redis
    this.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Handle Heroku Redis TLS requirement
    const redisOptions = this.redisUrl.includes('rediss://') 
      ? {
          tls: {
            rejectUnauthorized: false,
          },
        }
      : {};

    // Initialize queues for each job type
    Object.values(JobType).forEach((type) => {
      const queue = new Bull(type, this.redisUrl, {
        redis: redisOptions,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: {
            age: 3600 * 24, // Keep completed jobs for 24 hours
            count: 1000,
          },
          removeOnFail: {
            age: 3600 * 24 * 7, // Keep failed jobs for 7 days
          },
        },
      });

      this.queues.set(type, queue);
      console.log(`✅ Queue initialized: ${type}`);
    });
  }

  /**
   * Add a new job to the queue
   */
  async addJob<T = AgentTaskJobData>(
    type: JobType,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>> {
    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Queue not found for type: ${type}`);
    }

    const job = await queue.add(data, options);
    console.log(`📋 Job added to queue: ${job.id} (${type})`);
    return job;
  }

  /**
   * Get job by ID
   */
  async getJob(type: JobType, jobId: string): Promise<Job | null> {
    const queue = this.queues.get(type);
    if (!queue) return null;

    return await queue.getJob(jobId);
  }

  /**
   * Get job info with status
   */
  async getJobInfo(type: JobType, jobId: string): Promise<JobInfo | null> {
    const job = await this.getJob(type, jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = job.progress();

    return {
      id: job.id as string,
      type,
      status: this.mapBullStateToJobStatus(state),
      data: job.data,
      result: job.returnvalue,
      progress: typeof progress === 'number' ? progress : 0,
      createdAt: new Date(job.timestamp),
      startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
      completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      attemptsMax: job.opts.attempts,
    };
  }

  /**
   * Get all jobs for a user
   */
  async getUserJobs(userId: string, limit = 50): Promise<JobInfo[]> {
    const allJobs: JobInfo[] = [];

    for (const [type, queue] of this.queues) {
      const jobs = await queue.getJobs(
        ['waiting', 'active', 'completed', 'failed', 'delayed'],
        0,
        limit
      );

      for (const job of jobs) {
        if ((job.data as any).userId === userId) {
          const state = await job.getState();
          allJobs.push({
            id: job.id as string,
            type,
            status: this.mapBullStateToJobStatus(state),
            data: job.data as AgentTaskJobData,
            result: job.returnvalue,
            progress: typeof job.progress() === 'number' ? job.progress() : 0,
            createdAt: new Date(job.timestamp),
            startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
            completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
            failedReason: job.failedReason,
            attemptsMade: job.attemptsMade,
            attemptsMax: job.opts.attempts,
          });
        }
      }
    }

    return allJobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Cancel a job
   */
  async cancelJob(type: JobType, jobId: string): Promise<boolean> {
    const job = await this.getJob(type, jobId);
    if (!job) return false;

    try {
      await job.remove();
      return true;
    } catch (error) {
      console.error('Error canceling job:', error);
      return false;
    }
  }

  /**
   * Retry a failed job
   */
  async retryJob(type: JobType, jobId: string): Promise<boolean> {
    const job = await this.getJob(type, jobId);
    if (!job) return false;

    try {
      await job.retry();
      return true;
    } catch (error) {
      console.error('Error retrying job:', error);
      return false;
    }
  }

  /**
   * Get queue for processing
   */
  getQueue(type: JobType): Queue | undefined {
    return this.queues.get(type);
  }

  /**
   * Clean old jobs from queue
   */
  async cleanQueue(type: JobType, grace = 3600 * 24 * 7): Promise<void> {
    const queue = this.queues.get(type);
    if (!queue) return;

    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');
    console.log(`🧹 Cleaned old jobs from queue: ${type}`);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(type: JobType) {
    const queue = this.queues.get(type);
    if (!queue) return null;

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Close all queues
   */
  async close(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    this.queues.clear();
    console.log('🔌 All queues closed');
  }

  private mapBullStateToJobStatus(state: string): JobStatus {
    switch (state) {
      case 'waiting':
        return JobStatus.WAITING;
      case 'active':
        return JobStatus.ACTIVE;
      case 'completed':
        return JobStatus.COMPLETED;
      case 'failed':
        return JobStatus.FAILED;
      case 'delayed':
        return JobStatus.DELAYED;
      default:
        return JobStatus.WAITING;
    }
  }
}

// Singleton instance
export const queueManager = new QueueManager();
