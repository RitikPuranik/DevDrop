/**
 * Tool Call Interceptor for Duplicate Prevention
 * 
 * Intercepts tool calls before execution and checks against session state
 * Logs warnings for duplicate calls and helps agent avoid unnecessary work
 */

import { AgentSessionState } from '../types/agentState';

interface ToolCallInterceptionResult {
  shouldProceed: boolean;
  reason?: string;
  cachedResult?: any;
  isDuplicate: boolean;
  callCount: number;
}

/**
 * Intercept tool call and check for duplicates
 * Returns: { shouldProceed, reason, cachedResult, isDuplicate, callCount }
 */
export function interceptToolCall(
  state: AgentSessionState | null,
  toolName: string,
  args: Record<string, any>
): ToolCallInterceptionResult {
  // If no state, always proceed (can't check for duplicates)
  if (!state) {
    return {
      shouldProceed: true,
      isDuplicate: false,
      callCount: 0,
    };
  }

  // Check tool call history for duplicates
  const argsJson = JSON.stringify(sortObjectKeys(args));
  const previousCalls = state.toolCallHistory.filter(
    (call) => call.tool === toolName &&
    JSON.stringify(sortObjectKeys(call.args)) === argsJson
  );

  if (previousCalls.length > 0) {
    const lastCall = previousCalls[previousCalls.length - 1];
    
    // Log detailed duplicate warning
    const logMessage = `
🚨 DUPLICATE TOOL CALL DETECTED!
Tool: ${toolName}
Call #${previousCalls.length + 1} (previously called ${previousCalls.length} time(s))
Previous call: ${new Date(lastCall.timestamp).toLocaleTimeString()}
Result: ${JSON.stringify(lastCall.result).substring(0, 150)}...

This tool was ALREADY called with these exact arguments.
Reusing previous result instead of making redundant API call.
`;

    console.warn('[ToolInterceptor]' + logMessage);

    return {
      shouldProceed: false,
      isDuplicate: true,
      reason: `Tool already called ${previousCalls.length} time(s) with same arguments`,
      cachedResult: lastCall.result,
      callCount: previousCalls.length,
    };
  }

  // Check for similar (but not identical) calls - warn but allow
  const similarCalls = findSimilarToolCalls(state, toolName, args);
  if (similarCalls.length > 0) {
    const lastSimilar = similarCalls[similarCalls.length - 1];
    
    const logMessage = `
⚠️ SIMILAR TOOL CALL DETECTED!
Tool: ${toolName}
Similar to previous call: ${new Date(lastSimilar.timestamp).toLocaleTimeString()}
Previous args: ${JSON.stringify(lastSimilar.args)}
Current args: ${JSON.stringify(args)}

This tool was recently called with very similar arguments.
Make sure this is intentional (e.g., different search pattern).
`;

    console.warn('[ToolInterceptor]' + logMessage);
  }

  return {
    shouldProceed: true,
    isDuplicate: false,
    callCount: previousCalls.length,
  };
}

/**
 * Find similar (but not identical) tool calls
 * Used to warn about near-duplicate operations
 */
function findSimilarToolCalls(
  state: AgentSessionState,
  toolName: string,
  newArgs: Record<string, any>
): Array<{ tool: string; args: Record<string, any>; timestamp: number }> {
  const similar = state.toolCallHistory.filter((call) => {
    if (call.tool !== toolName) return false;
    
    // Check if args are similar (90%+ match)
    return isSimilarArgs(toolName, newArgs, call.args);
  });

  return similar;
}

/**
 * Determine if two argument sets are similar for the same tool
 */
function isSimilarArgs(
  toolName: string,
  newArgs: Record<string, any>,
  prevArgs: Record<string, any>
): boolean {
  // For search tools with same repo context
  if (
    toolName === 'bot_github_search_cached' ||
    toolName === 'bot_github_search_code'
  ) {
    // Same repo + branch = similar context
    if (
      newArgs.owner === prevArgs.owner &&
      newArgs.repo === prevArgs.repo &&
      (newArgs.branch || 'main') === (prevArgs.branch || 'main')
    ) {
      // Check if searching for similar patterns
      const newPattern = (newArgs.pattern || '').toLowerCase();
      const prevPattern = (prevArgs.pattern || '').toLowerCase();
      const similarity = stringSimilarity(newPattern, prevPattern);
      
      // 85% similar = warning
      return similarity > 0.85;
    }
  }

  // For file operations on same file
  if (
    toolName === 'bot_github_get_file_cached' ||
    toolName === 'bot_github_edit_cached' ||
    toolName === 'bot_github_replace_text'
  ) {
    return (
      newArgs.owner === prevArgs.owner &&
      newArgs.repo === prevArgs.repo &&
      newArgs.path === prevArgs.path &&
      (newArgs.branch || 'main') === (prevArgs.branch || 'main')
    );
  }

  // For repo operations
  if (toolName === 'bot_github_fork_repo') {
    return newArgs.owner === prevArgs.owner && newArgs.repo === prevArgs.repo;
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
 * Calculate string similarity 0-1
 */
function stringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDist = levenshteinDistance(longer, shorter);
  return (longer.length - editDist) / longer.length;
}

/**
 * Levenshtein distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const costs: number[] = [];

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
 * Sort object keys recursively for consistent comparison
 */
function sortObjectKeys(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map((item) => sortObjectKeys(item));

  return Object.keys(obj)
    .sort()
    .reduce((result: any, key: string) => {
      result[key] = sortObjectKeys(obj[key]);
      return result;
    }, {});
}

/**
 * Log tool call execution with deduplication info
 */
export function logToolExecution(
  toolName: string,
  _args: Record<string, any>,
  interceptionResult: ToolCallInterceptionResult
): void {
  if (interceptionResult.isDuplicate) {
    console.log(
      `[ToolExecution] ⏭️ SKIPPED (duplicate): ${toolName} - Using cached result from previous call`
    );
  } else {
    console.log(
      `[ToolExecution] 🔧 EXECUTING: ${toolName} (call #${interceptionResult.callCount + 1})`
    );
  }
}
