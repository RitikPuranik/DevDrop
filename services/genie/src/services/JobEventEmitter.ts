/**
 * JobEventEmitter Service
 * 
 * Centralized service for emitting real-time job events via Socket.IO
 * Replaces polling with push-based updates
 */

import { io } from '../api/server';

export interface JobProgressEvent {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message?: string;
  agent?: string;
  timestamp: string;
}

export interface JobCompleteEvent {
  jobId: string;
  sessionId: string;
  success: boolean;
  result?: any;
  error?: string;
  duration?: number;
  timestamp: string;
}

export interface JobUpdateEvent {
  jobId: string;
  updates: any;
  timestamp: string;
}

export interface JobsListUpdateEvent {
  userId: string;
  activeCount: number;
  jobs: any[];
  timestamp: string;
}

export class JobEventEmitter {
  /**
   * Emit job progress update to specific user
   */
  static emitProgress(userId: string, event: JobProgressEvent): void {
    try {
      const room = `user:${userId}`;
      
      io.to(room).emit('job:progress', {
        ...event,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`📡 Emitted job:progress to ${room}:`, {
        jobId: event.jobId,
        status: event.status,
        progress: event.progress,
      });
    } catch (error: any) {
      console.error('❌ Error emitting job progress:', error.message);
    }
  }

  /**
   * Emit job completion to specific user
   */
  static emitComplete(userId: string, event: JobCompleteEvent): void {
    try {
      const room = `user:${userId}`;
      
      io.to(room).emit('job:complete', {
        ...event,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`📡 Emitted job:complete to ${room}:`, {
        jobId: event.jobId,
        success: event.success,
      });
    } catch (error: any) {
      console.error('❌ Error emitting job complete:', error.message);
    }
  }

  /**
   * Emit job update (general purpose)
   */
  static emitUpdate(userId: string, event: JobUpdateEvent): void {
    try {
      const room = `user:${userId}`;
      
      io.to(room).emit('job:update', {
        ...event,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`📡 Emitted job:update to ${room}:`, {
        jobId: event.jobId,
      });
    } catch (error: any) {
      console.error('❌ Error emitting job update:', error.message);
    }
  }

  /**
   * Emit jobs list update (for background jobs panel)
   */
  static emitJobsListUpdate(userId: string, event: JobsListUpdateEvent): void {
    try {
      const room = `user:${userId}`;
      
      io.to(room).emit('user:jobs:update', {
        ...event,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`📡 Emitted user:jobs:update to ${room}:`, {
        activeCount: event.activeCount,
        totalJobs: event.jobs.length,
      });
    } catch (error: any) {
      console.error('❌ Error emitting jobs list update:', error.message);
    }
  }

  /**
   * Emit agent thought/message (for chat interface)
   */
  static emitAgentMessage(
    userId: string,
    jobId: string,
    agent: string,
    message: string,
    status: 'started' | 'completed' | 'error'
  ): void {
    try {
      const room = `user:${userId}`;
      
      io.to(room).emit('job:agent:message', {
        jobId,
        agent,
        message,
        status,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`📡 Emitted job:agent:message to ${room}:`, {
        jobId,
        agent,
        status,
      });
    } catch (error: any) {
      console.error('❌ Error emitting agent message:', error.message);
    }
  }

  /**
   * Emit chat job progress messages
   */
  static emitChatProgress(
    userId: string,
    jobId: string,
    progressMessages: Array<{
      timestamp: string;
      agent: string;
      status: string;
      message: string;
    }>
  ): void {
    try {
      const room = `user:${userId}`;
      
      io.to(room).emit('chat:progress', {
        jobId,
        progressMessages,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`📡 Emitted chat:progress to ${room}:`, {
        jobId,
        messagesCount: progressMessages.length,
      });
    } catch (error: any) {
      console.error('❌ Error emitting chat progress:', error.message);
    }
  }

  /**
   * Emit deployment progress update
   */
  static emitDeploymentProgress(
    userId: string,
    projectId: string,
    step: string,
    status: 'running' | 'completed' | 'failed',
    message?: string
  ): void {
    try {
      const room = `user:${userId}`;
      
      io.to(room).emit('deployment:progress', {
        projectId,
        step,
        status,
        message,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`📡 Emitted deployment:progress to ${room}:`, {
        projectId,
        step,
        status,
      });
    } catch (error: any) {
      console.error('❌ Error emitting deployment progress:', error.message);
    }
  }

  /**
   * Emit deployment completion
   */
  static emitDeploymentComplete(
    userId: string,
    projectId: string,
    success: boolean,
    deploymentUrl?: string,
    error?: string,
    logs?: string
  ): void {
    try {
      const room = `user:${userId}`;
      
      io.to(room).emit('deployment:complete', {
        projectId,
        success,
        deploymentUrl,
        error,
        logs,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`📡 Emitted deployment:complete to ${room}:`, {
        projectId,
        success,
        hasUrl: !!deploymentUrl,
      });
    } catch (error: any) {
      console.error('❌ Error emitting deployment complete:', error.message);
    }
  }

  /**
   * Emit generation progress update
   */
  static emitGenerationProgress(
    userId: string,
    generationId: string,
    agent: string,
    message: string,
    progress?: number
  ): void {
    try {
      const room = `user:${userId}`;
      
      io.to(room).emit('generation:progress', {
        generationId,
        agent,
        message,
        progress,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`📡 Emitted generation:progress to ${room}:`, {
        generationId,
        agent,
        progress,
      });
    } catch (error: any) {
      console.error('❌ Error emitting generation progress:', error.message);
    }
  }

  /**
   * Emit generation completion
   */
  static emitGenerationComplete(
    userId: string,
    generationId: string,
    success: boolean,
    result?: any,
    error?: string
  ): void {
    try {
      const room = `user:${userId}`;
      
      io.to(room).emit('generation:complete', {
        generationId,
        success,
        result,
        error,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`📡 Emitted generation:complete to ${room}:`, {
        generationId,
        success,
      });
    } catch (error: any) {
      console.error('❌ Error emitting generation complete:', error.message);
    }
  }
}

export default JobEventEmitter;
