/**
 * GitHub Task Manager
 * 
 * Breaks down GitHub issues into concrete, trackable tasks
 * Prevents duplicate operations and guides workflow execution
 * Designed to eliminate wasteful agent behavior
 */

export interface Task {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped';
  dependsOn?: string[];
  result?: any;
  error?: string;
  completedAt?: number;
}

export interface TaskCheckpoint {
  phase: 'understand' | 'search' | 'implement' | 'pr' | 'complete';
  tasksCompleted: number;
  tasksTotal: number;
  nextAction?: string;
}

export class GitHubTaskManager {
  private tasks: Map<string, Task> = new Map();
  private completedOperations: Set<string> = new Set();

  /**
   * Decompose GitHub issue into concrete tasks
   * CRITICAL: This prevents aimless exploration!
   */
  decomposeIssue(_issueDescription: string, issueType: 'bug' | 'feature' | 'refactor' | 'replace'): Task[] {
    const tasks: Task[] = [];

    // PHASE 1: UNDERSTAND
    tasks.push({
      id: 'task-1-analyze',
      name: 'Analyze Issue',
      description: 'Parse issue description, extract keywords, understand scope',
      status: 'pending',
    });

    // PHASE 2: SEARCH (COMPREHENSIVE - THE KEY STEP!)
    if (issueType === 'replace') {
      tasks.push({
        id: 'task-2-search-comprehensive',
        name: 'Comprehensive Search for All Occurrences',
        description: 'Find EVERY occurrence of the pattern to replace. Use multiple keyword variations. Record total count.',
        status: 'pending',
        dependsOn: ['task-1-analyze'],
      });

      tasks.push({
        id: 'task-2b-validate-search',
        name: 'Validate Search Completeness',
        description: 'Verify we found all occurrences. Check similar file names and patterns.',
        status: 'pending',
        dependsOn: ['task-2-search-comprehensive'],
      });
    } else if (issueType === 'bug') {
      tasks.push({
        id: 'task-2-find-bug',
        name: 'Find Buggy Code',
        description: 'Search for error message, stack trace, or mentioned files',
        status: 'pending',
        dependsOn: ['task-1-analyze'],
      });

      tasks.push({
        id: 'task-2b-understand-context',
        name: 'Understand Bug Context',
        description: 'Read surrounding code, understand why bug occurs',
        status: 'pending',
        dependsOn: ['task-2-find-bug'],
      });
    } else {
      tasks.push({
        id: 'task-2-search',
        name: 'Search Related Code',
        description: 'Find existing implementations to follow',
        status: 'pending',
        dependsOn: ['task-1-analyze'],
      });
    }

    // PHASE 3: IMPLEMENT
    tasks.push({
      id: 'task-3-fork',
      name: 'Fork Repository',
      description: 'Fork to bot account for implementation',
      status: 'pending',
      dependsOn: issueType === 'replace' ? ['task-2b-validate-search'] : (issueType === 'bug' ? ['task-2b-understand-context'] : ['task-2-search']),
    });

    tasks.push({
      id: 'task-3b-branch',
      name: 'Create Feature Branch',
      description: 'Create descriptive branch name',
      status: 'pending',
      dependsOn: ['task-3-fork'],
    });

    tasks.push({
      id: 'task-3c-implement-all',
      name: 'Implement ALL Changes',
      description: issueType === 'replace' 
        ? 'Modify EVERY affected file found in search'
        : 'Modify all necessary files',
      status: 'pending',
      dependsOn: ['task-3b-branch'],
    });

    // PHASE 4: FINALIZE
    tasks.push({
      id: 'task-4-commit',
      name: 'Commit Changes',
      description: 'Push all modifications to branch',
      status: 'pending',
      dependsOn: ['task-3c-implement-all'],
    });

    tasks.push({
      id: 'task-4b-pr',
      name: 'Create Pull Request',
      description: 'Create PR with comprehensive description',
      status: 'pending',
      dependsOn: ['task-4-commit'],
    });

    // Store tasks
    tasks.forEach((task) => {
      this.tasks.set(task.id, task);
    });

    return tasks;
  }

  /**
   * Mark task as completed
   */
  completeTask(taskId: string, result?: any): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.result = result;
      task.completedAt = Date.now();
      console.log(`[TaskManager] Completed: ${task.name}`);
    }
  }

  /**
   * Mark task as failed/skipped
   */
  skipTask(taskId: string, reason?: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'skipped';
      task.error = reason;
      console.log(`[TaskManager] Skipped: ${task.name}${reason ? ` (${reason})` : ''}`);
    }
  }

  /**
   * Check if task is complete
   */
  isTaskComplete(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    return task?.status === 'completed';
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Track completed operation (to prevent duplicates)
   */
  recordOperation(operationType: string, operationKey: string): void {
    const fullKey = `${operationType}:${operationKey}`;
    this.completedOperations.add(fullKey);
    console.log(`[TaskManager] Operation recorded: ${fullKey}`);
  }

  /**
   * Check if operation was already done
   */
  isOperationDone(operationType: string, operationKey: string): boolean {
    const fullKey = `${operationType}:${operationKey}`;
    return this.completedOperations.has(fullKey);
  }

  /**
   * Get current checkpoint in workflow
   */
  getCurrentCheckpoint(): TaskCheckpoint {
    const allTasks = this.getAllTasks();
    const completed = allTasks.filter((t) => t.status === 'completed').length;

    // Determine current phase
    let phase: 'understand' | 'search' | 'implement' | 'pr' | 'complete' = 'understand';
    if (this.isTaskComplete('task-1-analyze')) phase = 'search';
    if (this.isTaskComplete('task-2-search') || this.isTaskComplete('task-2-search-comprehensive')) phase = 'implement';
    if (this.isTaskComplete('task-3c-implement-all')) phase = 'pr';
    if (this.isTaskComplete('task-4b-pr')) phase = 'complete';

    // Determine next action
    const nextPendingTask = allTasks.find((t) => t.status === 'pending');
    const nextAction = nextPendingTask ? `${nextPendingTask.name}: ${nextPendingTask.description}` : 'All tasks complete!';

    return {
      phase,
      tasksCompleted: completed,
      tasksTotal: allTasks.length,
      nextAction,
    };
  }

  /**
   * Get human-readable task checklist for agent
   */
  getTaskChecklist(): string {
    const tasks = this.getAllTasks();
    const lines: string[] = [];

    lines.push('📋 **TASK CHECKLIST - FOLLOW THIS TO COMPLETION**\n');

    // Group by phase
    const phaseMap = new Map<string, Task[]>();
    tasks.forEach((task) => {
      const phase = task.id.split('-')[1];
      if (!phaseMap.has(phase)) phaseMap.set(phase, []);
      phaseMap.get(phase)!.push(task);
    });

    const phaseOrder = ['1', '2', '2b', '3', '3b', '3c', '4', '4b'];
    phaseOrder.forEach((phase) => {
      const phaseTasks = phaseMap.get(phase);
      if (!phaseTasks) return;

      const phaseNumber = phase.replace(/[^0-9]/g, '');
      const phaseNames: { [key: string]: string } = {
        '1': 'PHASE 1: UNDERSTAND',
        '2': 'PHASE 2: SEARCH',
        '3': 'PHASE 3: IMPLEMENT',
        '4': 'PHASE 4: FINALIZE',
      };

      if (!lines.some((l) => l.includes(phaseNames[phaseNumber]))) {
        lines.push(`\n**${phaseNames[phaseNumber]}**`);
      }

      phaseTasks.forEach((task) => {
        const icon =
          task.status === 'completed'
            ? '✅'
            : task.status === 'pending'
              ? '⏳'
              : task.status === 'skipped'
                ? '⏭️'
                : '🔄';
        lines.push(`${icon} ${task.name}`);
        lines.push(`   ${task.description}`);
      });
    });

    // Show current status
    const checkpoint = this.getCurrentCheckpoint();
    lines.push(`\n**📍 CURRENT STATUS:**`);
    lines.push(`   Phase: ${checkpoint.phase.toUpperCase()}`);
    lines.push(`   Progress: ${checkpoint.tasksCompleted}/${checkpoint.tasksTotal} tasks`);
    lines.push(`   Next: ${checkpoint.nextAction}`);

    return lines.join('\n');
  }

  /**
   * Generate execution guidance
   */
  getExecutionGuidance(): string {
    const checkpoint = this.getCurrentCheckpoint();
    const lines: string[] = [];

    lines.push('🎯 **EXECUTION GUIDANCE**\n');

    switch (checkpoint.phase) {
      case 'understand':
        lines.push('📖 **PHASE 1: UNDERSTAND THE PROBLEM**');
        lines.push('   1. Read issue description carefully');
        lines.push('   2. Extract keywords');
        lines.push('   3. Understand scope and affected areas');
        lines.push('   4. Mark task "task-1-analyze" as complete when done\n');
        break;

      case 'search':
        lines.push('🔍 **PHASE 2: COMPREHENSIVE SEARCH**');
        lines.push('   ⚠️  CRITICAL: Find EVERY occurrence!');
        lines.push('   1. Use multiple keyword variations');
        lines.push('   2. Search all file types');
        lines.push('   3. Record total count of matches');
        lines.push('   4. Do NOT proceed until confident all occurrences found\n');
        break;

      case 'implement':
        lines.push('⚙️  **PHASE 3: IMPLEMENTATION**');
        lines.push('   1. Fork repository');
        lines.push('   2. Create feature branch');
        lines.push('   3. Modify EVERY file found in search');
        lines.push('   4. Verify total changes match search count\n');
        break;

      case 'pr':
        lines.push('🔗 **PHASE 4: CREATE PULL REQUEST**');
        lines.push('   1. Commit all changes');
        lines.push('   2. Create PR with comprehensive description');
        lines.push('   3. Include summary of all changes made\n');
        break;

      case 'complete':
        lines.push('✨ **TASK COMPLETE!**');
        lines.push('   All phases executed successfully.');
        break;
    }

    return lines.join('\n');
  }
}

/**
 * Factory function to create task manager for specific issue
 */
export function createTaskManagerForIssue(
  issueDescription: string,
  issueType: 'bug' | 'feature' | 'refactor' | 'replace' = 'bug'
): GitHubTaskManager {
  const manager = new GitHubTaskManager();
  manager.decomposeIssue(issueDescription, issueType);
  return manager;
}
