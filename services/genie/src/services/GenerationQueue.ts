import { GenerateWorkflow } from '../workflows/GenerateWorkflow';
import { supabase } from '../storage/SupabaseClient';
import JobEventEmitter from './JobEventEmitter';
// PreviewServiceWithRetry removed - deployment is now manual via Deploy button

interface GenerationJob {
  id: string;
  prompt: string;
  projectContext?: string;
  targetLanguage: string;
  complexity: 'simple' | 'moderate' | 'complex';
  agents: string[];
  imageUrls?: string[];
  autoPreview?: boolean; // Enable automatic preview deployment
}

class GenerationQueue {
  private processing = new Set<string>();
  private queue: GenerationJob[] = [];
  private isProcessing = false;

  async enqueue(job: GenerationJob): Promise<void> {
    console.log(`[GenerationQueue] Enqueueing job ${job.id}`);
    this.queue.push(job);
    
    // Update status to pending in database
    await supabase
      .from('generations')
      .update({ 
        status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      await this.processJob(job);
    }

    this.isProcessing = false;
  }

  private async processJob(job: GenerationJob): Promise<void> {
    const { id, prompt, projectContext, targetLanguage, complexity, agents, imageUrls } = job;

    if (this.processing.has(id)) {
      console.log(`[GenerationQueue] Job ${id} is already being processed`);
      return;
    }

    this.processing.add(id);

    try {
      console.log(`[GenerationQueue] Processing job ${id}`);

      // Fetch userId for WebSocket emission
      const { data: generation } = await supabase
        .from('generations')
        .select('user_id')
        .eq('id', id)
        .single();

      const userId = generation?.user_id;

      // Update status to processing
      await supabase
        .from('generations')
        .update({ 
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      // 🔔 Emit realtime start event
      if (userId) {
        JobEventEmitter.emitGenerationProgress(
          userId,
          id,
          'GenerateWorkflow',
          'Starting code generation...',
          0
        );
      }

      // Run the generation workflow
      const generateWorkflow = new GenerateWorkflow();
      const result = await generateWorkflow.run({
        prompt,
        projectContext,
        targetLanguage,
        complexity,
        agents,
        imageUrls,
      });

      // Update with results
      await supabase
        .from('generations')
        .update({
          status: 'completed',
          files: result.files,
          agent_thoughts: result.agentThoughts,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      console.log(`[GenerationQueue] Job ${id} completed successfully`);

      // 🔔 Emit realtime completion event
      if (userId) {
        JobEventEmitter.emitGenerationComplete(
          userId,
          id,
          true,
          {
            files: result.files,
            agentThoughts: result.agentThoughts,
            targetLanguage: result.language || targetLanguage,
          }
        );
      }

      // NOTE: Auto-deployment to fly.io is now DISABLED by default
      // Preview is handled by WebContainer in the frontend
      // Deployment only happens when user clicks "Deploy" button
      console.log(`[GenerationQueue] Files ready for WebContainer preview. Deployment will be triggered manually by user.`);
    } catch (error: any) {
      console.error(`[GenerationQueue] Job ${id} failed:`, error);

      // Fetch userId for error emission
      const { data: generation } = await supabase
        .from('generations')
        .select('user_id')
        .eq('id', id)
        .single();

      const userId = generation?.user_id;

      // Update with error
      await supabase
        .from('generations')
        .update({
          status: 'failed',
          error: error.message || 'Unknown error occurred',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      // 🔔 Emit realtime error event
      if (userId) {
        JobEventEmitter.emitGenerationComplete(
          userId,
          id,
          false,
          undefined,
          error.message || 'Unknown error occurred'
        );
      }
    } finally {
      this.processing.delete(id);
    }
  }

  getStatus(id: string): 'processing' | 'queued' | 'unknown' {
    if (this.processing.has(id)) return 'processing';
    if (this.queue.some(job => job.id === id)) return 'queued';
    return 'unknown';
  }
}

// Export singleton instance
export const generationQueue = new GenerationQueue();
