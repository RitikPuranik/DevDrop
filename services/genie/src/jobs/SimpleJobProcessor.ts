import { supabase } from '../storage/SupabaseClient';
import { chatQueue } from '../services/ChatQueue';
import { randomUUID } from 'crypto';
import {
  emitJobStarted,
  emitJobProgress,
  emitJobCompleted,
  emitJobFailed,
  emitJobsListUpdate,
} from '../services/RealtimeJobEmitter';

interface BackgroundJob {
  id: string;
  user_id: string;
  session_id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  user_message: string;
  context: any;
  progress: number;
  result?: any;
  error?: string;
  logs?: string[];
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

/**
 * Simple background job processor
 * - Polls database for pending jobs
 * - Processes one job at a time
 * - Updates progress in database
 * - No Redis, no Bull queue complexity
 */
export class SimpleJobProcessor {
  private isProcessing = false;
  private pollInterval: NodeJS.Timeout | null = null;
  
  /**
   * Start polling for jobs every 2 seconds
   */
  start() {
    console.log('🚀 SimpleJobProcessor started');
    
    // Process immediately
    this.processNextJob();
    
    // Then poll every 2 seconds
    this.pollInterval = setInterval(() => {
      this.processNextJob();
    }, 2000);
  }
  
  /**
   * Stop polling
   */
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('🛑 SimpleJobProcessor stopped');
  }
  
  /**
   * Process the next pending job
   */
  private async processNextJob() {
    // Skip if already processing
    if (this.isProcessing) {
      return;
    }
    
    try {
      this.isProcessing = true;
      
      // Use atomic claim operation with PostgreSQL row-level locking
      // This ensures only ONE dyno can claim a job at a time
      const { data: claimedJobs, error } = await supabase.rpc('claim_pending_job');
      
      if (error) {
        console.error('❌ Error claiming job:', error);
        return;
      }
      
      if (!claimedJobs || claimedJobs.length === 0) {
        // No pending jobs or another dyno claimed it first
        return;
      }
      
      const job = claimedJobs[0] as BackgroundJob;
      
      console.log(`\n🚀 Processing job ${job.id}...`);
      console.log(`   User: ${job.user_id}`);
      console.log(`   Message: ${job.user_message.substring(0, 100)}...`);
      
      await this.processJob(job);
      
      // Emit jobs list update after processing
      await emitJobsListUpdate(job.user_id);
      
    } catch (error: any) {
      console.error('❌ Error in processNextJob:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Process a single job using ChatQueue (same logic as normal chat)
   */
  private async processJob(job: BackgroundJob) {
    const startTime = new Date();
    const logs: string[] = [];
    
    try {
      // Update background job to processing
      await this.updateJob(job.id, {
        status: 'processing',
        started_at: startTime.toISOString(),
        progress: 10,
      });
      
      // 🔔 Emit realtime event: Job started
      await emitJobStarted(job.user_id, job.id, 'Job started processing');
      await emitJobsListUpdate(job.user_id);
      
      // Update generation to processing
      await supabase
        .from('generations')
        .update({
          status: 'processing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.session_id);
      
      logs.push(`[${new Date().toISOString()}] Starting agent task`);
      logs.push(`User: ${job.user_id}, Session: ${job.session_id}`);
      logs.push(`Message: ${job.user_message}`);
      
      // Use ChatQueue to process (same as normal chat)
      // This ensures full routing through ChatAgent → GitHubAgent/SimpleCoder/etc.
      await this.updateJob(job.id, { progress: 20, logs });
      
      // 🔔 Emit realtime progress
      await emitJobProgress(job.user_id, job.id, 20, 'Submitting to ChatQueue...');
      
      logs.push(`[${new Date().toISOString()}] Submitting to ChatQueue...`);
      
      // Create a NEW chat job ID (can't reuse background job ID due to unique constraint)
      const chatJobId = randomUUID();
      
      await chatQueue.enqueue({
        id: chatJobId,
        generationId: job.session_id,
        userId: job.user_id,
        message: job.user_message,
        currentFiles: job.context?.fileContents || [],
        language: job.context?.language || 'typescript',
        imageUrls: job.context?.imageUrls || [],
        githubContext: job.context?.githubContext,
      });
      
      await this.updateJob(job.id, { progress: 30, logs });
      
      // 🔔 Emit realtime progress
      await emitJobProgress(job.user_id, job.id, 30, 'Chat job created, processing...');
      
      logs.push(`[${new Date().toISOString()}] Chat job ${chatJobId} created, waiting for completion...`);
      
      // Poll chat job status until completed
      let chatJobCompleted = false;
      let attempts = 0;
      const maxAttempts = 300; // 300 attempts x 2s = 10 minutes max
      
      while (!chatJobCompleted && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
        attempts++;
        
        const chatJob = await chatQueue.getJob(chatJobId);
        
        if (chatJob) {
          // Update progress based on chat job progress
          const progress = Math.min(90, 30 + (attempts * 2)); // 30% → 90%
          await this.updateJob(job.id, { progress, logs });
          
          // 🔔 Emit realtime progress every 10 attempts (every ~20s)
          if (attempts % 10 === 0) {
            await emitJobProgress(job.user_id, job.id, progress, 'Processing request...');
          }
          
          if (chatJob.status === 'completed') {
            chatJobCompleted = true;
            logs.push(`[${new Date().toISOString()}] Chat job completed successfully`);
            
            // Update generation status to completed
            const generationUpdateResult = await supabase
              .from('generations')
              .update({
                status: 'completed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.session_id);
            
            if (generationUpdateResult.error) {
              console.error(`⚠️ Warning: Failed to update generation status:`, generationUpdateResult.error);
              logs.push(`[${new Date().toISOString()}] Warning: Failed to update generation status`);
            } else {
              logs.push(`[${new Date().toISOString()}] Generation ${job.session_id} marked as completed`);
              console.log(`✅ Generation ${job.session_id} marked as completed`);
            }
            
            // Complete background job
            const endTime = new Date();
            const duration = endTime.getTime() - startTime.getTime();
            
            logs.push(`[${new Date().toISOString()}] Task completed successfully`);
            logs.push(`Duration: ${(duration / 1000).toFixed(2)}s`);
            
            await this.updateJob(job.id, {
              status: 'completed',
              progress: 100,
              result: chatJob.result,
              logs,
              completed_at: endTime.toISOString(),
            });
            
            console.log(`✅ Job ${job.id} completed successfully`);
            console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
            
            // 🔔 Emit realtime completion event
            await emitJobCompleted(
              job.user_id,
              job.id,
              job.session_id,
              chatJob.result,
              duration
            );
            await emitJobsListUpdate(job.user_id);
            
          } else if (chatJob.status === 'error') {
            throw new Error(chatJob.error || 'Chat job failed');
          }
        }
      }
      
      if (!chatJobCompleted) {
        throw new Error('Chat job timeout after 10 minutes');
      }
      
    } catch (error: any) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      logs.push(`[${new Date().toISOString()}] ERROR: ${error.message}`);
      logs.push(`Stack: ${error.stack}`);
      
      // Update generation status to failed
      const generationUpdateResult = await supabase
        .from('generations')
        .update({
          status: 'failed',
          error: error.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.session_id);
      
      if (generationUpdateResult.error) {
        console.error(`⚠️ Warning: Failed to update generation status:`, generationUpdateResult.error);
      } else {
        logs.push(`[${new Date().toISOString()}] Generation ${job.session_id} marked as failed`);
        console.log(`❌ Generation ${job.session_id} marked as failed`);
      }
      
      await this.updateJob(job.id, {
        status: 'failed',
        error: error.message,
        logs,
        completed_at: endTime.toISOString(),
      });
      
      console.error(`❌ Job ${job.id} failed:`, error.message);
      console.error(`   Duration: ${(duration / 1000).toFixed(2)}s`);
      
      // 🔔 Emit realtime failure event
      await emitJobFailed(
        job.user_id,
        job.id,
        job.session_id,
        error.message,
        duration
      );
      await emitJobsListUpdate(job.user_id);
      
    }
  }
  
  /**
   * Update job in database
   */
  private async updateJob(jobId: string, updates: Partial<BackgroundJob>) {
    const { error } = await supabase
      .from('background_jobs')
      .update(updates)
      .eq('id', jobId);
    
    if (error) {
      console.error(`❌ Error updating job ${jobId}:`, error);
    }
  }
}

// Singleton instance
let processorInstance: SimpleJobProcessor | null = null;

export function startJobProcessor() {
  if (!processorInstance) {
    processorInstance = new SimpleJobProcessor();
    processorInstance.start();
  }
  return processorInstance;
}

export function stopJobProcessor() {
  if (processorInstance) {
    processorInstance.stop();
    processorInstance = null;
  }
}
