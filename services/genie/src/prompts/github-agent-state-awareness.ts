/**
 * STATE AWARENESS INJECTION FOR GITHUB AGENT
 * 
 * This module generates a state awareness section that is PREPENDED to the system prompt
 * to make the agent aware of what it's already done and prevent duplicate operations
 */

export function generateStateAwarenessSection(
  sessionState: any,
  taskChecklist: string,
  executionGuidance: string
): string {
  return `
🎯 **🚨 CRITICAL STATE AWARENESS - READ THIS BEFORE ANY ACTION 🚨**

This section tells you what was ALREADY DONE in this session.
**CHECK IT BEFORE MAKING TOOL CALLS** to avoid wasted efforts.

---

${generateOperationSummary(sessionState)}

${generateSearchHistorySummary(sessionState)}

${generateDuplicateWarnings(sessionState)}

---

**${taskChecklist}**

---

**${executionGuidance}**

---

🚨 **CRITICAL RULES - NO EXCEPTIONS:**

1. ✅ If a search was already done, REUSE the results - DON'T SEARCH AGAIN
2. ✅ If a file was modified, mark it done - DON'T RE-EDIT
3. ✅ If a repo was forked, reuse it - DON'T FORK AGAIN
4. ✅ If a branch was created, use it - DON'T RECREATE
5. ✅ Complete tasks in order - follow the TASK CHECKLIST

❌ FORBIDDEN:
- Searching for "gemini" when "gemini" search is already in history
- Modifying a file twice
- Forking the same repo twice
- Creating same branch twice
- Skipping phases out of order

`;
}

function generateOperationSummary(state: any): string {
  if (!state || (!state.forkedRepos?.length && !state.currentBranch && !state.modifiedFiles?.length)) {
    return `
✅ **OPERATIONS COMPLETED IN THIS SESSION:**
   (None yet - starting fresh)
`;
  }

  const lines: string[] = ['✅ **OPERATIONS COMPLETED IN THIS SESSION:**'];

  if (state.forkedRepos?.length > 0) {
    lines.push(`   🍴 Forked: ${state.forkedRepos.map((f: any) => `${f.owner}/${f.repo}`).join(', ')}`);
  }

  if (state.currentBranch) {
    lines.push(`   🌿 Branch: ${state.currentBranch.name}`);
  }

  if (state.modifiedFiles?.length > 0) {
    const uniqueFiles = new Set(state.modifiedFiles.map((f: any) => f.path));
    lines.push(`   📝 Modified ${uniqueFiles.size} files:`);
    Array.from(uniqueFiles).slice(0, 10).forEach((path) => {
      lines.push(`      - ${path}`);
    });
    if (uniqueFiles.size > 10) {
      lines.push(`      ... and ${uniqueFiles.size - 10} more`);
    }
  }

  if (state.pullRequests?.length > 0) {
    lines.push(`   🔗 PR: #${state.pullRequests[0].number}`);
  }

  return lines.join('\n');
}

function generateSearchHistorySummary(state: any): string {
  if (!state?.searchHistory?.length) {
    return `
🔍 **SEARCHES ALREADY PERFORMED:**
   (None yet)
`;
  }

  const lines: string[] = [
    '🔍 **SEARCHES ALREADY PERFORMED - REUSE THESE RESULTS:**',
  ];

  const uniqueSearches = new Map<string, any>();
  state.searchHistory.forEach((search: any) => {
    if (!uniqueSearches.has(search.pattern)) {
      uniqueSearches.set(search.pattern, search);
    }
  });

  uniqueSearches.forEach((search, pattern) => {
    lines.push(`   ✅ Pattern: "${pattern}"`);
    lines.push(`      → Found: ${search.totalMatches} matches in ${search.files.length} files`);
    lines.push(`      → Files: ${search.files.slice(0, 3).join(', ')}${search.files.length > 3 ? ', ...' : ''}`);
    lines.push(`      ⚠️  DO NOT SEARCH THIS PATTERN AGAIN - USE THESE RESULTS!`);
  });

  return lines.join('\n');
}

function generateDuplicateWarnings(state: any): string {
  if (!state?.toolCallHistory?.length) {
    return '';
  }

  const toolCounts = new Map<string, { count: number; args: any; lastResult: any }>();
  
  state.toolCallHistory.forEach((call: any) => {
    const argsStr = JSON.stringify(call.args);
    const key = `${call.tool}|${argsStr}`;
    
    if (!toolCounts.has(key)) {
      toolCounts.set(key, { count: 0, args: call.args, lastResult: call.result });
    }
    const entry = toolCounts.get(key)!;
    entry.count++;
    entry.lastResult = call.result;
  });

  const duplicates = Array.from(toolCounts.entries())
    .filter(([, data]) => data.count > 1)
    .sort((a, b) => b[1].count - a[1].count);

  if (duplicates.length === 0) {
    return '';
  }

  const lines: string[] = [
    '\n⚠️  **🚨 DUPLICATE TOOL CALLS DETECTED (EFFICIENCY WASTE!):**',
  ];

  duplicates.slice(0, 3).forEach(([key, data]) => {
    const [tool] = key.split('|');
    lines.push(`   ❌ ${tool} called ${data.count} times with IDENTICAL arguments`);
    lines.push(`      → STOP! Reuse the result from the FIRST call instead of calling again`);
    lines.push(`      → If you need the same data, use the result stored in memory`);
  });

  return lines.join('\n');
}
