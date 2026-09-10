/**
 * ChatQueue - Manages chat requests as background jobs to avoid Heroku 30s timeout
 * Similar to GenerationQueue pattern
 */

import { ChatAgent } from '../agents/specialized/ChatAgent';
import { ChatMemoryManager } from './ChatMemoryManager';
import { supabase } from '../storage/SupabaseClient';
import { safeAgentCall } from '../utils/agentHelpers';
import { safeAgentCallWithStreaming, type ProgressUpdate } from '../utils/agentStreamingHelpers';
import { cleanFiles } from '../utils/contentCleaner';
import { fetchMultipleFilesAsBase64 } from '../utils/fileProcessing';
import JobEventEmitter from './JobEventEmitter';

interface ChatJob {
  id: string;
  generationId: string;
  userId: string;
  message: string;
  currentFiles: Array<{ path: string; content: string }>;
  language?: string; // Optional - let workflow auto-detect
  imageUrls?: string[];
  githubContext?: {
    token: string;
    username: string;
    email?: string;
  };
  specialistAgent?: string; // Force routing to specific agent (e.g., 'CodeModification')
  errorContext?: string; // Detailed error information for error fixing tasks
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: {
    files?: Array<{ path: string; content: string }>; // Optional - not present for conversational/review responses
    summary: string;
    repoCreated?: {
      owner: string;
      name: string;
      url: string;
    };
    prCreated?: {
      number: number;
      url: string;
      title: string;
    };
  };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

class ChatQueueManager {
  private queue: ChatJob[] = [];
  private processingJobs = new Set<string>(); // Track jobs being processed (allow concurrent processing)

  /**
   * Enqueue a chat request - saves to Supabase
   */
  async enqueue(params: {
    id: string;
    generationId: string;
    userId: string;
    message: string;
    currentFiles: Array<{ path: string; content: string }>;
    language?: string; // Optional - let workflow auto-detect
    imageUrls?: string[];
    githubContext?: {
      token: string;
      username: string;
      email?: string;
    };
    specialistAgent?: string; // Force routing to specific agent
    errorContext?: string; // Detailed error information for error fixing
  }): Promise<void> {
    console.log(`[ChatQueue] Creating chat job ${params.id} in database...`);
    
    // Check if job already exists
    const { data: existingJob } = await supabase
      .from('chat_jobs')
      .select('id, status')
      .eq('id', params.id)
      .single();
    
    if (existingJob) {
      console.log(`[ChatQueue] Job ${params.id} already exists with status: ${existingJob.status}`);
      
      // If job is already pending, check if it's in our queue
      if (existingJob.status === 'pending') {
        const inQueue = this.queue.some(j => j.id === params.id);
        if (inQueue) {
          console.log(`[ChatQueue] Job ${params.id} already in queue, skipping`);
          return;
        }
        // Job exists in DB but not in queue, load it
        console.log(`[ChatQueue] Job ${params.id} exists in DB but not in queue, adding to queue`);
        const job: ChatJob = {
          id: params.id,
          generationId: params.generationId,
          userId: params.userId,
          message: params.message,
          currentFiles: params.currentFiles,
          language: params.language,
          imageUrls: params.imageUrls,
          githubContext: params.githubContext,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.queue.push(job);
        
        // Start processing immediately (non-blocking, allows concurrent jobs)
        this.processQueue();
        return;
      }
      
      // If already processing, skip
      if (existingJob.status === 'processing') {
        console.log(`[ChatQueue] Job ${params.id} is already being processed, skipping`);
        return;
      }
      
      // If completed/error, delete and recreate
      console.log(`[ChatQueue] Job ${params.id} status is ${existingJob.status}, recreating`);
      await supabase.from('chat_jobs').delete().eq('id', params.id);
    }
    
    // Save to database
    const { error: dbError } = await supabase
      .from('chat_jobs')
      .insert({
        id: params.id,
        generation_id: params.generationId,
        user_id: params.userId,
        message: params.message,
        current_files: params.currentFiles,
        language: params.language,
        image_urls: params.imageUrls || [],
        status: 'pending',
      });
    
    if (dbError) {
      console.error(`[ChatQueue] Failed to create chat job in database:`, dbError);
      throw new Error('Failed to create chat job');
    }

    const job: ChatJob = {
      id: params.id,
      generationId: params.generationId,
      userId: params.userId,
      message: params.message,
      currentFiles: params.currentFiles,
      language: params.language,
      imageUrls: params.imageUrls,
      githubContext: params.githubContext,
      specialistAgent: params.specialistAgent, // Add specialist agent
      errorContext: params.errorContext, // Add error context
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.queue.push(job);
    
    console.log(`[ChatQueue] Enqueued chat job ${params.id} for generation ${params.generationId}${params.specialistAgent ? ` (force route to ${params.specialistAgent})` : ''}${params.errorContext ? ' with error context' : ''}`);

    // Start processing immediately (allows concurrent jobs)
    this.processQueue();
  }

  /**
   * Get job by ID from database
   */
  async getJob(id: string): Promise<ChatJob | null> {
    const { data, error } = await supabase
      .from('chat_jobs')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return {
      id: data.id,
      generationId: data.generation_id,
      userId: data.user_id,
      message: data.message,
      currentFiles: data.current_files,
      language: data.language,
      imageUrls: data.image_urls,
      status: data.status,
      result: data.result,
      error: data.error,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  /**
   * Process queue - now supports concurrent job processing
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    // Process all pending jobs concurrently
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      // Skip if already processing this job
      if (this.processingJobs.has(job.id)) {
        console.log(`[ChatQueue] Job ${job.id} already being processed, skipping`);
        continue;
      }

      // Process job in background (non-blocking)
      this.processingJobs.add(job.id);
      this.processJob(job)
        .then(() => {
          this.processingJobs.delete(job.id);
          console.log(`[ChatQueue] Job ${job.id} completed, ${this.processingJobs.size} jobs still processing`);
        })
        .catch((error) => {
          this.processingJobs.delete(job.id);
          console.error(`[ChatQueue] Job ${job.id} failed:`, error);
        });
    }
  }

  /**
   * Emit progress update for realtime frontend tracking
   */
  private async emitProgress(jobId: string, agent: string, status: 'started' | 'processing' | 'completed' | 'error', message: string): Promise<void> {
    try {
      const progressMessage = {
        timestamp: new Date().toISOString(),
        agent,
        status,
        message,
      };

      // Fetch current progress messages and userId
      const { data: job } = await supabase
        .from('chat_jobs')
        .select('progress_messages, user_id')
        .eq('id', jobId)
        .single();

      const currentMessages = job?.progress_messages || [];
      const updatedMessages = [...currentMessages, progressMessage];

      // Update with new progress message
      await supabase
        .from('chat_jobs')
        .update({ progress_messages: updatedMessages })
        .eq('id', jobId);

      // Log with better formatting for function calls
      let logMessage = `[ChatQueue Progress] ${agent} - ${status}: ${message}`;
      
      // Add better formatting for tool-related messages
      if (message.includes('🔧') || message.includes('Tool') || message.includes('Calling')) {
        logMessage = `[ChatQueue Progress] ${agent} - 🔧 FUNCTION CALL: ${message}`;
      } else if (message.includes('✅') || message.includes('Result') || message.includes('Found')) {
        logMessage = `[ChatQueue Progress] ${agent} - ✅ RESULT: ${message}`;
      } else if (message.includes('💭') || message.includes('Thought') || message.includes('Analyzing')) {
        logMessage = `[ChatQueue Progress] ${agent} - 💭 THINKING: ${message}`;
      }
      
      console.log(logMessage);
      
      // 🔔 Emit realtime Socket.IO event
      if (job?.user_id) {
        JobEventEmitter.emitChatProgress(job.user_id, jobId, updatedMessages);
      }
    } catch (error) {
      console.error('[ChatQueue Progress] Failed to emit:', error);
    }
  }

  /**
   * Emit fake progress updates for GitHubAgent to simulate routing to other agents
   * Makes the UI look like GitHubAgent is orchestrating multiple agents
   * Keep it simple: ChatAgent → GitHubAgent → 1 specialist agent
   */
  /**
   * Process a single chat job
   */
  private async processJob(job: ChatJob): Promise<void> {
    console.log(`[ChatQueue] Processing chat job ${job.id}...`);
    
    try {
      // Update status in database
      job.status = 'processing';
      job.updatedAt = new Date();
      
      await supabase
        .from('chat_jobs')
        .update({
          status: 'processing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // Check if specialist agent is forced (skip ChatAgent routing)
      let specialistAgent = job.specialistAgent;
      let needsSpecialist = !!specialistAgent;
      
      if (!specialistAgent) {
        // No forced agent, use ChatAgent to determine routing
        await this.emitProgress(job.id, 'ChatAgent', 'started', 'Analyzing your request and determining the best approach');

        // Build context with conversation history
        const { contextMessage, totalTokens, historyImageUrls } = await ChatMemoryManager.buildContext(
          job.generationId,
          job.message,
          job.currentFiles,
          job.language,
          job.imageUrls
        );

        console.log(`[ChatQueue] Chat context built: ${totalTokens} estimated tokens`);

        // Log GitHub context status
        if (job.githubContext) {
          console.log(`[ChatQueue] GitHub context available for user: ${job.githubContext.username}`);
        } else {
          console.log(`[ChatQueue] No GitHub context provided`);
        }

        // Use ChatAgent with improved error handling and GitHub context
        const { runner } = await ChatAgent(job.githubContext);
        
        // Build the message with images/files if provided
        // Combine current files with files from conversation history
        const allFileUrls = [...(job.imageUrls || []), ...historyImageUrls];
        let chatMessage: any;
        
        if (allFileUrls.length > 0) {
          console.log(`[ChatQueue] Including ${allFileUrls.length} file(s) (${job.imageUrls?.length || 0} current + ${historyImageUrls.length} from history)`);
          
          // Download files and separate images from documents
          const { imageParts, textContent } = await fetchMultipleFilesAsBase64(allFileUrls, 'ChatQueue');
          
          if (imageParts.length === 0 && !textContent) {
            console.warn(`[ChatQueue] ⚠️ WARNING: No valid files could be loaded, proceeding without attachments`);
            chatMessage = contextMessage;
          } else {
            // Build message with text, document content, and images
            const fullTextContent = contextMessage + textContent;
            const textPart = { text: fullTextContent };
            
            if (imageParts.length > 0) {
              chatMessage = { parts: [textPart, ...imageParts] };
              console.log(`[ChatQueue] Built multipart message with ${imageParts.length} image(s) and document text`);
            } else {
              chatMessage = fullTextContent;
              console.log(`[ChatQueue] Built text-only message with document content`);
            }
          }
        } else {
          chatMessage = contextMessage;
        }

        // Use safe agent call with automatic retry and validation
        const response = await safeAgentCall(runner, chatMessage, {
          maxRetries: 3,
          retryDelay: 1000,
          context: 'ChatQueue'
        }) as any; // Cast to any to access githubOperation field
        
        // Debug: Log the full response to see what ChatAgent returned
        console.log(`[ChatQueue] ChatAgent raw response:`, JSON.stringify({
          needsSpecialist: response.needsSpecialist,
          specialistAgent: response.specialistAgent,
          summary: response.summary?.substring(0, 200),
          hasFiles: !!response.files,
          filesCount: response.files?.length || 0
        }, null, 2));
        
        // Validate response format
        if (response.files && response.files.length > 0) {
          // Check if this is a legitimate GitHub fetch operation (not code generation)
          const isGitHubFetch = response.summary && 
                               (response.summary.toLowerCase().includes('fetched') || 
                                response.summary.toLowerCase().includes('pulled') ||
                                response.summary.toLowerCase().includes('files from'));
          
          if (isGitHubFetch) {
            console.log(`[ChatQueue] ✅ ChatAgent returned files from github_fetch_all_files tool - this is valid!`);
            console.log(`[ChatQueue] Files will be returned directly to frontend for preview`);
            needsSpecialist = false;
            specialistAgent = '';
          } else {
            console.warn(`[ChatQueue] ⚠️ WARNING: ChatAgent returned files array but not from GitHub fetch!`);
            console.warn(`[ChatQueue] ChatAgent should only route to specialists for code generation.`);
            // Force routing to appropriate specialist based on content
            needsSpecialist = true;
            specialistAgent = 'CodeModification'; // Default fallback
            console.log(`[ChatQueue] Forcing route to ${specialistAgent} due to unexpected files in response`);
          }
        } else {
          // Check if ChatAgent determined a specialist is needed
          needsSpecialist = response.needsSpecialist || false;
          specialistAgent = response.specialistAgent || '';
          
          // Additional validation: if summary mentions "route to" but missing fields
          if (response.summary && 
              (response.summary.toLowerCase().includes('route to') || 
               response.summary.toLowerCase().includes('routing to') ||
               response.summary.toLowerCase().includes("i'll route")) && 
              (!needsSpecialist || !specialistAgent)) {
            console.warn(`[ChatQueue] ⚠️ WARNING: ChatAgent summary mentions routing but missing needsSpecialist/specialistAgent!`);
            console.warn(`[ChatQueue] Summary: ${response.summary}`);
            
            // Try to extract agent name from summary
            const agentMatch = response.summary.match(/(?:route to|routing to)\s+(\w+)/i);
            if (agentMatch) {
              specialistAgent = agentMatch[1];
              needsSpecialist = true;
              console.log(`[ChatQueue] Extracted agent name from summary: ${specialistAgent}`);
            } else {
              // Force routing to appropriate specialist
              needsSpecialist = true;
              specialistAgent = 'ComplexCoder'; // Default fallback for code requests
              console.log(`[ChatQueue] Forcing route to ${specialistAgent} due to incomplete routing response`);
            }
          }
        }
        
        console.log(`[ChatQueue] Final routing decision:`, {
          needsSpecialist,
          specialistAgent,
          willRoute: needsSpecialist && specialistAgent
        });
        
        // If no specialist needed, handle as conversational response or simple code generation
        if (!needsSpecialist) {
          console.log(`[ChatQueue] No specialist needed - handling as conversational response`);
          
          // Check if this is a conversational response (no files) or code changes
          const hasFiles = response.files && response.files.length > 0;
          const isConversational = !hasFiles;
          
          // Check if this is a GitHub fetch operation
          const isGitHubFetch = response.summary && 
                               (response.summary.toLowerCase().includes('fetched') || 
                                response.summary.toLowerCase().includes('pulled') ||
                                response.summary.toLowerCase().includes('files from'));
          
          // Additional check: if user message looks like a code request, this might be an error
          // BUT: Don't warn for GitHub fetch operations - those are legitimate
          if (!isGitHubFetch) {
            const codeKeywords = ['create', 'build', 'generate', 'add', 'fix', 'update', 'modify', 'write', 'implement'];
            const userWantsCode = codeKeywords.some(keyword => 
              job.message.toLowerCase().includes(keyword)
            );
            
            if (userWantsCode && isConversational) {
              console.warn(`[ChatQueue] ⚠️ POTENTIAL ROUTING ERROR:`);
              console.warn(`[ChatQueue] User message appears to request code: "${job.message.substring(0, 100)}"`);
              console.warn(`[ChatQueue] But ChatAgent returned conversational response without routing`);
              console.warn(`[ChatQueue] This might indicate ChatAgent failed to properly route the request`);
            }
          }
          
          let updatedFiles: Array<{ path: string; content: string }> = [...job.currentFiles];
          
          if (hasFiles && response.files) {
            if (isGitHubFetch) {
              // For GitHub fetch, return the files directly (don't merge with current files)
              console.log(`[ChatQueue] GitHub fetch detected - returning fetched files directly`);
              updatedFiles = response.files as Array<{ path: string; content: string }>;
            } else {
              // Merge modified/new files with existing files
              const responseFilesMap = new Map<string, { path: string; content: string }>(
                response.files.map((f: any) => [f.path, f as { path: string; content: string }])
              );
              
              updatedFiles = job.currentFiles.map(originalFile => {
                const modifiedFile = responseFilesMap.get(originalFile.path);
                if (modifiedFile) {
                  responseFilesMap.delete(originalFile.path);
                  return modifiedFile;
                }
                return originalFile;
              });
              
              responseFilesMap.forEach((newFile: { path: string; content: string }) => {
                updatedFiles.push(newFile);
              });
            }
          }

          // Store assistant response in memory
          await ChatMemoryManager.storeMessage({
            generationId: job.generationId,
            role: 'assistant',
            content: response.summary || 'Applied requested changes to the codebase',
            metadata: {
              filesModified: response.files?.length || 0,
              isConversational,
              isGitHubFetch,
            },
          });

          // Update job with result in database
          job.status = 'completed';
          job.result = {
            // For GitHub fetch or file changes, include files
            // For conversational, don't include files (would clear workspace)
            ...(isConversational && !isGitHubFetch ? {} : { files: updatedFiles }),
            summary: response.summary || (isConversational ? 'Chat response' : 'Applied requested changes to the codebase'),
          };
          job.updatedAt = new Date();

          await supabase
            .from('chat_jobs')
            .update({
              status: 'completed',
              result: job.result,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);

          // Only reset deployment status if there were file changes
          if (!isConversational) {
            console.log(`[ChatQueue] Resetting deployment status for generation ${job.generationId}`);
            await supabase
              .from('generations')
              .update({
                deployment_status: 'pending',
                files: updatedFiles,
              })
              .eq('id', job.generationId);
          } else {
            console.log(`[ChatQueue] Conversational response only, no file changes`);
          }

          // 🔔 Emit realtime completion event for conversational responses
          JobEventEmitter.emitComplete(job.userId, {
            jobId: job.id,
            sessionId: job.generationId,
            success: true,
            result: job.result,
            timestamp: new Date().toISOString(),
          });

          console.log(`[ChatQueue] Chat job ${job.id} completed successfully`);
          return;
        }
      } else {
        console.log(`[ChatQueue] Specialist agent forced: ${specialistAgent}, skipping ChatAgent routing`);
      }
      
      // Handle specialist agent routing
      if (needsSpecialist && specialistAgent) {
        // Normalize agent names to handle variations
        const agentNameMap: Record<string, string> = {
          'DocsWeaver': 'DocWeaver',  // Fix common typo
          'DocWeaverAgent': 'DocWeaver',
          'CodeGeneratorAgent': 'CodeGenerator',  // Legacy support
          'CodeGenerator': 'CodeGenerator',  // Map to SimpleCoder/ComplexCoder in workflow
          'SimpleCoderAgent': 'SimpleCoder',
          'ComplexCoderAgent': 'ComplexCoder',
          'CodeModificationAgent': 'CodeModification',
          'TestCrafterAgent': 'TestCrafter',
          'SecuritySentinelAgent': 'SecuritySentinel',
          'PerformanceProfilerAgent': 'PerformanceProfiler',
          'BugHunterAgent': 'BugHunter',
        };
        
        if (agentNameMap[specialistAgent]) {
          console.log(`[ChatQueue] Normalizing agent name: ${specialistAgent} → ${agentNameMap[specialistAgent]}`);
          specialistAgent = agentNameMap[specialistAgent];
        }
        if (agentNameMap[specialistAgent]) {
          console.log(`[ChatQueue] Normalizing agent name: ${specialistAgent} → ${agentNameMap[specialistAgent]}`);
          specialistAgent = agentNameMap[specialistAgent];
        }
        
        console.log(`[ChatQueue] Routing to specialist: ${specialistAgent}`);
        await this.emitProgress(job.id, 'ChatAgent', 'completed', `Routing your request to ${specialistAgent}`);
        
        // Handle GitHubAgent separately (doesn't use workflows)
        if (specialistAgent === 'GitHubAgent') {
          // GitHubAgent now uses bot token - no user token required!
          // User token is only passed if available (for fallback scenarios)
          
          await this.emitProgress(job.id, 'GitHubAgent', 'started', 'Analyzing GitHub operation requirements');
          
          // Build context with conversation history for GitHubAgent
          const { contextMessage } = await ChatMemoryManager.buildContext(
            job.generationId,
            job.message,
            job.currentFiles,
            job.language,
            job.imageUrls
          );
          
          // ⚠️ REMOVED FAKE PROGRESS - Now using REAL agent thoughts!
          // await this.emitFakeGitHubProgress(job.id, job.message);
          
          const { GitHubAgent } = await import('../agents/specialized/GitHubAgent');
          // Pass session context to enable state tracking and duplicate prevention
          const builtAgent = await GitHubAgent(
            job.githubContext,
            job.generationId, // sessionId
            job.id,            // jobId
            job.userId,        // userId
            job.message        // taskDescription
          );
          
          // Use streaming API to get real-time agent thoughts with timeout (10 minutes max)
          const GITHUB_AGENT_TIMEOUT = 10 * 60 * 1000; // 10 minutes
          
          const responsePromise = safeAgentCallWithStreaming(builtAgent, contextMessage, {
            maxRetries: 3,
            retryDelay: 1000,
            context: 'ChatQueue/GitHubAgent',
            onProgress: async (update: ProgressUpdate) => {
              // Emit real-time progress based on update type with detailed logging
              switch (update.type) {
                case 'thought':
                  // Agent's reasoning/analysis
                  console.log(`[ChatQueue/GitHubAgent] 💭 Agent Thought: ${update.content.substring(0, 150)}`);
                  await this.emitProgress(job.id, 'GitHubAgent', 'processing', `💭 ${update.content}`);
                  break;
                  
                case 'tool_call':
                  // Tool being invoked
                  console.log(`[ChatQueue/GitHubAgent] 🔧 Tool Called: ${update.content.substring(0, 150)}`);
                  const toolName = update.toolName || 'unknown_tool';
                  await this.emitProgress(job.id, 'GitHubAgent', 'processing', `🔧 Calling: ${toolName}\n${update.content}`);
                  break;
                  
                case 'tool_result':
                  // Tool result received
                  console.log(`[ChatQueue/GitHubAgent] ✅ Tool Result: ${update.content.substring(0, 150)}`);
                  await this.emitProgress(job.id, 'GitHubAgent', 'processing', `✅ ${update.content}`);
                  break;
                  
                case 'error':
                  // Error occurred
                  console.error(`[ChatQueue/GitHubAgent] ❌ Error: ${update.content}`);
                  await this.emitProgress(job.id, 'GitHubAgent', 'error', `❌ ${update.content}`);
                  break;
              }
            }
          });
          
          // Add timeout wrapper to prevent agent from running indefinitely
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error(`GitHubAgent timeout after ${GITHUB_AGENT_TIMEOUT / 1000}s - Agent took too long to complete. This usually happens when the agent gets stuck in a loop or the task is too complex.`));
            }, GITHUB_AGENT_TIMEOUT);
          });
          
          const response = await Promise.race([responsePromise, timeoutPromise]) as any;
          
          // 🚨 CRITICAL: Ignore "files" field if PR was created
          // Agent sometimes incorrectly returns files when creating PRs
          // Files should ONLY be returned when user asks to "fetch" or "read" files
          const isPROperation = response.prCreated || response.branchCreated || response.filesModified;
          const shouldIgnoreFiles = isPROperation && response.files && response.files.length > 0;
          
          if (shouldIgnoreFiles) {
            console.log(`[ChatQueue] ⚠️ Ignoring ${response.files.length} files in response (PR operation detected)`);
            response.files = null; // Clear files to prevent overwriting generation
          }
          
          // Check if GitHubAgent fetched files (for preview/import)
          const hasFetchedFiles = response.files && response.files.length > 0;
          
          // Post-process fetched files: unescape newlines and clean content
          let updatedFiles = hasFetchedFiles ? cleanFiles(response.files) : job.currentFiles;
          
          if (hasFetchedFiles) {
            console.log(`[ChatQueue] Cleaned ${updatedFiles.length} fetched files (unescaped newlines)`);
          }
          
          // Build enhanced summary with repo link if created
          let enhancedSummary = response.summary || 'GitHub operation completed';
          if (response.repoCreated) {
            enhancedSummary += `\n\n🔗 **Repository created:** [${response.repoCreated.owner}/${response.repoCreated.name}](${response.repoCreated.url})`;
          }
          
          // Store response in memory
          await ChatMemoryManager.storeMessage({
            generationId: job.generationId,
            role: 'assistant',
            content: enhancedSummary,
            metadata: {
              filesModified: response.filesModified || 0,
              prCreated: response.prCreated || false,
              branchCreated: response.branchCreated || false,
              repoCreated: response.repoCreated || false,
              filesFetched: hasFetchedFiles ? updatedFiles.length : 0,
            },
          });
          
          // Update generation files if GitHubAgent fetched new files
          if (hasFetchedFiles) {
            console.log(`[ChatQueue] Updating generation with ${updatedFiles.length} cleaned files`);
            await supabase
              .from('generations')
              .update({
                files: updatedFiles, // Use cleaned files
                deployment_status: 'pending', // Allow preview to be generated
              })
              .eq('id', job.generationId);
          }
          
          // Update job as completed
          job.status = 'completed';
          job.result = {
            files: updatedFiles, // Use fetched files if available
            summary: enhancedSummary,
            repoCreated: response.repoCreated, // Include repo details in result
            prCreated: response.prCreated, // Include PR details in result
          };
          job.updatedAt = new Date();
          
          await supabase
            .from('chat_jobs')
            .update({
              status: 'completed',
              result: job.result,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);
          
          // Emit final completion message with repo link if created
          let finalMessage = response.summary || 'GitHub operation completed successfully ✓';
          if (response.repoCreated) {
            finalMessage = `Repository created successfully! View it at: ${response.repoCreated.url}`;
          } else if (response.prCreated) {
            finalMessage = `Pull request #${response.prCreated.number} created successfully! View it at: ${response.prCreated.url}`;
          }
          await this.emitProgress(job.id, 'GitHubAgent', 'completed', finalMessage);
          
          // 🔔 Emit final complete event so frontend shows full response
          JobEventEmitter.emitComplete(job.userId, {
            jobId: job.id,
            sessionId: job.generationId, // Use generationId as sessionId
            success: true,
            result: job.result,
            timestamp: new Date().toISOString(),
          });
          
          console.log(`[ChatQueue] GitHubAgent completed for job ${job.id}, emitted complete event`);
          return;
        }
        
        // Determine which workflow to use based on the agent
        const reviewAgents = ['BugHunter', 'SecuritySentinel', 'PerformanceProfiler', 'CodeReview'];
        const isReviewWorkflow = reviewAgents.includes(specialistAgent);
        
        // Build context with conversation history for specialist agents
        const { contextMessage } = await ChatMemoryManager.buildContext(
          job.generationId,
          job.message,
          job.currentFiles,
          job.language,
          job.imageUrls
        );
        
        console.log(`[ChatQueue] Built conversation context for ${specialistAgent}`);
        
        let workflowResult: any;
        
        if (isReviewWorkflow) {
          // Route to ReviewWorkflow for code analysis
          await this.emitProgress(job.id, specialistAgent, 'started', `Starting code review process...`);
          
          const { ReviewWorkflow } = await import('../workflows/ReviewWorkflow');
          
          // Map specialist agent to review options
          // If specialistAgent is 'CodeReview', run ALL review agents in parallel
          const reviewOptions = {
            checkBugs: specialistAgent === 'BugHunter' || specialistAgent === 'CodeReview',
            checkSecurity: specialistAgent === 'SecuritySentinel' || specialistAgent === 'CodeReview',
            checkPerformance: specialistAgent === 'PerformanceProfiler' || specialistAgent === 'CodeReview',
            checkStyle: specialistAgent === 'CodeReview', // Only for comprehensive review
          };
          
          console.log(`[ChatQueue] Review options:`, reviewOptions);
          
          // Create workflow with progress callback
          const workflow = new ReviewWorkflow({
            githubContext: job.githubContext, // Pass GitHub context to ReviewWorkflow
            onProgress: (agent: string, status: string, message: string) => {
              // Emit progress for each individual review agent
              const mappedStatus = status === 'completed' ? 'completed' as const : 
                                   status === 'error' ? 'error' as const : 
                                   status === 'started' ? 'started' as const : 
                                   'processing' as const;
              this.emitProgress(job.id, agent, mappedStatus, message);
            }
          });
          
          workflowResult = await workflow.run({
            code: job.currentFiles,
            language: job.language, // Optional - will auto-detect if undefined
            options: reviewOptions,
          });
        } else {
          // Route to GenerateWorkflow for code generation/modification
          const { GenerateWorkflow } = await import('../workflows/GenerateWorkflow');
          const workflow = new GenerateWorkflow({
            githubContext: job.githubContext,
            jobId: job.id, // Pass job ID for progress tracking
            userId: job.userId // Pass user ID for Socket.IO events
          });
          
          workflowResult = await workflow.run({
            prompt: contextMessage, // Use context message instead of raw message
            projectContext: '',
            ...(job.language && { targetLanguage: job.language }), // Only include if provided, let workflow auto-detect otherwise
            complexity: 'moderate',
            agents: [specialistAgent],
            imageUrls: job.imageUrls,
            currentFiles: job.currentFiles || [], // Pass existing files for doc-only requests
            errorContext: job.errorContext, // Pass error context for better fixes
            userId: job.userId, // CRITICAL: Pass userId for image generation tool
          });
        }
        
        // Format the result based on workflow type
        let jobResult: { files: any[]; summary: string; agent?: string; suggestions?: string[] };
        
        if (isReviewWorkflow) {
          // ReviewWorkflow returns { findings, summary, agentsInvolved, overallScore }
          // Use the full summary which now includes detailed findings
          const reviewSummary = workflowResult.summary || 'Code review completed';
          
          // For CodeReview (comprehensive), show which agents were involved
          const agentLabel = specialistAgent === 'CodeReview' 
            ? `CodeReview (${workflowResult.agentsInvolved?.join(', ') || 'Multiple Agents'})`
            : specialistAgent;
          
          jobResult = {
            // 🐛 FIX: Don't include files field at all for review (not even empty array)
            // Empty array would cause frontend to clear workspace files
            files: undefined as any, // TypeScript workaround - will be omitted in JSON
            summary: reviewSummary, // Use full detailed summary
            agent: agentLabel,
            suggestions: workflowResult.findings?.slice(0, 3).map((f: any) => 
              `${f.severity}: ${f.message}${f.file ? ` in ${f.file}` : ''}`
            ),
          };
          
          // Remove undefined files property to avoid sending it to frontend
          delete (jobResult as any).files;
        } else {
          // GenerateWorkflow returns { files, summary, ... }
          jobResult = {
            files: workflowResult.files || [],
            summary: workflowResult.summary || 'Request completed successfully',
            agent: specialistAgent,
          };
        }
        
        // Store the workflow result
        job.status = 'completed';
        job.result = jobResult;
        job.updatedAt = new Date();
        
        await supabase
          .from('chat_jobs')
          .update({
            status: 'completed',
            result: job.result,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        
        // 🔔 Emit realtime completion event
        JobEventEmitter.emitComplete(job.userId, {
          jobId: job.id,
          sessionId: job.generationId,
          success: true,
          result: job.result,
          timestamp: new Date().toISOString(),
        });
        
        // Update generation with new files (only if files were generated)
        if (!isReviewWorkflow && workflowResult.files && workflowResult.files.length > 0) {
          await supabase
            .from('generations')
            .update({
              deployment_status: 'pending',
              files: workflowResult.files,
              target_language: workflowResult.language, // Update detected language
            })
            .eq('id', job.generationId);
        }
        
        // Store assistant response in memory for specialist agents
        await ChatMemoryManager.storeMessage({
          generationId: job.generationId,
          role: 'assistant',
          content: jobResult.summary,
          metadata: {
            agent: specialistAgent,
            filesModified: jobResult.files?.length || 0,
            isReviewWorkflow,
            suggestions: jobResult.suggestions,
          },
        });
        
        console.log(`[ChatQueue] Chat job ${job.id} completed via ${isReviewWorkflow ? 'ReviewWorkflow' : 'GenerateWorkflow'} (${specialistAgent})`);
        return;
      }

    } catch (error: any) {
      console.error(`[ChatQueue] Chat job ${job.id} failed:`, error);
      
      job.status = 'error';
      job.error = error.message || 'Chat processing failed';
      job.updatedAt = new Date();

      await supabase
        .from('chat_jobs')
        .update({
          status: 'error',
          error: job.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      
      // 🔔 Emit realtime error event
      JobEventEmitter.emitComplete(job.userId, {
        jobId: job.id,
        sessionId: job.generationId,
        success: false,
        error: job.error,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export const chatQueue = new ChatQueueManager();
