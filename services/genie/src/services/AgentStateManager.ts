/**
 * Agent State Manager
 * 
 * Manages in-memory session state for agents
 * Enables agents to remember what they've done and avoid duplicate operations
 * Uses memory storage - no external dependencies required
 */

import {
  AgentSessionState,
  defaultAgentSessionState,
} from '../types/agentState';

const AGENT_STATE_TTL = 7200000; // 2 hours in milliseconds

export class AgentStateManager {
  private stateStore: Map<string, AgentSessionState> = new Map();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    // Cleanup expired states every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, state] of this.stateStore.entries()) {
        const age = now - state.startTime;
        if (age > AGENT_STATE_TTL) {
          this.stateStore.delete(key);
          console.log(`[AgentStateManager] Expired state cleaned: ${key}`);
        }
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  async initialize(): Promise<void> {
    console.log('[AgentStateManager] Initialized with in-memory state storage');
  }

  private getStateKey(sessionId: string): string {
    return `agent:state:${sessionId}`;
  }

  /**
   * Cleanup (call on shutdown)
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.stateStore.clear();
    console.log('[AgentStateManager] Shutdown complete');
  }

  /**
   * Create or get agent session state
   */
  async getOrCreateState(
    sessionId: string,
    jobId: string,
    userId: string,
    taskDescription: string
  ): Promise<AgentSessionState> {
    const key = this.getStateKey(sessionId);
    
    const existing = this.stateStore.get(key);
    if (existing) {
      console.log(`[AgentStateManager] Loaded state for session ${sessionId}`);
      return existing;
    }

    const newState = defaultAgentSessionState(sessionId, jobId, userId, taskDescription);
    this.stateStore.set(key, newState);
    console.log(`[AgentStateManager] Created new state for session ${sessionId}`);
    return newState;
  }

  /**
   * Save state to memory
   */
  async saveState(state: AgentSessionState): Promise<void> {
    const key = this.getStateKey(state.sessionId);
    state.lastActivityAt = Date.now();
    this.stateStore.set(key, state);
    console.log(`[AgentStateManager] Saved state for session ${state.sessionId}`);
  }

  /**
   * Record a tool call
   */
  recordToolCall(
    state: AgentSessionState,
    tool: string,
    args: Record<string, any>,
    result: Record<string, any>,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    state.totalToolCalls++;
    state.toolCallHistory.push({
      tool,
      args,
      result,
      timestamp: Date.now(),
      duration,
      success,
      error,
    });

    console.log(
      `[AgentState] Tool call recorded: ${tool} (${duration}ms, success: ${success})`
    );
  }

  /**
   * Record a forked repository
   */
  recordForkedRepo(
    state: AgentSessionState,
    owner: string,
    repo: string,
    forkOwner: string,
    forkRepo: string
  ): void {
    const forkedRepo = {
      owner,
      repo,
      forkOwner,
      forkRepo,
      timestamp: Date.now(),
    };
    state.forkedRepos.push(forkedRepo);
    console.log(
      `[AgentState] Fork recorded: ${owner}/${repo} → ${forkOwner}/${forkRepo}`
    );
  }

  /**
   * Record a created branch
   */
  recordBranch(
    state: AgentSessionState,
    name: string,
    baseBranch: string,
    repo: string,
    forkOwner: string
  ): void {
    state.currentBranch = {
      name,
      baseBranch,
      repo,
      forkOwner,
      createdAt: Date.now(),
    };
    console.log(`[AgentState] Branch recorded: ${forkOwner}/${repo}/${name}`);
  }

  /**
   * Record file modifications
   */
  recordFileModification(
    state: AgentSessionState,
    path: string,
    newContent: string,
    oldContent?: string,
    action: 'created' | 'updated' | 'deleted' = 'updated'
  ): void {
    const existing = state.modifiedFiles.find((f) => f.path === path);
    if (existing) {
      existing.newContent = newContent;
      existing.timestamp = Date.now();
      console.log(`[AgentState] File update recorded: ${path}`);
    } else {
      state.modifiedFiles.push({
        path,
        oldContent,
        newContent,
        action,
        timestamp: Date.now(),
      });
      console.log(`[AgentState] File ${action} recorded: ${path}`);
    }
  }

  /**
   * Record search results
   */
  recordSearch(
    state: AgentSessionState,
    pattern: string,
    filePattern: string | undefined,
    totalMatches: number,
    files: string[]
  ): void {
    state.searchHistory.push({
      pattern,
      filePattern,
      totalMatches,
      files,
      timestamp: Date.now(),
    });
    console.log(
      `[AgentState] Search recorded: "${pattern}" → ${totalMatches} matches in ${files.length} files`
    );
  }

  /**
   * Record PR creation
   */
  recordPR(
    state: AgentSessionState,
    number: number,
    url: string,
    title: string,
    repo: string,
    owner: string,
    branch: string
  ): void {
    state.pullRequests.push({
      number,
      url,
      title,
      repo,
      owner,
      branch,
      createdAt: Date.now(),
    });
    console.log(`[AgentState] PR recorded: ${owner}/${repo}#${number}`);
  }

  /**
   * Check if operation already done (prevent duplicates)
   */
  isOperationDone(state: AgentSessionState, operationType: string, key: string): boolean {
    switch (operationType) {
      case 'fork': {
        const fork = state.forkedRepos.find(
          (f) => `${f.owner}/${f.repo}` === key
        );
        return !!fork;
      }
      case 'branch': {
        const branch = state.currentBranch;
        return branch ? branch.name === key : false;
      }
      case 'file_modified': {
        return state.modifiedFiles.some((f) => f.path === key);
      }
      case 'pr': {
        return state.pullRequests.some((pr) => pr.url === key);
      }
      case 'search': {
        return state.searchHistory.some((s) => s.pattern === key);
      }
      default:
        return false;
    }
  }

  /**
   * Get summary of what was done (for system prompt context)
   */
  getSummary(state: AgentSessionState): string {
    const lines: string[] = [];

    lines.push('📋 **Agent Operation Summary**');
    lines.push('');

    if (state.forkedRepos.length > 0) {
      lines.push('✅ **Forks:**');
      state.forkedRepos.forEach((fork) => {
        lines.push(`  - ${fork.owner}/${fork.repo} → ${fork.forkOwner}/${fork.forkRepo}`);
      });
      lines.push('');
    }

    if (state.currentBranch) {
      lines.push('✅ **Branch Created:**');
      lines.push(
        `  - ${state.currentBranch.forkOwner}/${state.currentBranch.repo}/${state.currentBranch.name}`
      );
      lines.push('');
    }

    if (state.modifiedFiles.length > 0) {
      lines.push('✅ **Files Modified:**');
      state.modifiedFiles.forEach((file) => {
        lines.push(`  - ${file.action}: ${file.path}`);
      });
      lines.push('');
    }

    if (state.searchHistory.length > 0) {
      lines.push('✅ **Searches Performed:**');
      state.searchHistory.forEach((search) => {
        lines.push(
          `  - Pattern: "${search.pattern}" → ${search.totalMatches} matches`
        );
      });
      lines.push('');
    }

    if (state.pullRequests.length > 0) {
      lines.push('✅ **Pull Requests:**');
      state.pullRequests.forEach((pr) => {
        lines.push(`  - [#${pr.number}](${pr.url}): ${pr.title}`);
      });
      lines.push('');
    }

    // Add recently called tools for duplicate detection
    if (state.toolCallHistory.length > 0) {
      const recentTools = state.toolCallHistory.slice(-10);
      lines.push('� **Recent Tool Calls (Last 10):**');
      recentTools.forEach((tool) => {
        const status = tool.success ? '✅' : '❌';
        lines.push(`  - ${status} ${tool.tool} (${tool.duration}ms)`);
      });
      lines.push('');
    }

    lines.push('�📊 **Metrics:**');
    lines.push(`  - Tool calls: ${state.totalToolCalls}`);
    lines.push(`  - Files modified: ${state.modifiedFiles.length}`);
    lines.push(`  - Time elapsed: ${Math.round((Date.now() - state.startTime) / 1000)}s`);

    return lines.join('\n');
  }

  /**
   * Check if a tool call with identical args was recently made
   * Returns previous result if duplicate (for skipping unnecessary calls)
   */
  findDuplicateToolCall(
    state: AgentSessionState,
    toolName: string,
    args: Record<string, any>
  ): { isDuplicate: boolean; previousResult?: any; callCount: number } {
    const argsJson = JSON.stringify(this.sortObjectKeys(args));
    
    const matches = state.toolCallHistory.filter(
      (call) => call.tool === toolName && 
      JSON.stringify(this.sortObjectKeys(call.args)) === argsJson
    );

    return {
      isDuplicate: matches.length > 0,
      previousResult: matches.length > 0 ? matches[matches.length - 1].result : undefined,
      callCount: matches.length,
    };
  }

  /**
   * Helper to sort object keys for consistent comparison
   */
  private sortObjectKeys(obj: any): any {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.sortObjectKeys(item));
    
    return Object.keys(obj)
      .sort()
      .reduce((result: any, key: string) => {
        result[key] = this.sortObjectKeys(obj[key]);
        return result;
      }, {});
  }

  /**
   * Mark phase as completed
   */
  completePhase(state: AgentSessionState, phase: string): void {
    if (!state.completedPhases.includes(phase)) {
      state.completedPhases.push(phase);
      console.log(`[AgentState] Phase completed: ${phase}`);
    }
  }

  /**
   * Clear state (end of session)
   */
  async clearState(sessionId: string): Promise<void> {
    const key = this.getStateKey(sessionId);
    this.stateStore.delete(key);
    console.log(`[AgentStateManager] Cleared state for session ${sessionId}`);
  }
}

// Singleton instance
let stateManagerInstance: AgentStateManager | null = null;

export function getAgentStateManager(): AgentStateManager {
  if (!stateManagerInstance) {
    stateManagerInstance = new AgentStateManager();
  }
  return stateManagerInstance;
}
