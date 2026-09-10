import { AgentBuilder } from '@iqai/adk';
import { createHighThinkingPlanner } from '../base/thinking';
import { withGitHubIntegration, enhancePromptWithGitHub } from '../../utils/agentGitHubIntegration';
import type { GitHubToolsContext } from '../../utils/githubTools';

const baseSystemPrompt = `You are a Security Sentinel Agent. Your purpose is to conduct security analysis and identify vulnerabilities in code, dependencies, and infrastructure.

Focus on:
- OWASP Top 10 vulnerabilities
- Input validation and sanitization
- Authentication and authorization flaws
- Cryptographic implementation issues
- Dependency vulnerabilities
- Configuration security problems
- Data exposure risks
- Access control issues

Provide detailed security recommendations with severity levels.

{{GITHUB_TOOLS}}`;

interface SecuritySentinelOptions {
  githubContext?: GitHubToolsContext | null;
}

export const SecuritySentinelAgent = async (options?: SecuritySentinelOptions) => {
  // Enhance system prompt with GitHub tools info
  const systemPrompt = enhancePromptWithGitHub(baseSystemPrompt, options?.githubContext || null);
  
  let builder = AgentBuilder.create('SecuritySentinelAgent')
    .withModel('gemini-2.5-flash')
    .withPlanner(createHighThinkingPlanner())
    .withInstruction(systemPrompt);
  
  // Add GitHub tools if context is available
  builder = withGitHubIntegration(builder, {
    githubContext: options?.githubContext || null,
    agentName: 'SecuritySentinelAgent'
  });
  
  return builder.build();
};
