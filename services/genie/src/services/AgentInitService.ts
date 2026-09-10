/**
 * Agent Initialization Service
 * Preloads and warms up caches for faster agent creation
 */

import { getPromptCache } from '../utils/PromptCache';
import { getLanguagePrompt } from '../prompts/webcontainer-templates';
import { generateValidationPrompt, getAIChecklistPrompt } from '../services/validation/PreValidationRules';

/**
 * Preload common prompts and warm up caches
 */
export async function preloadAgentCaches(): Promise<void> {
  console.log('[AgentInit] Preloading agent caches...');
  const startTime = Date.now();

  const promptCache = getPromptCache();

  try {
    // Preload language prompts (most common: TypeScript)
    await promptCache.preload([
      {
        key: 'language:typescript',
        loader: () => getLanguagePrompt('typescript')
      },
      {
        key: 'validation:typescript',
        loader: () => generateValidationPrompt('typescript')
      },
      {
        key: 'checklist:ai',
        loader: () => getAIChecklistPrompt()
      },
      {
        key: 'language:html',
        loader: () => getLanguagePrompt('html')
      },
      {
        key: 'validation:html',
        loader: () => generateValidationPrompt('html')
      }
    ]);

    const elapsed = Date.now() - startTime;
    const stats = promptCache.getStats();
    
    console.log(`[AgentInit] ✓ Preloaded ${stats.entries} prompts (${stats.totalSizeKB} KB) in ${elapsed}ms`);
    console.log(`[AgentInit] ✓ Cache ready for fast agent initialization`);

  } catch (error) {
    console.error('[AgentInit] Failed to preload caches:', error);
    // Don't throw - app should still work without preloading
  }
}

/**
 * Get cache statistics for monitoring
 */
export function getAgentCacheStats() {
  const promptCache = getPromptCache();
  return {
    promptCache: promptCache.getStats(),
    timestamp: new Date()
  };
}
