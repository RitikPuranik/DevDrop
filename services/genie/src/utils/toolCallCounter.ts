/**
 * Call Counter - Prevents agent from wasting tool calls on aimless exploration
 * 
 * Tracks:
 * - Total tool calls made
 * - Calls per tool type
 * - Repetitive patterns (e.g., multiple tree calls)
 * - Warns when exploration becomes inefficient
 */

export interface CallStats {
  totalCalls: number;
  callsByType: Record<string, number>;
  timeline: Array<{ tool: string; timestamp: number }>;
  warningRaised: boolean;
}

export class ToolCallCounter {
  private stats: CallStats = {
    totalCalls: 0,
    callsByType: {},
    timeline: [],
    warningRaised: false,
  };

  private readonly MAX_CALLS_WITHOUT_DECISION = 15;
  private readonly TREE_CALL_LIMIT = 3; // Maximum meaningful tree calls before wasting time
  private readonly SEARCH_BEFORE_TREE_CALLS = 2; // Should search first before browsing

  /**
   * Record a tool call and check for inefficient patterns
   */
  recordCall(toolName: string): {
    shouldContinue: boolean;
    warning?: string;
  } {
    this.stats.totalCalls++;
    this.stats.callsByType[toolName] = (this.stats.callsByType[toolName] || 0) + 1;
    this.stats.timeline.push({ tool: toolName, timestamp: Date.now() });

    // Check for inefficient patterns
    const warning = this.checkForInefficiency();

    if (warning) {
      this.stats.warningRaised = true;
      console.warn(
        `[ToolCallCounter] ⚠️ EFFICIENCY WARNING (Call #${this.stats.totalCalls}): ${warning}`
      );
      return { shouldContinue: true, warning }; // Still allow but warn
    }

    // Check if we've exhausted reasonable exploration
    if (this.stats.totalCalls > this.MAX_CALLS_WITHOUT_DECISION) {
      const message = `❌ EXCESSIVE TOOL USAGE: ${this.stats.totalCalls} calls without making a decision! 
      
You should have made enough observations by now. Time to ANALYZE and IMPLEMENT!

Recent calls: ${this.getRecentCallsSummary()}

ACTION: Stop exploring and execute your solution!`;
      console.error(`[ToolCallCounter] ${message}`);
      return { shouldContinue: false, warning: message };
    }

    return { shouldContinue: true };
  }

  /**
   * Check for patterns that indicate wasted exploration
   */
  private checkForInefficiency(): string | null {
    const treeCalls = this.stats.callsByType['bot_github_tree_cached'] || 0;
    const searchCalls = this.stats.callsByType['bot_github_search_cached'] || 0;

    // Too many tree calls without search
    if (treeCalls > this.TREE_CALL_LIMIT) {
      return `Too many tree browsing calls (${treeCalls})! You're exploring aimlessly. Use search instead to find relevant files.`;
    }

    // Tree calls before search
    if (treeCalls > this.SEARCH_BEFORE_TREE_CALLS && searchCalls === 0) {
      return `Browsing directory tree without searching? Use bot_github_search_cached to find relevant code, not tree browsing!`;
    }

    // Repeated reads without making progress
    const readCalls = this.stats.callsByType['bot_github_get_file_cached'] || 0;
    if (
      readCalls > 10 &&
      this.stats.callsByType['bot_github_edit_cached'] === undefined
    ) {
      return `Read ${readCalls} files but haven't started editing? Time to execute!`;
    }

    // Same file read multiple times
    if (this.hasRepeatFileReads()) {
      return `Reading same files repeatedly. You should understand them by now - time to implement!`;
    }

    return null;
  }

  /**
   * Detect if agent is reading same files multiple times
   */
  private hasRepeatFileReads(): boolean {
    const reads = this.stats.timeline
      .filter((t) => t.tool.includes('get_file'))
      .map((t) => t.tool);
    const uniqueReads = new Set(reads);
    return reads.length > uniqueReads.size * 1.5; // More than 50% duplicates
  }

  /**
   * Get summary of recent calls for debugging
   */
  private getRecentCallsSummary(): string {
    const recent = this.stats.timeline.slice(-5).map((t) => t.tool);
    return recent.join(' → ');
  }

  /**
   * Get detailed statistics
   */
  getStats(): CallStats & { recommendations: string[] } {
    const recommendations: string[] = [];

    if (this.stats.totalCalls > 10) {
      recommendations.push('⚠️ High number of calls - focus on implementation');
    }

    if ((this.stats.callsByType['bot_github_tree_cached'] || 0) > 2) {
      recommendations.push('💡 Use search instead of tree browsing for efficiency');
    }

    if (
      (this.stats.callsByType['bot_github_get_file_cached'] || 0) > 5 &&
      !this.stats.callsByType['bot_github_edit_cached']
    ) {
      recommendations.push('🚀 You\'ve explored enough - start implementing!');
    }

    return {
      ...this.stats,
      recommendations,
    };
  }

  /**
   * Reset counter (useful for new tasks)
   */
  reset(): void {
    this.stats = {
      totalCalls: 0,
      callsByType: {},
      timeline: [],
      warningRaised: false,
    };
  }
}
