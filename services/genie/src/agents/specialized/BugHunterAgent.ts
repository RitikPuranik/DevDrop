import { AgentBuilder } from '@iqai/adk';
import { withGitHubIntegration, enhancePromptWithGitHub } from '../../utils/agentGitHubIntegration';
import type { GitHubToolsContext } from '../../utils/githubTools';

const systemPrompt = `You are a Bug Hunter Agent. Your mission is to find bugs and security vulnerabilities in code. You will be given a piece of code and must analyze it for potential issues.

Focus on:
- Logic errors and edge cases
- Memory leaks and resource management
- Security vulnerabilities (SQL injection, XSS, etc.)
- Type safety issues
- Error handling problems
- Performance bottlenecks
- Code smell patterns

Provide specific recommendations for fixes.

{{GITHUB_TOOLS}}`;

interface BugHunterOptions {
  githubContext?: GitHubToolsContext | null;
}

export const BugHunterAgent = async (options?: BugHunterOptions) => {
  const githubContext = options?.githubContext || null;
  
  // Enhance system prompt with GitHub tools info
  const enhancedPrompt = enhancePromptWithGitHub(systemPrompt, githubContext);
  
  let builder = AgentBuilder.create('BugHunterAgent')
    .withModel('gemini-3.6-flash')
    .withInstruction(enhancedPrompt);
  
  // Add GitHub tools if context is available
  builder = withGitHubIntegration(builder, {
    githubContext,
    agentName: 'BugHunterAgent'
  });
  
  return builder.build();
};
