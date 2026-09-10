/**
 * Agent GitHub Integration Utility
 * Automatically inject GitHub tools into any agent
 */

import { createGitHubTools, GitHubToolsContext, GITHUB_TOOLS_DESCRIPTION } from './githubTools';

interface GitHubIntegrationOptions {
  enabled?: boolean;
  githubContext?: GitHubToolsContext | null;
  agentName?: string;
}

/**
 * Enhance an AgentBuilder with GitHub tools if context is available
 * 
 * @param builder - The AgentBuilder instance (any type)
 * @param options - GitHub integration options
 * @returns Enhanced AgentBuilder with GitHub tools (if available)
 */
export function withGitHubIntegration(
  builder: any,
  options: GitHubIntegrationOptions = {}
): any {
  const { enabled = true, githubContext, agentName = 'Agent' } = options;

  // Skip if disabled or no context
  if (!enabled || !githubContext) {
    console.log(`[${agentName}] GitHub integration disabled or no context available`);
    return builder;
  }

  try {
    console.log(`[${agentName}] Enabling GitHub integration for user: ${githubContext.username}`);
    
    // Create GitHub tools
    const githubToolsObj = createGitHubTools(githubContext);
    
    // Attach all tools to the builder
    const enhancedBuilder = builder.withTools(...githubToolsObj.tools);
    
    console.log(`[${agentName}] Attached ${githubToolsObj.tools.length} GitHub tools`);
    console.log(`[${agentName}] Tools:`, githubToolsObj.tools.map(t => t.name).join(', '));
    
    return enhancedBuilder;
  } catch (error) {
    console.error(`[${agentName}] Failed to integrate GitHub tools:`, error);
    return builder;
  }
}

/**
 * Enhance agent system prompt with GitHub tools description
 * 
 * @param systemPrompt - Original system prompt
 * @param githubContext - GitHub context (null if not available)
 * @returns Enhanced system prompt with GitHub tools info
 */
export function enhancePromptWithGitHub(
  systemPrompt: string,
  githubContext: GitHubToolsContext | null
): string {
  // Check if prompt has GitHub tools placeholder
  const hasPlaceholder = systemPrompt.includes('{{GITHUB_TOOLS}}');
  
  if (githubContext) {
    // GitHub available - add tools description
    if (hasPlaceholder) {
      return systemPrompt.replace('{{GITHUB_TOOLS}}', GITHUB_TOOLS_DESCRIPTION);
    } else {
      // Append if no placeholder
      return systemPrompt + '\n\n' + GITHUB_TOOLS_DESCRIPTION;
    }
  } else {
    // No GitHub - remove placeholder
    if (hasPlaceholder) {
      return systemPrompt.replace('{{GITHUB_TOOLS}}', '');
    }
    return systemPrompt;
  }
}

/**
 * Check if an agent should have GitHub integration
 * Some agents may not need GitHub access
 */
export function shouldHaveGitHubIntegration(agentName: string): boolean {
  // Agents that should NOT have GitHub access (computation-only agents)
  const excludedAgents = [
    'CodeValidatorAgent',
    'CodeFixerAgent',
    'QualityAssuranceAgent',
    'SpecInterpreterAgent',
  ];
  
  return !excludedAgents.includes(agentName);
}

export default {
  withGitHubIntegration,
  enhancePromptWithGitHub,
  shouldHaveGitHubIntegration,
};
