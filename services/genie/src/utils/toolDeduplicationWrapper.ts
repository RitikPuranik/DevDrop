/**
 * Tool Deduplication Wrapper
 * 
 * Wraps GitHub tools to prevent duplicate calls within a session
 * Checks AgentStateManager history before executing tools
 * Returns cached results for identical tool calls
 */

import { AgentSessionState } from '../types/agentState';

interface DuplicateCheckResult {
  isDuplicate: boolean;
  previousResult?: any;
  lastCallTime?: number;
  callCount?: number;
}

/**
 * Check if a tool call is a duplicate based on state history
 * Returns the previous result if duplicate, null if new call
 */
export function checkForDuplicateToolCall(
  state: AgentSessionState,
  toolName: string,
  args: Record<string, any>
): DuplicateCheckResult {
  const argsString = JSON.stringify(sortKeys(args));
  
  // Find all previous calls to this tool
  const previousCalls = state.toolCallHistory.filter(
    (call) => call.tool === toolName
  );
  
  if (previousCalls.length === 0) {
    return { isDuplicate: false };
  }
  
  // Check for exact match (same args)
  for (const previousCall of previousCalls) {
    const previousArgsString = JSON.stringify(sortKeys(previousCall.args));
    
    if (argsString === previousArgsString) {
      // Found exact duplicate
      return {
        isDuplicate: true,
        previousResult: previousCall.result,
        lastCallTime: previousCall.timestamp,
        callCount: previousCalls.length,
      };
    }
  }
  
  // Check for similar calls (same tool, very similar args - e.g., same file search)
  for (const previousCall of previousCalls) {
    const prevArgs = previousCall.args;
    const isSimilar = isSimilarArguments(toolName, args, prevArgs);
    
    if (isSimilar && previousCall.success) {
      // Similar call found and it was successful
      console.warn(
        `[ToolDedup] Similar ${toolName} call detected (not identical, but very similar)`
      );
      console.warn(`[ToolDedup] Previous args:`, prevArgs);
      console.warn(`[ToolDedup] Current args:`, args);
      console.warn(`[ToolDedup] Consider if you need to call this again`);
    }
  }
  
  return { isDuplicate: false, callCount: previousCalls.length };
}

/**
 * Detect if two sets of arguments are very similar (for the same tool)
 * Used to warn about near-duplicate calls
 */
function isSimilarArguments(
  toolName: string,
  newArgs: Record<string, any>,
  prevArgs: Record<string, any>
): boolean {
  // For search tools, check if searching for the same repo/pattern
  if (
    toolName === 'bot_github_search_cached' ||
    toolName === 'bot_github_search_code'
  ) {
    // Same owner/repo = similar search context
    if (
      newArgs.owner === prevArgs.owner &&
      newArgs.repo === prevArgs.repo &&
      newArgs.branch === prevArgs.branch
    ) {
      // Similar context, now check pattern similarity
      const newPattern = (newArgs.pattern || '').toLowerCase();
      const prevPattern = (prevArgs.pattern || '').toLowerCase();
      
      // Very similar patterns (90%+ similarity) = near-duplicate
      const similarity = calculateStringSimilarity(newPattern, prevPattern);
      return similarity > 0.9;
    }
  }
  
  // For file operations, check if same file being modified
  if (
    toolName === 'bot_github_get_file_cached' ||
    toolName === 'bot_github_edit_cached' ||
    toolName === 'bot_github_replace_text'
  ) {
    return (
      newArgs.owner === prevArgs.owner &&
      newArgs.repo === prevArgs.repo &&
      newArgs.path === prevArgs.path &&
      newArgs.branch === (prevArgs.branch || 'main')
    );
  }
  
  // For fork/branch operations, check if same target
  if (toolName === 'bot_github_fork_repo') {
    return (
      newArgs.owner === prevArgs.owner &&
      newArgs.repo === prevArgs.repo
    );
  }
  
  if (toolName === 'bot_github_create_branch') {
    return (
      newArgs.repo === prevArgs.repo &&
      newArgs.branchName === prevArgs.branchName
    );
  }
  
  return false;
}

/**
 * Calculate similarity between two strings (0-1 scale)
 * Using Levenshtein distance approach
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function getEditDistance(str1: string, str2: string): number {
  const costs = [];
  
  for (let i = 0; i <= str1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= str2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (str1.charAt(i - 1) !== str2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[str2.length] = lastValue;
  }
  
  return costs[str2.length];
}

/**
 * Sort object keys for consistent comparison
 */
function sortKeys(obj: Record<string, any>): Record<string, any> {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  return Object.keys(obj)
    .sort()
    .reduce((result: Record<string, any>, key: string) => {
      result[key] = obj[key];
      return result;
    }, {});
}

/**
 * Format tool call for logging
 */
export function formatToolCall(
  toolName: string,
  args: Record<string, any>
): string {
  const argKeys = Object.keys(args).join(', ');
  return `${toolName}(${argKeys})`;
}

/**
 * Format duplicate warning for agent
 */
export function formatDuplicateWarning(
  toolName: string,
  _args: Record<string, any>,
  previousResult: any,
  callCount: number
): string {
  return `⚠️ DUPLICATE TOOL CALL DETECTED!
Tool: ${toolName}
Previous call returned: ${JSON.stringify(previousResult).substring(0, 100)}...
This is call #${callCount + 1} to this tool in this session.

HINT: You've already called this tool with these exact arguments.
- If you're trying different arguments, verify they're actually different
- If you need the same result, use the previous result instead of calling again
- If searching, use bot_github_search_cached with different search patterns

PREVIOUS RESULT:
${JSON.stringify(previousResult, null, 2).substring(0, 500)}`;
}
