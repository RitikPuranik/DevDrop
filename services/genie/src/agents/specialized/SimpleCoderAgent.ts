/**
 * SimpleCoderAgent - Fast code generation for HTML/Vanilla JS
 * Optimized for speed - lightweight prompt, minimal overhead
 * ULTRA-FAST: Designed for simple web apps and HTML projects
 */

import { AgentBuilder } from '@iqai/adk';
import { generationSchema } from '../../schemas/generation-schema';
import { SIMPLE_CODER_PROMPT } from '../../prompts/simple-coder-prompt';
import { withGitHubIntegration, enhancePromptWithGitHub } from '../../utils/agentGitHubIntegration';
import { createImageGenerationTool } from '../../tools/generation/imageGenerationTool';
import type { GitHubToolsContext } from '../../utils/githubTools';
import { JSON_ONLY_OUTPUT_INSTRUCTION } from '../../prompts/json-only-instruction';

interface SimpleCoderOptions {
  language?: string;
  requirements?: string;
  githubContext?: GitHubToolsContext | null;
  userId?: string;
}

export const SimpleCoderAgent = async (options?: SimpleCoderOptions) => {
  const startTime = Date.now();
  
  console.log('[SimpleCoderAgent] Fast mode - using lightweight prompt');
  
  // Use the ultra-lightweight prompt (no cache needed - it's already minimal)
  const systemPrompt = SIMPLE_CODER_PROMPT;
  
  // Escape curly braces
  const escapedPrompt = systemPrompt.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, '{{$1}}');
  
  // Enhance with GitHub tools if available
  const enhancedPrompt = enhancePromptWithGitHub(escapedPrompt, options?.githubContext || null);
  
  // CRITICAL: Add JSON-only instruction at the VERY END so model sees it last
  const finalPrompt = enhancedPrompt + '\n\n' + JSON_ONLY_OUTPUT_INSTRUCTION;
  
  const promptTime = Date.now() - startTime;
  console.log(`[SimpleCoderAgent] Prompt loaded: ${promptTime}ms (${finalPrompt.length} chars)`);
  
  let builder = AgentBuilder.create('SimpleCoderAgent')
    .withModel('gemini-2.5-flash')
    .withInstruction(finalPrompt)
    .withOutputSchema(generationSchema);
  
  // Add image generation tool if userId is available
  if (options?.userId) {
    const imageGenTool = createImageGenerationTool(options.userId);
    builder = builder.withTools(imageGenTool);
    console.log('[SimpleCoderAgent] Image generation tool enabled');
  }
  
  // Add GitHub tools if context is available
  builder = withGitHubIntegration(builder, {
    githubContext: options?.githubContext || null,
    agentName: 'SimpleCoderAgent'
  });
  
  const totalTime = Date.now() - startTime;
  console.log(`[SimpleCoderAgent] Total init: ${totalTime}ms`);
  
  return builder.build();
};
