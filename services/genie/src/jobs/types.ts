import { Job } from 'bull';

export enum JobType {
  AGENT_TASK = 'agent_task',
  CODE_GENERATION = 'code_generation',
  REPO_ANALYSIS = 'repo_analysis',
}

export enum JobStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
}

export interface AgentTaskJobData {
  userId: string;
  sessionId: string;
  userMessage: string;
  agentType?: string;
  context?: {
    repository?: string;
    branch?: string;
    files?: string[];
    [key: string]: any;
  };
}

export interface JobResult {
  success: boolean;
  result?: any;
  error?: string;
  logs?: string[];
  startTime?: Date;
  endTime?: Date;
  duration?: number;
}

export interface JobInfo {
  id: string;
  type: JobType;
  status: JobStatus;
  data: AgentTaskJobData;
  result?: JobResult;
  progress?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedReason?: string;
  attemptsMade?: number;
  attemptsMax?: number;
}

export type AgentJob = Job<AgentTaskJobData>;
