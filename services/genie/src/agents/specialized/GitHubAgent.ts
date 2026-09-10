/**
 * GitHubAgent - Specialized agent for ALL GitHub operations
 * 
 * CAPABILITIES:
 * - Deep codebase analysis and understanding
 * - Systematic problem solving for complex issues
 * - Smart file discovery and context building
 * - Fetch files/code from repositories
 * - Create/update files via PRs (using bot token - no user token needed!)
 * - Manage branches, issues, PRs
 * - Orchestrate code generation/translation with other agents
 * - Complete end-to-end GitHub workflows
 * - SESSION MEMORY to prevent duplicate operations
 * 
 * This agent uses Genie AI Bot token for most operations, so users
 * don't need to provide their personal access tokens!
 * 
 * ENHANCED VERSION: Now includes:
 * - Advanced codebase analysis tools for complex issues
 * - Session state tracking to prevent duplicate operations
 * - Comprehensive search validation
 * - Pre-PR validation checklist
 * 
 * OPERATION MODES:
 * 1. Bot Mode (Default) - Uses bot token for PRs via fork, issues, comments
 * 2. User Mode (Optional) - Uses user token only when explicitly needed
 */

import { AgentBuilder } from '@iqai/adk';
import { z } from 'zod';
import { GITHUB_AGENT_ENHANCED_SYSTEM_PROMPT } from '../../prompts/github-agent-enhanced-prompt';
import { GITHUB_AGENT_IMPROVED_V2_PROMPT } from '../../prompts/github-agent-improved-v2';
import { generateStateAwarenessSection } from '../../prompts/github-agent-state-awareness';
import { createCachedGitHubTools } from '../../utils/cachedGitHubTools';
import { AgentCacheManager } from '../../utils/agentCacheManager';
import { getAgentStateManager } from '../../services/AgentStateManager';
import { createTaskManagerForIssue } from '../../services/GitHubTaskManager';
import { PerformanceTracker } from '../../utils/PerformanceTracker';
import { Octokit } from '@octokit/rest';

const githubAgentResponseSchema = z.object({
  summary: z.string().describe('Summary of what was accomplished'),
  analysis: z.object({
    understood: z.string().describe('What you understood from the issue/request'),
    approach: z.string().describe('Your planned approach to solve it'),
    filesIdentified: z.array(z.string()).optional().describe('Key files identified for this task'),
    fileBreakdown: z.object({
      sourceCode: z.array(z.string()).optional().describe('Source code files (.ts, .js, .py, etc)'),
      tests: z.array(z.string()).optional().describe('Test files'),
      config: z.array(z.string()).optional().describe('Config files'),
      docs: z.array(z.string()).optional().describe('Documentation files'),
    }).optional().describe('Breakdown of files by type - REQUIRED if you modified files'),
  }).optional().describe('Include this when you did analysis phase (for complex issues)'),
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })).optional().nullable().describe('ONLY include this when fetching/reading files from repository for user to preview. DO NOT include when creating PRs or issues.'),
  filesModified: z.array(z.object({
    path: z.string(),
    action: z.enum(['created', 'updated', 'deleted']),
    fileType: z.enum(['source', 'test', 'config', 'docs', 'other']).optional().describe('Type of file modified'),
  })).optional().nullable().describe('List of files that were modified in the PR'),
  validation: z.object({
    modifiedSourceCode: z.boolean().describe('Did you modify actual source code files? (not just docs)'),
    modifiedConfig: z.boolean().describe('Did you modify config files if needed?'),
    modifiedTests: z.boolean().describe('Did you modify test files if needed?'),
    modifiedDocs: z.boolean().describe('Did you modify documentation?'),
    issueFullySolved: z.boolean().describe('Is the issue completely solved (code + tests + docs)?'),
  }).optional().nullable().describe('Validation checklist - REQUIRED when creating PRs or solving issues. Return null if not applicable yet.'),
  prCreated: z.object({
    number: z.number(),
    url: z.string(),
    title: z.string(),
  }).optional().nullable().describe('Details of the PR that was created'),
  branchCreated: z.string().optional().nullable().describe('Name of the branch that was created'),
  repoCreated: z.object({
    owner: z.string(),
    name: z.string(),
    url: z.string(),
  }).optional().nullable().describe('Details of the repository that was created'),
  metrics: z.object({
    executionTimeSeconds: z.number().describe('Total execution time in seconds'),
    toolCalls: z.number().describe('Actual number of tool calls used'),
    toolCallsExpected: z.number().optional().describe('Expected number of tool calls (for optimization)'),
    efficiency: z.string().describe('Efficiency percentage (expected / actual)'),
    redundantOperations: z.number().optional().describe('Number of redundant operations detected'),
  }).optional().nullable().describe('Performance metrics for optimization tracking. Return null if not applicable yet.'),
});

export const GitHubAgent = async (
  githubContext?: { token: string; username: string; email?: string },
  sessionId?: string,
  jobId?: string,
  userId?: string,
  taskDescription?: string
) => {
  console.log('[GitHubAgent] Initializing with LOCAL CACHE + STATE AWARENESS + TASK MANAGEMENT + PERFORMANCE TRACKING');
  
  try {
    // Determine task type for budget allocation
    let budgetType: 'simpleReplace' | 'prWithChanges' | 'complexRefactor' | 'largeRefactor' = 'simpleReplace';
    if (taskDescription) {
      if (taskDescription.toLowerCase().includes('refactor') && taskDescription.length > 200) {
        budgetType = 'largeRefactor';
      } else if (taskDescription.toLowerCase().includes('refactor')) {
        budgetType = 'complexRefactor';
      } else if (taskDescription.toLowerCase().includes('replace') && taskDescription.length > 100) {
        budgetType = 'prWithChanges';
      }
    }
    
    const performanceTracker = new PerformanceTracker(budgetType);
    console.log(`[GitHubAgent] Performance tracker initialized with budget: ${budgetType}`);
    
    // Initialize state manager for session tracking
    const stateManager = getAgentStateManager();
    await stateManager.initialize();
    
    // Get or create session state
    const state = sessionId && jobId && userId && taskDescription
      ? await stateManager.getOrCreateState(sessionId, jobId, userId, taskDescription)
      : null;
    
    if (state) {
      console.log(`[GitHubAgent] Session state loaded: ${state.sessionId}`);
      console.log(`[GitHubAgent] Previous operations: ${state.totalToolCalls} tool calls, ${state.modifiedFiles.length} files modified`);
    }
    
    // Initialize task manager for workflow guidance
    let taskManager = null;
    let taskChecklist = '';
    let executionGuidance = '';
    
    if (taskDescription) {
      // Detect issue type from task description
      let issueType: 'bug' | 'feature' | 'refactor' | 'replace' = 'bug';
      if (taskDescription.toLowerCase().includes('replace') || taskDescription.toLowerCase().includes('remove all')) {
        issueType = 'replace';
      } else if (taskDescription.toLowerCase().includes('feature') || taskDescription.toLowerCase().includes('add')) {
        issueType = 'feature';
      } else if (taskDescription.toLowerCase().includes('refactor')) {
        issueType = 'refactor';
      }
      
      taskManager = createTaskManagerForIssue(taskDescription, issueType);
      taskChecklist = taskManager.getTaskChecklist();
      executionGuidance = taskManager.getExecutionGuidance();
      
      console.log('[GitHubAgent] Task manager initialized for issue type:', issueType);
    }
    
    // Initialize cache manager for faster operations
    const cacheManager = new AgentCacheManager();
    const cacheStats = cacheManager.getContextSummary();
    
    console.log('[GitHubAgent] Cache system ready:', cacheStats);
    
    // Try to use cached tools with bot token
    try {
      const botToken = process.env.GENIE_BOT_GITHUB_TOKEN || process.env.CODEFORGE_BOT_GITHUB_TOKEN;
      if (!botToken) {
        throw new Error('No bot token available');
      }
      
      const octokit = new Octokit({ auth: botToken });
      const cachedTools = createCachedGitHubTools(octokit);
      
      console.log('[GitHubAgent] ✅ Initialized with CACHED tools (bot mode)');
      console.log('[GitHubAgent] Tool count:', cachedTools.tools.length);
      
      // Build comprehensive system prompt with IMPROVED V2 (Gemini-CLI Inspired)
      const stateAwareness = state 
        ? generateStateAwarenessSection(state, taskChecklist, executionGuidance)
        : '';
      
      const systemPrompt = stateAwareness + '\n\n' +
        '# GitHubAgent V2 - Production Ready\n\n' +
        GITHUB_AGENT_IMPROVED_V2_PROMPT + '\n\n' +
        '---\n\n' +
        '## Additional Context\n\n' +
        GITHUB_AGENT_ENHANCED_SYSTEM_PROMPT + '\n\n' + 
        cacheStats + 
        '\n\n**🎯 Performance Tracking Active**' +
        '\n- Tool calls tracked against budget' +
        '\n- Target efficiency: ≥85% (expected vs actual)' +
        '\n- Automatic pause if budget exceeded' +
        `\n- Budget: ${budgetType} (Max: ${performanceTracker.getMetrics().toolCalls.expected} calls)` +
        '\n\n**📋 Remember: Think → Plan → Execute → Validate**' +
        '\n1. Analyze what needs to change (no tool calls)' +
        '\n2. Execute efficiently (batch operations)' +
        '\n3. Validate completeness (all file types addressed)';
      
      return AgentBuilder.create('GitHubAgent')
        .withModel('gemini-2.5-flash')
        .withInstruction(systemPrompt)
        .withTools(...cachedTools.tools)
        .withOutputSchema(githubAgentResponseSchema)
        .build();
        
    } catch (botTokenError: any) {
      console.warn('[GitHubAgent] Bot token mode failed:', botTokenError.message);
      
      // Fallback to user token mode if bot token not available
      if (githubContext) {
        console.log('[GitHubAgent] ⚠️ Falling back to user token mode with cache layer');
        
        const octokit = new Octokit({ auth: githubContext.token });
        const cachedTools = createCachedGitHubTools(octokit);
        
        const stateAwareness = state 
          ? generateStateAwarenessSection(state, taskChecklist, executionGuidance)
          : '';
        
        const systemPrompt = stateAwareness + '\n\n' +
          '# GitHubAgent V2 - Production Ready (User Token Mode)\n\n' +
          GITHUB_AGENT_IMPROVED_V2_PROMPT + '\n\n' +
          '---\n\n' +
          '## Additional Context\n\n' +
          GITHUB_AGENT_ENHANCED_SYSTEM_PROMPT + '\n\n' + 
          cacheStats +
          '\n\n**⚠️ Mode:** USER TOKEN (bot token not configured)' +
          '\n**🎯 Performance Tracking Active**' +
          '\n- Tool calls monitored for efficiency' +
          `\n- Budget: ${budgetType} (Max: ${performanceTracker.getMetrics().toolCalls.expected} calls)` +
          '\n\n**📋 Remember: Think → Plan → Execute → Validate**';
        
        return AgentBuilder.create('GitHubAgent')
          .withModel('gemini-2.5-flash')
          .withInstruction(systemPrompt)
          .withTools(...cachedTools.tools)
          .withOutputSchema(githubAgentResponseSchema)
          .build();
      }
      
      throw new Error('GitHub Agent requires either bot token (GENIE_BOT_GITHUB_TOKEN or legacy CODEFORGE_BOT_GITHUB_TOKEN) or user context');
    }
    
  } catch (error: any) {
    console.error('[GitHubAgent] Fatal initialization error:', error.message);
    throw error;
  }
};
