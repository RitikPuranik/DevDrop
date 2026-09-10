/**
 * Agent Session State Types
 * 
 * Tracks what a GitHub agent has done during a session to prevent
 * duplicate operations and enable smart decision-making
 */

export interface ToolCallRecord {
  tool: string;
  args: Record<string, any>;
  result?: Record<string, any>;
  timestamp: number;
  duration: number;
  success: boolean;
  error?: string;
}

export interface ForkedRepoInfo {
  owner: string;
  repo: string;
  forkOwner: string;
  forkRepo: string;
  timestamp: number;
}

export interface BranchInfo {
  name: string;
  baseBranch: string;
  repo: string;
  forkOwner: string;
  createdAt: number;
}

export interface FileModification {
  path: string;
  oldContent?: string;
  newContent: string;
  action: 'created' | 'updated' | 'deleted';
  timestamp: number;
}

export interface SearchResult {
  pattern: string;
  filePattern?: string;
  totalMatches: number;
  files: string[];
  timestamp: number;
}

export interface PRInfo {
  number: number;
  url: string;
  title: string;
  repo: string;
  owner: string;
  branch: string;
  createdAt: number;
}

export interface AgentSessionState {
  // Session metadata
  sessionId: string;
  jobId: string;
  userId: string;
  createdAt: number;
  lastActivityAt: number;

  // Repository operations
  forkedRepos: ForkedRepoInfo[];
  currentRepo?: { owner: string; repo: string };
  currentBranch?: BranchInfo;

  // File modifications
  modifiedFiles: FileModification[];

  // Search history
  searchHistory: SearchResult[];

  // PR operations
  pullRequests: PRInfo[];

  // Tool call history
  toolCallHistory: ToolCallRecord[];

  // Task tracking
  taskDescription: string;
  completedPhases: string[];
  currentPhase: 'analyze' | 'search' | 'read' | 'execute' | 'complete';

  // Metrics
  totalToolCalls: number;
  totalAPIFallbacks: number;
  startTime: number;
  endTime?: number;
}

export const defaultAgentSessionState = (
  sessionId: string,
  jobId: string,
  userId: string,
  taskDescription: string
): AgentSessionState => ({
  sessionId,
  jobId,
  userId,
  createdAt: Date.now(),
  lastActivityAt: Date.now(),

  forkedRepos: [],
  modifiedFiles: [],
  searchHistory: [],
  pullRequests: [],
  toolCallHistory: [],
  completedPhases: [],
  currentPhase: 'analyze',
  taskDescription,
  totalToolCalls: 0,
  totalAPIFallbacks: 0,
  startTime: Date.now(),
});
