/**
 * GitHub Tools Helper
 * Initialize and provide GitHub MCP tools to agents
 */

import { createTool } from '@iqai/adk'
import { z } from 'zod'
import { createGitHubMcpServer } from '../mcp-servers/github'

export interface GitHubToolsContext {
  token: string
  username: string
  email?: string
}

/**
 * Create ADK-compatible GitHub tools for agent with user context
 */
export function createGitHubTools(context: GitHubToolsContext) {
  const server = createGitHubMcpServer({
    token: context.token,
    owner: context.username,
    enableAIFeatures: false, // Can be enabled later
  })

  // Convert MCP tools to ADK tools format
  const githubTools = [
    createTool({
      name: 'github_list_repositories',
      description: 'List all repositories for the authenticated user',
      schema: z.object({}),
      fn: async () => {
        // Use Octokit directly to list user repos
        const { Octokit } = await import('@octokit/rest');
        const client = new Octokit({ auth: context.token });
        const { data } = await client.repos.listForAuthenticatedUser({ 
          per_page: 100,
          sort: 'updated',
        });
        return {
          total: data.length,
          repositories: data.map((repo: any) => ({
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description || 'No description',
            private: repo.private,
            url: repo.html_url,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            language: repo.language || 'Unknown',
            updatedAt: repo.updated_at,
          })),
        };
      },
    }),

    createTool({
      name: 'github_get_repo_info',
      description: 'Get detailed information about a specific repository',
      schema: z.object({
        owner: z.string().optional().describe('Repository owner (defaults to authenticated user)'),
        repo: z.string().describe('Repository name (required)'),
      }),
      fn: async (args) => server.executeTool('get_repository_info', args),
    }),

    createTool({
      name: 'github_create_issue',
      description: 'Create a new issue in a GitHub repository',
      schema: z.object({
        title: z.string().describe('Issue title'),
        body: z.string().describe('Issue description'),
        labels: z.array(z.string()).optional().describe('Labels to add'),
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      fn: async (args) => server.executeTool('create_issue', args),
    }),

    createTool({
      name: 'github_list_issues',
      description: 'List issues from a repository',
      schema: z.object({
        state: z.enum(['open', 'closed', 'all']).optional().describe('Filter by state'),
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      fn: async (args) => server.executeTool('list_issues', args),
    }),

    createTool({
      name: 'github_create_pull_request',
      description: 'Create a new pull request',
      schema: z.object({
        title: z.string().describe('PR title'),
        body: z.string().describe('PR description'),
        head: z.string().describe('Branch containing changes'),
        base: z.string().describe('Branch to merge into'),
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      fn: async (args) => server.executeTool('create_pull_request', args),
    }),

    createTool({
      name: 'github_get_file_content',
      description: 'Get content of a file from repository',
      schema: z.object({
        path: z.string().describe('File path in repository'),
        ref: z.string().optional().describe('Branch or commit SHA'),
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      fn: async (args) => server.executeTool('get_file_content', args),
    }),

    createTool({
      name: 'github_create_or_update_file',
      description: 'Create or update a file in repository',
      schema: z.object({
        path: z.string().describe('File path'),
        content: z.string().describe('File content (base64 encoded if binary)'),
        message: z.string().describe('Commit message'),
        branch: z.string().optional().describe('Target branch'),
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      fn: async (args) => server.executeTool('create_or_update_file', args),
    }),

    createTool({
      name: 'github_list_commits',
      description: 'List commits from a repository',
      schema: z.object({
        sha: z.string().optional().describe('SHA or branch to start listing from'),
        path: z.string().optional().describe('Only commits containing this path'),
        author: z.string().optional().describe('GitHub login or email'),
        since: z.string().optional().describe('ISO 8601 date'),
        until: z.string().optional().describe('ISO 8601 date'),
        perPage: z.number().optional().describe('Results per page (max 100)'),
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      fn: async (args) => server.executeTool('list_commits', args),
    }),

    createTool({
      name: 'github_create_branch',
      description: 'Create a new branch',
      schema: z.object({
        branchName: z.string().describe('Name of new branch'),
        fromBranch: z.string().optional().describe('Base branch (defaults to default branch)'),
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      fn: async (args) => server.executeTool('create_branch', args),
    }),

    createTool({
      name: 'github_search_code',
      description: 'Search code in repository',
      schema: z.object({
        query: z.string().describe('Search query'),
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      fn: async (args) => server.executeTool('search_code', args),
    }),

    createTool({
      name: 'github_create_repository',
      description: 'Create a new GitHub repository',
      schema: z.object({
        name: z.string().describe('Repository name (required)'),
        description: z.string().optional().describe('Repository description'),
        private: z.boolean().optional().describe('Make repository private (default: false)'),
        autoInit: z.boolean().optional().describe('Initialize with README (default: true)'),
        gitignoreTemplate: z.string().optional().describe('Gitignore template (e.g., Node, Python)'),
        licenseTemplate: z.string().optional().describe('License template (e.g., mit, apache-2.0)'),
        homepage: z.string().optional().describe('Homepage URL'),
      }),
      fn: async (args) => server.executeTool('create_repository', args),
    }),

    createTool({
      name: 'github_push_files',
      description: 'Push multiple files to repository in a single commit. ALWAYS include a descriptive commit message!',
      schema: z.object({
        files: z.array(z.object({
          path: z.string().describe('File path'),
          content: z.string().describe('File content'),
        })).describe('Array of files to push'),
        message: z.string().optional().describe('Commit message (auto-generated if not provided)'),
        branch: z.string().optional().describe('Target branch'),
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      fn: async (args) => {
        // Add fallback commit message
        const finalMessage = args.message || 'GithubAgent commit';
        return server.executeTool('push_files', { ...args, message: finalMessage });
      },
    }),

    createTool({
      name: 'github_delete_repository',
      description: 'Delete a repository (use with caution!)',
      schema: z.object({
        owner: z.string().optional(),
        repo: z.string().optional(),
      }),
      fn: async (args) => server.executeTool('delete_repository', args),
    }),

    createTool({
      name: 'github_fetch_all_files',
      description: 'Fetch all files from a GitHub repository and return them as an array. This is the PREFERRED tool for pulling a codebase for preview or analysis. Returns complete file contents ready to be used.',
      schema: z.object({
        owner: z.string().describe('Repository owner/username'),
        repo: z.string().describe('Repository name'),
        branch: z.string().optional().describe('Branch name (defaults to main/master)'),
      }),
      fn: async (args) => {
        try {
          const { Octokit } = await import('@octokit/rest');
          const client = new Octokit({ auth: context.token });
          
          // Get default branch if not specified
          let branch = args.branch;
          if (!branch) {
            const repoInfo = await client.repos.get({
              owner: args.owner,
              repo: args.repo,
            });
            branch = repoInfo.data.default_branch;
          }

          // Get the tree recursively
          const { data: refData } = await client.git.getRef({
            owner: args.owner,
            repo: args.repo,
            ref: `heads/${branch}`,
          });

          const { data: treeData } = await client.git.getTree({
            owner: args.owner,
            repo: args.repo,
            tree_sha: refData.object.sha,
            recursive: 'true',
          });

          // Filter only files (not trees/directories)
          const files = treeData.tree.filter((item: any) => item.type === 'blob');

          // Fetch content for each file
          const fileContents = await Promise.all(
            files.map(async (file: any) => {
              try {
                const { data: contentData } = await client.repos.getContent({
                  owner: args.owner,
                  repo: args.repo,
                  path: file.path!,
                  ref: branch,
                });

                // Decode base64 content
                const content = Buffer.from(
                  (contentData as any).content,
                  'base64'
                ).toString('utf-8');

                return {
                  path: file.path,
                  content,
                  size: file.size,
                  sha: file.sha,
                };
              } catch (error: any) {
                console.error(`Failed to fetch ${file.path}:`, error.message);
                return {
                  path: file.path,
                  content: '',
                  size: file.size,
                  sha: file.sha,
                  error: error.message,
                };
              }
            })
          );

          return {
            success: true,
            owner: args.owner,
            repo: args.repo,
            branch: branch,
            totalFiles: fileContents.length,
            files: fileContents,
            message: `✅ Successfully fetched ${fileContents.length} files from ${args.owner}/${args.repo}`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            message: `❌ Failed to fetch files: ${error.message}`,
          };
        }
      },
    }),
  ]

  return {
    tools: githubTools,
    // Repository operations
    get_repository_info: async (params: { owner?: string; repo?: string }) => {
      return await server.executeTool('get_repository_info', params)
    },

    list_repositories: async () => {
      // This would need additional Octokit API call
      return { message: 'List repositories not yet implemented' }
    },

    // Issue operations
    create_issue: async (params: {
      title: string
      body: string
      labels?: string[]
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('create_issue', params)
    },

    list_issues: async (params: {
      state?: 'open' | 'closed' | 'all'
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('list_issues', params)
    },

    update_issue: async (params: {
      issueNumber: number
      title?: string
      body?: string
      state?: 'open' | 'closed'
      labels?: string[]
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('update_issue', params)
    },

    search_issues: async (params: { query: string; owner?: string; repo?: string }) => {
      return await server.executeTool('search_issues', params)
    },

    // Pull Request operations
    create_pull_request: async (params: {
      title: string
      body: string
      head: string
      base: string
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('create_pull_request', params)
    },

    list_pull_requests: async (params: {
      state?: 'open' | 'closed' | 'all'
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('list_pull_requests', params)
    },

    merge_pull_request: async (params: {
      pullNumber: number
      commitMessage?: string
      mergeMethod?: 'merge' | 'squash' | 'rebase'
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('merge_pull_request', params)
    },

    review_pull_request: async (params: {
      pullNumber: number
      event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
      body?: string
      comments?: Array<{ path: string; line: number; body: string }>
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('review_pull_request', params)
    },

    get_pull_request_files: async (params: {
      pullNumber: number
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('get_pull_request_files', params)
    },

    // Branch operations
    create_branch: async (params: {
      branchName: string
      fromBranch?: string
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('create_branch', params)
    },

    delete_branch: async (params: {
      branchName: string
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('delete_branch', params)
    },

    list_branches: async (params: { owner?: string; repo?: string }) => {
      return await server.executeTool('list_branches', params)
    },

    // File operations
    get_file_content: async (params: {
      path: string
      ref?: string
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('get_file_content', params)
    },

    create_or_update_file: async (params: {
      path: string
      content: string
      message: string
      branch?: string
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('create_or_update_file', params)
    },

    search_code: async (params: { query: string; owner?: string; repo?: string }) => {
      return await server.executeTool('search_code', params)
    },

    // Commit operations
    list_commits: async (params: {
      sha?: string
      path?: string
      author?: string
      since?: string
      until?: string
      perPage?: number
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('list_commits', params)
    },

    get_commit_diff: async (params: {
      commitSha: string
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('get_commit_diff', params)
    },

    // Workflow operations
    list_workflow_runs: async (params: { owner?: string; repo?: string }) => {
      return await server.executeTool('list_workflow_runs', params)
    },

    trigger_workflow: async (params: {
      workflowId: string | number
      ref: string
      inputs?: Record<string, any>
      owner?: string
      repo?: string
    }) => {
      return await server.executeTool('trigger_workflow', params)
    },

    // Helper: Get server instance for advanced operations
    getServer: () => server,
  }
}

/**
 * GitHub tool descriptions for agent prompt
 */
export const GITHUB_TOOLS_DESCRIPTION = `
## 🔗 GitHub Integration Available

The following GitHub tools are registered and ready to use:

**Repository Management:**
- github_create_repository - Create a new repository
- github_delete_repository - Delete a repository
- github_list_repositories - List ALL user's repositories
- github_get_repo_info - Get specific repository details
- github_fetch_all_files - ⭐ **PREFERRED** Fetch entire codebase from a repo (returns file array ready for preview)

**File Operations:**
- github_get_file_content - Read file from repo
- github_create_or_update_file - Write/update single file
- github_push_files - Push multiple files in one commit (RECOMMENDED for new repos)

**Branch & PR:**
- github_create_branch - Create a new branch
- github_create_pull_request - Create a new PR
- github_list_commits - List repository commits

**Issues:**
- github_create_issue - Create a new issue
- github_list_issues - List repository issues

**Search:**
- github_search_code - Search code in repository

**Usage Examples:**
1. Pull codebase for live preview (SIMPLE):
   - Use github_fetch_all_files with owner/repo/branch
   - Returns complete file array ready to display
   - ONE tool call, done!

2. Create new repo with code:
   - Use github_create_repository to create repo
   - Use github_push_files to push all files at once (faster than multiple single commits)
   - Optionally use github_create_pull_request if working on a branch

3. Update existing repo:
   - Use github_create_branch to create feature branch
   - Use github_push_files to commit changes
   - Use github_create_pull_request to open PR

**Parameters:**
- owner/repo are optional (defaults to user's authenticated context)
- All GitHub operations use user's authenticated token automatically
`

export default createGitHubTools
