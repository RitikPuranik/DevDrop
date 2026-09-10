import { Job } from 'bull';
import { AgentTaskJobData, JobResult } from '../types';
import { ChatAgent } from '../../agents/specialized/ChatAgent';

/**
 * Process agent tasks in the background using ChatAgent
 * Note: Socket.IO events cannot be emitted from worker dyno (separate process)
 * Frontend should poll /api/jobs/:jobId or use Redis pub/sub for real-time updates
 */
export async function processAgentTask(job: Job<AgentTaskJobData>): Promise<JobResult> {
  const startTime = new Date();
  const logs: string[] = [];
  
  try {
    const { userId, sessionId, userMessage, context } = job.data;
    
    logs.push(`[${new Date().toISOString()}] Starting agent task`);
    logs.push(`User: ${userId}, Session: ${sessionId}`);
    logs.push(`Message: ${userMessage}`);
    
    // Update progress: 10%
    await job.progress(10);
    
    // Step 1: Initialize ChatAgent with GitHub context if available
    logs.push(`[${new Date().toISOString()}] Initializing ChatAgent...`);
    await job.progress(20);
    
    const githubContext = context?.githubContext;
    const chatAgent = await ChatAgent(githubContext);
    const { runner } = chatAgent;
    
    // Step 2: Prepare context for ChatAgent
    logs.push(`[${new Date().toISOString()}] Processing request with ChatAgent...`);
    await job.progress(30);
    
    // Build context string
    const contextParts: string[] = [];
    
    if (context?.fileContents && context.fileContents.length > 0) {
      contextParts.push(`\nExisting files:`);
      context.fileContents.forEach((file: any) => {
        contextParts.push(`\nFile: ${file.path}`);
        contextParts.push(`\`\`\`\n${file.content}\n\`\`\``);
      });
    }
    
    if (context?.githubContext) {
      contextParts.push(`\n=== GITHUB CONTEXT ===`);
      contextParts.push(`Username: ${context.githubContext.username}`);
      contextParts.push(`Token: Available`);
      if (context.githubContext.email) {
        contextParts.push(`Email: ${context.githubContext.email}`);
      }
      contextParts.push(`=== END GITHUB CONTEXT ===\n`);
    }
    
    const fullMessage = userMessage + (contextParts.length > 0 ? '\n' + contextParts.join('\n') : '');
    
    // Step 3: Call ChatAgent
    logs.push(`[${new Date().toISOString()}] Executing ChatAgent...`);
    await job.progress(50);
    
    const response = await runner.ask(fullMessage);
    
    logs.push(`[${new Date().toISOString()}] ChatAgent execution completed`);
    await job.progress(90);
    
    // Step 4: Format and return result
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    
    logs.push(`[${new Date().toISOString()}] Task completed successfully`);
    logs.push(`Duration: ${(duration / 1000).toFixed(2)}s`);
    
    await job.progress(100);
    
    const jobResult: JobResult = {
      success: true,
      result: response,
      logs,
      startTime,
      endTime,
      duration,
    };
    
    // Note: Cannot emit Socket.IO events from worker dyno
    // Frontend should poll /api/jobs/:jobId for status
    
    return jobResult;
    
  } catch (error: any) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    
    logs.push(`[${new Date().toISOString()}] ERROR: ${error.message}`);
    logs.push(`Stack: ${error.stack}`);
    
    // Log error details
    console.error(`❌ Job processing failed: ${error.message}`);
    console.error(`   Duration: ${(duration / 1000).toFixed(2)}s`);
    
    throw error; // Re-throw to let processor handle it
  }
}

/**
 * Job event handlers
 */
export function setupJobEventHandlers(queue: any) {
  queue.on('completed', (job: Job<AgentTaskJobData>, result: JobResult) => {
    console.log(`✅ Job ${job.id} completed successfully`);
    console.log(`   User: ${job.data.userId}`);
    console.log(`   Duration: ${result.duration}ms`);
  });
  
  queue.on('failed', (job: Job<AgentTaskJobData>, error: Error) => {
    console.error(`❌ Job ${job.id} failed:`, error.message);
    console.error(`   User: ${job.data.userId}`);
    console.error(`   Attempts: ${job.attemptsMade}/${job.opts.attempts}`);
  });
  
  queue.on('progress', (job: Job<AgentTaskJobData>, progress: number) => {
    console.log(`⏳ Job ${job.id} progress: ${progress}%`);
  });
  
  queue.on('stalled', (job: Job<AgentTaskJobData>) => {
    console.warn(`⚠️  Job ${job.id} stalled`);
  });
}
