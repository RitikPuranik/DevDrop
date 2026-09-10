/**
 * RealtimeJobEmitter
 * 
 * Helper functions to emit realtime events during job processing
 * Integrates with SimpleJobProcessor and ChatQueue
 */

import JobEventEmitter from './JobEventEmitter';
import { supabase } from '../storage/SupabaseClient';

/**
 * Emit job started event
 */
export async function emitJobStarted(
  userId: string,
  jobId: string,
  message?: string
): Promise<void> {
  JobEventEmitter.emitProgress(userId, {
    jobId,
    status: 'processing',
    progress: 0,
    message: message || 'Job started',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit job progress update
 */
export async function emitJobProgress(
  userId: string,
  jobId: string,
  progress: number,
  message?: string,
  agent?: string
): Promise<void> {
  JobEventEmitter.emitProgress(userId, {
    jobId,
    status: 'processing',
    progress,
    message,
    agent,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit job completed event
 */
export async function emitJobCompleted(
  userId: string,
  jobId: string,
  sessionId: string,
  result?: any,
  duration?: number
): Promise<void> {
  JobEventEmitter.emitComplete(userId, {
    jobId,
    sessionId,
    success: true,
    result,
    duration,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit job failed event
 */
export async function emitJobFailed(
  userId: string,
  jobId: string,
  sessionId: string,
  error: string,
  duration?: number
): Promise<void> {
  JobEventEmitter.emitComplete(userId, {
    jobId,
    sessionId,
    success: false,
    error,
    duration,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit agent message during job processing
 */
export async function emitAgentMessage(
  userId: string,
  jobId: string,
  agent: string,
  message: string,
  status: 'started' | 'completed' | 'error'
): Promise<void> {
  JobEventEmitter.emitAgentMessage(userId, jobId, agent, message, status);
}

/**
 * Emit jobs list update for a user
 * Call this whenever jobs are added, removed, or status changes
 */
export async function emitJobsListUpdate(userId: string): Promise<void> {
  try {
    // Fetch user's jobs
    const { data: jobs, error } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const activeCount = jobs?.filter(
      (j: any) => j.status === 'processing' || j.status === 'pending'
    ).length || 0;

    JobEventEmitter.emitJobsListUpdate(userId, {
      userId,
      activeCount,
      jobs: jobs || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error emitting jobs list update:', error.message);
  }
}
