/**
 * GitHub Operations with Self-Correction
 * Wraps common GitHub operations with automatic error recovery
 */

import { Octokit } from '@octokit/rest';
import {
  executeWithSelfCorrection,
  buildFilePathCorrectionPrompt,
  buildBranchCorrectionPrompt,
  buildGenericGitHubCorrectionPrompt,
  withAutoRetry,
  LLMCallFunction,
} from './githubSelfCorrection';
import { unescapeContent } from './contentCleaner';

/**
 * Get file content with self-correction for path issues
 */
export async function getFileContentWithCorrection(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    path: string;
    ref?: string;
  },
  llmCall?: LLMCallFunction,
  availableFiles?: string[]
): Promise<{ content: string; sha: string }> {
  return await executeWithSelfCorrection(
    async (p) => {
      const response = await octokit.repos.getContent({
        owner: p.owner,
        repo: p.repo,
        path: p.path,
        ref: p.ref,
      });

      if ('content' in response.data && typeof response.data.content === 'string') {
        return {
          content: Buffer.from(response.data.content, 'base64').toString('utf-8'),
          sha: response.data.sha,
        };
      }

      throw new Error(`Path ${p.path} is not a file`);
    },
    params,
    llmCall,
    (p, error) => {
      return buildFilePathCorrectionPrompt(
        { filePath: p.path, owner: p.owner, repo: p.repo },
        error,
        availableFiles
      );
    }
  );
}

/**
 * Create or update file with self-correction
 */
export async function createOrUpdateFileWithCorrection(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    path: string;
    message: string;
    content: string;
    branch: string;
    sha?: string;
  },
  llmCall?: LLMCallFunction
): Promise<any> {
  return await withAutoRetry(
    async () => {
      return await executeWithSelfCorrection(
        async (p) => {
          // 🔧 CRITICAL: Unescape literal \n, \t, etc. before encoding to base64
          // AI sometimes generates content like "line1\\nline2" instead of actual newlines
          const cleanedContent = unescapeContent(p.content);
          
          const response = await octokit.repos.createOrUpdateFileContents({
            owner: p.owner,
            repo: p.repo,
            path: p.path,
            message: p.message,
            content: Buffer.from(cleanedContent).toString('base64'),
            branch: p.branch,
            sha: p.sha,
          });
          return response.data;
        },
        params,
        llmCall,
        (p, error) => {
          return buildGenericGitHubCorrectionPrompt(
            p,
            error,
            'Creating/updating file. Common issues: wrong branch, missing sha for updates, invalid content encoding'
          );
        }
      );
    },
    {
      maxRetries: 2,
      retryableErrors: ['ECONNRESET', 'timeout', 'network'],
    }
  );
}

/**
 * Get branch with self-correction
 */
export async function getBranchWithCorrection(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    branch: string;
  },
  llmCall?: LLMCallFunction,
  availableBranches?: string[]
): Promise<any> {
  return await executeWithSelfCorrection(
    async (p) => {
      const response = await octokit.repos.getBranch({
        owner: p.owner,
        repo: p.repo,
        branch: p.branch,
      });
      return response.data;
    },
    params,
    llmCall,
    (p, error) => {
      return buildBranchCorrectionPrompt(
        { branch: p.branch, owner: p.owner, repo: p.repo },
        error,
        availableBranches
      );
    }
  );
}

/**
 * Create branch with self-correction
 */
export async function createBranchWithCorrection(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    branch: string;
    baseBranch?: string;
  },
  llmCall?: LLMCallFunction
): Promise<any> {
  return await executeWithSelfCorrection(
    async (p) => {
      // Get base branch SHA
      const baseBranch = p.baseBranch || 'main';
      const baseRef = await octokit.repos.getBranch({
        owner: p.owner,
        repo: p.repo,
        branch: baseBranch,
      });

      // Create new branch
      const response = await octokit.git.createRef({
        owner: p.owner,
        repo: p.repo,
        ref: `refs/heads/${p.branch}`,
        sha: baseRef.data.commit.sha,
      });

      return response.data;
    },
    params,
    llmCall,
    (p, error) => {
      return buildGenericGitHubCorrectionPrompt(
        p,
        error,
        'Creating branch. Common issues: branch already exists, base branch not found, invalid branch name'
      );
    }
  );
}

/**
 * Create pull request with self-correction
 */
export async function createPullRequestWithCorrection(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
    draft?: boolean;
  },
  llmCall?: LLMCallFunction
): Promise<any> {
  return await withAutoRetry(
    async () => {
      return await executeWithSelfCorrection(
        async (p) => {
          const response = await octokit.pulls.create({
            owner: p.owner,
            repo: p.repo,
            title: p.title,
            body: p.body,
            head: p.head,
            base: p.base,
            draft: p.draft || false,
          });
          return response.data;
        },
        params,
        llmCall,
        (p, error) => {
          return buildGenericGitHubCorrectionPrompt(
            p,
            error,
            'Creating PR. Common issues: head/base branches do not exist, no commits difference, validation failed'
          );
        }
      );
    },
    {
      maxRetries: 2,
      retryableErrors: ['ECONNRESET', 'timeout', 'network'],
    }
  );
}

/**
 * Search code with self-correction
 */
export async function searchCodeWithCorrection(
  octokit: Octokit,
  params: {
    q: string;
    per_page?: number;
    page?: number;
  },
  llmCall?: LLMCallFunction
): Promise<any> {
  return await withAutoRetry(
    async () => {
      return await executeWithSelfCorrection(
        async (p) => {
          const response = await octokit.search.code({
            q: p.q,
            per_page: p.per_page || 30,
            page: p.page || 1,
          });
          return response.data;
        },
        params,
        llmCall,
        (p, error) => {
          return buildGenericGitHubCorrectionPrompt(
            p,
            error,
            'Searching code. Common issues: invalid query syntax, rate limiting, query too broad'
          );
        }
      );
    },
    {
      maxRetries: 3,
      retryableErrors: ['rate limit', 'timeout', 'network'],
      delayMs: 2000,
    }
  );
}

/**
 * List repository files with self-correction
 */
export async function listRepoFilesWithCorrection(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    path?: string;
    ref?: string;
  },
  llmCall?: LLMCallFunction
): Promise<any[]> {
  return await executeWithSelfCorrection(
    async (p) => {
      const response = await octokit.repos.getContent({
        owner: p.owner,
        repo: p.repo,
        path: p.path || '',
        ref: p.ref,
      });

      if (Array.isArray(response.data)) {
        return response.data;
      }

      throw new Error(`Path ${p.path} is not a directory`);
    },
    params,
    llmCall,
    (p, error) => {
      return buildFilePathCorrectionPrompt(
        { filePath: p.path || '', owner: p.owner, repo: p.repo },
        error
      );
    }
  );
}

/**
 * Get commits with self-correction and rate limit handling
 */
export async function getCommitsWithCorrection(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    sha?: string;
    path?: string;
    per_page?: number;
    page?: number;
  },
  _llmCall?: LLMCallFunction
): Promise<any[]> {
  return await withAutoRetry(
    async () => {
      const response = await octokit.repos.listCommits({
        owner: params.owner,
        repo: params.repo,
        sha: params.sha,
        path: params.path,
        per_page: params.per_page || 30,
        page: params.page || 1,
      });
      return response.data;
    },
    {
      maxRetries: 3,
      retryableErrors: ['rate limit', 'timeout', 'network', 'ECONNRESET'],
      delayMs: 1000,
      onRetry: (attempt, error) => {
        console.log(`[GitHub Commits] Retry ${attempt} after error: ${error.message}`);
      },
    }
  );
}

/**
 * Fork repository with self-correction
 */
export async function forkRepositoryWithCorrection(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    organization?: string;
  },
  _llmCall?: LLMCallFunction
): Promise<any> {
  return await withAutoRetry(
    async () => {
      // Check if fork already exists
      try {
        const username = (await octokit.users.getAuthenticated()).data.login;
        const existingFork = await octokit.repos.get({
          owner: params.organization || username,
          repo: params.repo,
        });

        if (existingFork.data.fork) {
          console.log('[Fork] Fork already exists, using existing fork');
          return existingFork.data;
        }
      } catch (error: any) {
        // Fork doesn't exist, create it
        if (error.status !== 404) {
          throw error;
        }
      }

      const response = await octokit.repos.createFork({
        owner: params.owner,
        repo: params.repo,
        organization: params.organization,
      });

      // Wait for fork to be ready
      await new Promise((resolve) => setTimeout(resolve, 3000));

      return response.data;
    },
    {
      maxRetries: 2,
      retryableErrors: ['timeout', 'network', 'ECONNRESET'],
      delayMs: 2000,
    }
  );
}

export async function deleteBranchWithCorrection(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    branch: string;
  },
  llmCall?: LLMCallFunction
): Promise<void> {
  return await executeWithSelfCorrection(
    async (p) => {
      await octokit.git.deleteRef({
        owner: p.owner,
        repo: p.repo,
        ref: `heads/${p.branch}`,
      });
    },
    params,
    llmCall,
    (p, error) => {
      return buildGenericGitHubCorrectionPrompt(
        p,
        error,
        'Deleting branch. Common issues: branch does not exist, protected branch, incorrect ref format'
      );
    }
  );
}
