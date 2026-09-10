/**
 * PerformanceTracker - Tracks agent execution efficiency
 * Ensures tool calls stay within budget and measures optimization
 */

export interface ToolCallMetrics {
  expected: number;
  actual: number;
  efficiency: number; // percentage: actual/expected * 100
  exceeded: boolean;
}

export interface ExecutionMetrics {
  startTime: number;
  endTime?: number;
  duration?: number; // milliseconds
  toolCalls: ToolCallMetrics;
  fileReads: number;
  fileWrites: number;
  searches: number;
  redundantOperations: number;
  wastedSearches: number;
  redundantReads: number;
}

export interface BudgetConfig {
  simpleReplace: { expected: 8; maximum: 12 };
  prWithChanges: { expected: 10; maximum: 15 };
  complexRefactor: { expected: 15; maximum: 20 };
  largeRefactor: { expected: 20; maximum: 28 };
}

const BUDGETS: BudgetConfig = {
  simpleReplace: { expected: 8, maximum: 12 },
  prWithChanges: { expected: 10, maximum: 15 },
  complexRefactor: { expected: 15, maximum: 20 },
  largeRefactor: { expected: 20, maximum: 28 },
};

export class PerformanceTracker {
  private metrics: ExecutionMetrics;
  private budgetType: keyof BudgetConfig;
  private toolCallLog: Map<string, number> = new Map();

  constructor(budgetType: keyof BudgetConfig = 'simpleReplace') {
    this.budgetType = budgetType;
    const budget = BUDGETS[budgetType];
    
    this.metrics = {
      startTime: Date.now(),
      toolCalls: {
        expected: budget.expected,
        actual: 0,
        efficiency: 0,
        exceeded: false,
      },
      fileReads: 0,
      fileWrites: 0,
      searches: 0,
      redundantOperations: 0,
      wastedSearches: 0,
      redundantReads: 0,
    };
  }

  /**
   * Record a tool call
   */
  recordToolCall(toolName: string): void {
    this.metrics.toolCalls.actual++;
    const count = this.toolCallLog.get(toolName) || 0;
    this.toolCallLog.set(toolName, count + 1);

    // Check if exceeded budget
    const maxAllowed = BUDGETS[this.budgetType].maximum;
    if (this.metrics.toolCalls.actual > maxAllowed) {
      this.metrics.toolCalls.exceeded = true;
      console.warn(
        `[PerformanceTracker] ⚠️ Tool call budget EXCEEDED: ${this.metrics.toolCalls.actual} > ${maxAllowed}`
      );
    }
  }

  /**
   * Record file read operation
   */
  recordFileRead(_filePath: string, isRedundant: boolean = false): void {
    this.metrics.fileReads++;
    if (isRedundant) {
      this.metrics.redundantReads++;
      this.metrics.redundantOperations++;
    }
  }

  /**
   * Record file write operation
   */
  recordFileWrite(): void {
    this.metrics.fileWrites++;
  }

  /**
   * Record search operation
   */
  recordSearch(_pattern: string, isWasted: boolean = false): void {
    this.metrics.searches++;
    if (isWasted) {
      this.metrics.wastedSearches++;
      this.metrics.redundantOperations++;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): ExecutionMetrics {
    const endTime = Date.now();
    const duration = endTime - this.metrics.startTime;
    
    const efficiency = (this.metrics.toolCalls.actual / this.metrics.toolCalls.expected) * 100;

    return {
      ...this.metrics,
      endTime,
      duration,
      toolCalls: {
        ...this.metrics.toolCalls,
        efficiency: Math.round(efficiency * 100) / 100,
      },
    };
  }

  /**
   * Get formatted report
   */
  getReport(): string {
    const metrics = this.getMetrics();
    const budget = BUDGETS[this.budgetType];
    const durationSeconds = (metrics.duration || 0) / 1000;
    
    const status = metrics.toolCalls.exceeded 
      ? '❌ EXCEEDED' 
      : metrics.toolCalls.actual <= budget.expected 
        ? '✅ OPTIMAL' 
        : '⚠️ OVER';

    return `
═══════════════════════════════════════════════
📊 PERFORMANCE REPORT (${this.budgetType})
═══════════════════════════════════════════════

⏱️  Execution Time: ${durationSeconds.toFixed(2)}s

🔧 Tool Calls:
   Expected: ${metrics.toolCalls.expected}
   Actual: ${metrics.toolCalls.actual}
   Efficiency: ${metrics.toolCalls.efficiency}%
   Status: ${status}
   Budget: ${budget.maximum} max

📂 File Operations:
   Reads: ${metrics.fileReads}
   Writes: ${metrics.fileWrites}
   Redundant Reads: ${metrics.redundantReads}

🔍 Search Operations:
   Total: ${metrics.searches}
   Wasted: ${metrics.wastedSearches}

⚠️  Inefficiencies:
   Redundant Operations: ${metrics.redundantOperations}

═══════════════════════════════════════════════

Tool Call Breakdown:
${Array.from(this.toolCallLog.entries())
  .map(([tool, count]) => `  ${tool}: ${count}`)
  .join('\n')}

═══════════════════════════════════════════════
`;
  }

  /**
   * Get JSON metrics for logging
   */
  getJSON() {
    return JSON.stringify(this.getMetrics(), null, 2);
  }

  /**
   * Should pause execution due to inefficiency?
   */
  shouldPause(): boolean {
    return this.metrics.toolCalls.exceeded;
  }

  /**
   * Get recommendation for optimization
   */
  getRecommendation(): string {
    if (this.metrics.redundantReads > 0) {
      return '💡 Optimize: Cache file content, avoid re-reading same files';
    }
    if (this.metrics.wastedSearches > 0) {
      return '💡 Optimize: Batch searches into single comprehensive query';
    }
    if (this.metrics.redundantOperations > this.metrics.toolCalls.expected * 0.1) {
      return '💡 Optimize: Plan execution before running, reduce exploration';
    }
    if (this.metrics.toolCalls.actual > this.metrics.toolCalls.expected * 1.2) {
      return '💡 Optimize: Review tool call sequence for inefficiencies';
    }
    return '✅ Performance is good!';
  }
}

export default PerformanceTracker;
