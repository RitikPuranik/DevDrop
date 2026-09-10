import { Router } from 'express';
import { ChatMemoryManager } from '../../services/ChatMemoryManager';
import { chatQueue } from '../../services/ChatQueue';
import { supabase } from '../../storage/SupabaseClient';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { optionalAuth, AuthenticatedRequest } from '../middleware/supabaseAuth';

const router = Router();

// Validation schema for chat request
const chatRequestSchema = z.object({
  generationId: z.string().min(1, 'Generation ID is required'),
  message: z.string().min(1, 'Message is required'),
  currentFiles: z.array(z.object({
    path: z.string(),
    content: z.string()
  })).default([]), // Default to empty array if not provided
  language: z.string().optional(), // Let workflow auto-detect (vanilla HTML or TypeScript)
  imageUrls: z.array(z.string()).optional(),
  githubContext: z.object({
    token: z.string(),
    username: z.string(),
    email: z.string().optional(),
  }).optional(),
  backgroundMode: z.boolean().optional(), // NEW: Enable background processing
});

// POST /chat - Start a chat request as background job (returns immediately)
router.post('/chat', optionalAuth, async (req, res): Promise<void> => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }
    
    // Validate request body
    const validatedRequest = chatRequestSchema.parse(req.body);
    
    const { generationId, message, currentFiles, language, imageUrls, githubContext, backgroundMode } = validatedRequest;

    console.log(`[POST /chat] Processing message for generation ${generationId}`);
    console.log(`[POST /chat] Message: ${message.substring(0, 100)}...`);
    console.log(`[POST /chat] Current files: ${currentFiles.length}`);
    console.log(`[POST /chat] Background mode: ${backgroundMode ? 'ENABLED' : 'disabled'}`);
    if (githubContext) {
      console.log(`[POST /chat] GitHub context provided for user: ${githubContext.username}`);
    }

    // If background mode enabled, create job in database
    if (backgroundMode) {
      console.log('🚀 [POST /chat] Creating background job in database...');
      
      // Create NEW generation ID for background job (isolated from current chat)
      const backgroundGenerationId = randomUUID();
      console.log(`📦 Background job will use separate generation: ${backgroundGenerationId}`);
      
      // Create a generation record for the background job
      const { error: createError } = await supabase
        .from('generations')
        .insert({
          id: backgroundGenerationId,
          user_id: userId,
          prompt: message.slice(0, 500), // Store first part of message as prompt
          target_language: language,
          complexity: 'moderate',
          status: 'processing',
          files: currentFiles,
          created_at: new Date().toISOString(),
        });

      if (createError) {
        console.error('Failed to create background generation:', createError);
        res.status(500).json({
          success: false,
          error: 'Failed to create background job session',
        });
        return;
      }
      
      console.log(`✅ Created background generation ${backgroundGenerationId}`);
      
      // Create background job in database (using NEW generation ID)
      const { data: job, error: jobError } = await supabase
        .from('background_jobs')
        .insert({
          user_id: userId,
          session_id: backgroundGenerationId, // Use NEW generation ID
          type: 'agent_task',
          status: 'pending',
          user_message: message,
          context: {
            files: currentFiles.map(f => f.path),
            fileContents: currentFiles,
            language,
            imageUrls,
            githubContext,
          },
          progress: 0,
        })
        .select()
        .single();
      
      if (jobError || !job) {
        console.error('❌ Failed to create background job:', jobError);
        res.status(500).json({
          success: false,
          error: 'Failed to create background job',
        });
        return;
      }
      
      console.log(`📋 Background job created: ${job.id} → generation: ${backgroundGenerationId}`);
      
      // Store user message in the BACKGROUND generation (not current chat)
      const userMessageId = await ChatMemoryManager.storeMessage({
        generationId: backgroundGenerationId, // Use background generation ID
        role: 'user',
        content: message,
        imageUrls: imageUrls || [],
      });

      if (!userMessageId) {
        console.error('❌ Failed to store user message in background mode');
      } else {
        console.log(`✅ User message stored in background generation: ${userMessageId}`);
      }
      
      // Store system message to show in chat history (but exclude from agent context)
      // Using 'system' role so agents won't include it in conversation context
      const systemMessage = 'Your request is being processed in the background. You can continue chatting!';
      const systemMessageId = await ChatMemoryManager.storeMessage({
        generationId: backgroundGenerationId,
        role: 'system', // Changed to 'system' to avoid confusing agents
        content: systemMessage,
      });
      
      if (!systemMessageId) {
        console.error('❌ Failed to store system message in background mode');
      } else {
        console.log(`✅ System message stored in background generation: ${systemMessageId}`);
      }
      
      res.json({
        success: true,
        data: {
          jobId: job.id,
          generationId: backgroundGenerationId, // Return background generation ID
          status: 'pending',
          backgroundMode: true,
          message: systemMessage,
        },
      });
      return;
    }

    // Create unique job ID
    const jobId = randomUUID();
    
    console.log('[POST /chat] Creating chat job without complex routing...');

    // Ensure generation exists in DB before storing chat messages
    const { data: existingGeneration } = await supabase
      .from('generations')
      .select('id, user_id')
      .eq('id', generationId)
      .single();

    if (!existingGeneration) {
      console.warn(`⚠ Generation ${generationId} not found in DB, creating...`);
      
      // Create a generation record
      const { error: createError } = await supabase
        .from('generations')
        .insert({
          id: generationId,
          user_id: userId,
          prompt: message.slice(0, 500), // Store first part of first message as prompt
          target_language: language,
          complexity: 'moderate',
          status: 'completed',
          files: currentFiles,
          created_at: new Date().toISOString(),
        });

      if (createError) {
        console.error('Failed to create generation:', createError);
        throw new Error('Failed to create chat session');
      } else {
        console.log(`✅ Created generation ${generationId} with user_id: ${userId}`);
      }
    } else if (!existingGeneration.user_id || existingGeneration.user_id !== userId) {
      // Update user_id if it's missing or different
      console.log(`🔄 Updating generation ${generationId} with user_id: ${userId}`);
      const { error: updateError } = await supabase
        .from('generations')
        .update({ user_id: userId })
        .eq('id', generationId);
      
      if (updateError) {
        console.error('Failed to update generation user_id:', updateError);
      }
    } else {
      console.log(`✅ Generation ${generationId} exists in DB with correct user_id`);
    }

    console.log('💾 Storing user message via ChatMemoryManager...');
    const userMessageId = await ChatMemoryManager.storeMessage({
      generationId,
      role: 'user',
      content: message,
      imageUrls: imageUrls || [],
    });

    if (!userMessageId) {
      console.error('❌ Failed to store user message');
      throw new Error('Failed to store user message');
    }
    
    console.log(`✅ User message stored: ${userMessageId}`);

    // Store job in database
    const { error: jobError } = await supabase
      .from('chat_jobs')
      .insert({
        id: jobId,
        generation_id: generationId,
        user_id: userId,
        message,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

    if (jobError) {
      console.error('[POST /chat] Failed to create job in database:', jobError);
      // Continue anyway, chatQueue has its own storage
    }

    // Enqueue the chat job for background processing
    // ChatAgent will decide if code generation is needed
    await chatQueue.enqueue({
      id: jobId,
      generationId,
      userId,
      message,
      currentFiles,
      ...(language && { language }), // Only include if provided
      imageUrls,
      githubContext,
    } as any); // Type assertion since language is optional

    console.log(`[POST /chat] Job ${jobId} enqueued, ChatAgent will handle routing`);

    // Return immediately with job ID
    res.json({
      success: true,
      data: {
        jobId,
        status: 'pending',
        message: 'Chat request queued. Use job ID to check status.',
      },
    });
    return;
  } catch (error: any) {
    console.error('Chat error:', error);
    
    // Handle validation errors
    if (error.name === 'ZodError') {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
      return;
    }

    // Handle other errors
    res.status(500).json({
      success: false,
      error: error.message || 'Chat request failed',
    });
    return;
  }
});

// GET /chat/:jobId - Get chat job status and result
router.get('/chat/:jobId', optionalAuth, async (req, res): Promise<void> => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }
    
    const { jobId } = req.params;

    const job = await chatQueue.getJob(jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Chat job not found or expired',
      });
      return;
    }
    
    // Check ownership
    if (job.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'You do not have permission to view this chat job',
      });
      return;
    }

    // Return job status
    const responseData: any = {
      success: true,
      data: {
        jobId: job.id,
        generationId: job.generationId,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    };

    // Include result if completed
    if (job.status === 'completed' && job.result) {
      // Validate that files are properly formatted before sending
      try {
        if (job.result.files && Array.isArray(job.result.files)) {
          // Ensure all files have valid path and content
          const validatedFiles = job.result.files.map((file: any) => {
            if (!file.path || typeof file.path !== 'string') {
              throw new Error('Invalid file path');
            }
            if (file.content === undefined || file.content === null) {
              throw new Error(`File ${file.path} has no content`);
            }
            if (typeof file.content !== 'string') {
              return {
                path: file.path,
                content: JSON.stringify(file.content, null, 2)
              };
            }
            return {
              path: file.path,
              content: file.content
            };
          });
          
          responseData.data.files = validatedFiles;
        }
      } catch (validationError: any) {
        console.error('[ChatRoute] File validation error:', validationError);
        responseData.data.error = `File validation failed: ${validationError.message}`;
        responseData.data.status = 'error';
        delete responseData.data.files;
      }
      
      responseData.data.agentThought = {
        agent: 'ChatAgent',
        thought: job.result.summary || 'Changes applied successfully',
      };
    }

    // Include error if failed
    if (job.status === 'error') {
      responseData.data.error = job.error;
    }

    // Final validation: ensure response is JSON-serializable
    try {
      JSON.stringify(responseData);
    } catch (jsonError: any) {
      console.error('[ChatRoute] Response is not JSON-serializable:', jsonError);
      res.status(500).json({
        success: false,
        error: 'Internal server error: Invalid response format',
      });
      return;
    }

    res.json(responseData);
    return;
  } catch (error: any) {
    console.error('Error fetching chat job:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch chat job',
    });
    return;
  }
});

export default router;
