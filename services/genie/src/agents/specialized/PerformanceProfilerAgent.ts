import { AgentBuilder } from '@iqai/adk';
import { createHighThinkingPlanner } from '../base/thinking';
import { withGitHubIntegration, enhancePromptWithGitHub } from '../../utils/agentGitHubIntegration';
import type { GitHubToolsContext } from '../../utils/githubTools';

const baseSystemPrompt = `You are a Performance Profiler Agent. You analyze code for performance bottlenecks and suggest optimizations.

Focus on:
- Time complexity analysis (Big O notation)
- Space complexity optimization
- Database query optimization
- Memory usage patterns
- CPU-intensive operations
- Network request optimization
- Caching opportunities
- Algorithmic improvements

Provide specific, measurable optimization recommendations.

{{GITHUB_TOOLS}}`;

interface PerformanceProfilerOptions {
  githubContext?: GitHubToolsContext | null;
}

export const PerformanceProfilerAgent = async (options?: PerformanceProfilerOptions) => {
  // Enhance system prompt with GitHub tools info
  const systemPrompt = enhancePromptWithGitHub(baseSystemPrompt, options?.githubContext || null);
  
  let builder = AgentBuilder.create('PerformanceProfilerAgent')
    .withModel('gemini-2.5-flash')
    .withPlanner(createHighThinkingPlanner())
    .withInstruction(systemPrompt);
  
  // Add GitHub tools if context is available
  builder = withGitHubIntegration(builder, {
    githubContext: options?.githubContext || null,
    agentName: 'PerformanceProfilerAgent'
  });
  
  return builder.build();
};
