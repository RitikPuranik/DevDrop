/**
 * Background Worker Process
 * This runs as a separate Heroku dyno to process jobs
 */

import dotenv from 'dotenv';
import { queueManager } from './QueueManager';
import { JobType } from './types';
import { processAgentTask, setupJobEventHandlers } from './processors/AgentTaskProcessor';

// Load environment variables
dotenv.config();

console.log(`
🔧 Genie AI Background Worker Starting...
⚙️  Environment: ${process.env.NODE_ENV || 'development'}
🔗 Redis URL: ${process.env.REDIS_URL ? 'Connected' : 'Using localhost'}
👷 Worker ready to process jobs...
`);

/**
 * Initialize worker and start processing jobs
 */
async function startWorker() {
  try {
    // Get the agent task queue
    const agentQueue = queueManager.getQueue(JobType.AGENT_TASK);
    
    if (!agentQueue) {
      throw new Error('Agent task queue not initialized');
    }
    
    // Setup event handlers
    setupJobEventHandlers(agentQueue);
    
    // Process jobs with concurrency
    const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '2', 10);
    console.log(`📊 Processing jobs with concurrency: ${concurrency}`);
    
    agentQueue.process(concurrency, async (job) => {
      console.log(`\n🚀 Processing job ${job.id}...`);
      console.log(`   Type: ${JobType.AGENT_TASK}`);
      console.log(`   User: ${job.data.userId}`);
      console.log(`   Message: ${job.data.userMessage.substring(0, 100)}...`);
      
      return await processAgentTask(job);
    });
    
    console.log('✅ Worker started successfully!\n');
    
    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('\n⚠️  SIGTERM received, shutting down gracefully...');
      await gracefulShutdown();
    });
    
    process.on('SIGINT', async () => {
      console.log('\n⚠️  SIGINT received, shutting down gracefully...');
      await gracefulShutdown();
    });
    
  } catch (error) {
    console.error('❌ Worker startup failed:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown() {
  try {
    console.log('🔌 Closing queue connections...');
    await queueManager.close();
    console.log('✅ Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

/**
 * Monitor queue statistics
 */
async function monitorQueue() {
  setInterval(async () => {
    try {
      const stats = await queueManager.getQueueStats(JobType.AGENT_TASK);
      if (stats) {
        console.log(`\n📊 Queue Stats [${new Date().toLocaleTimeString()}]:`);
        console.log(`   Waiting: ${stats.waiting}`);
        console.log(`   Active: ${stats.active}`);
        console.log(`   Completed: ${stats.completed}`);
        console.log(`   Failed: ${stats.failed}`);
        console.log(`   Total: ${stats.total}\n`);
      }
    } catch (error) {
      console.error('Error fetching queue stats:', error);
    }
  }, 60000); // Every minute
}

// Start the worker
startWorker();

// Start monitoring
if (process.env.ENABLE_QUEUE_MONITORING === 'true') {
  monitorQueue();
}
