/**
 * GitHub MCP Server
 * Advanced Model Context Protocol server for GitHub operations
 * Enables AI agents to interact with GitHub repositories autonomously
 */

import { GitHubMcpTool, GitHubConfig } from '../../tools/integrations/githubMcpTool'
import { AIService } from '../../services/AIService'

export interface GitHubMcpServerConfig extends GitHubConfig {
  enableAIFeatures?: boolean
  aiModelName?: string
}

export class GitHubMcpServer {
  private github: GitHubMcpTool
  private aiService?: AIService
  private enableAI: boolean

  constructor(config: GitHubMcpServerConfig) {
    this.github = new GitHubMcpTool({
      token: config.token,
      owner: config.owner,
      repo: config.repo,
    })
    this.enableAI = config.enableAIFeatures || false
    
    if (this.enableAI) {
      this.aiService = new AIService(config.aiModelName || 'gemini-2.5-flash')
    }
  }

  /**
   * Get all available resources
   */
  getResources() {
    return {
      repositories: {
        description: 'Access repository information',
        methods: ['get', 'list', 'search'],
      },
      issues: {
        description: 'Manage issues',
        methods: ['create', 'update', 'list', 'search', 'comment'],
      },
      pullRequests: {
        description: 'Manage pull requests',
        methods: ['create', 'merge', 'review', 'list', 'getFiles'],
      },
      branches: {
        description: 'Manage branches',
        methods: ['create', 'delete', 'list'],
      },
      commits: {
        description: 'Access commit history',
        methods: ['list', 'getDiff'],
      },
      files: {
        description: 'File operations',
        methods: ['read', 'write', 'search'],
      },
      workflows: {
        description: 'GitHub Actions workflows',
        methods: ['list', 'trigger'],
      },
    }
  }

  /**
   * Get all available tools
   */
  getTools() {
    const tools = [
      // Repository operations
      {
        name: 'get_repository_info',
        description: 'Get detailed information about a repository',
        parameters: {
          owner: 'string (optional if configured)',
          repo: 'string (optional if configured)',
        },
      },
      {
        name: 'create_repository',
        description: 'Create a new repository for the authenticated user',
        parameters: {
          name: 'string',
          description: 'string (optional)',
          private: 'boolean (optional)',
          autoInit: 'boolean (optional)',
          gitignoreTemplate: 'string (optional)',
          licenseTemplate: 'string (optional)',
          homepage: 'string (optional)',
        },
      },
      {
        name: 'delete_repository',
        description: 'Delete a repository (use with caution)',
        parameters: {
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'fork_repository',
        description: 'Fork a repository to your account',
        parameters: {
          owner: 'string',
          repo: 'string',
        },
      },
      {
        name: 'list_collaborators',
        description: 'List repository collaborators',
        parameters: {
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'get_tree',
        description: 'Get repository tree structure',
        parameters: {
          treeSha: 'string (optional)',
          recursive: 'boolean (default: false)',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'push_files',
        description: 'Push multiple files to repository in a single commit',
        parameters: {
          files: 'Array<{path: string, content: string}>',
          message: 'string (commit message)',
          branch: 'string (optional)',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },

      // Issue operations
      {
        name: 'create_issue',
        description: 'Create a new issue',
        parameters: {
          title: 'string',
          body: 'string',
          labels: 'string[] (optional)',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'update_issue',
        description: 'Update an existing issue',
        parameters: {
          issueNumber: 'number',
          title: 'string (optional)',
          body: 'string (optional)',
          state: '"open" | "closed" (optional)',
          labels: 'string[] (optional)',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'list_issues',
        description: 'List issues in a repository',
        parameters: {
          state: '"open" | "closed" | "all" (default: "open")',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'search_issues',
        description: 'Search for issues',
        parameters: {
          query: 'string',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'create_comment',
        description: 'Add a comment to an issue or pull request',
        parameters: {
          issueNumber: 'number',
          body: 'string',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },

      // Pull Request operations
      {
        name: 'create_pull_request',
        description: 'Create a new pull request',
        parameters: {
          title: 'string',
          body: 'string',
          head: 'string (branch name)',
          base: 'string (target branch)',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'get_pull_request',
        description: 'Get details of a specific pull request',
        parameters: {
          pullNumber: 'number',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'merge_pull_request',
        description: 'Merge a pull request',
        parameters: {
          pullNumber: 'number',
          commitMessage: 'string (optional)',
          mergeMethod: '"merge" | "squash" | "rebase" (default: "merge")',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'review_pull_request',
        description: 'Add a review to a pull request',
        parameters: {
          pullNumber: 'number',
          event: '"APPROVE" | "REQUEST_CHANGES" | "COMMENT"',
          body: 'string (optional)',
          comments: 'array of line comments (optional)',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'get_pull_request_files',
        description: 'Get files changed in a pull request',
        parameters: {
          pullNumber: 'number',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'list_pull_requests',
        description: 'List pull requests',
        parameters: {
          state: '"open" | "closed" | "all" (default: "open")',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },

      // Branch operations
      {
        name: 'create_branch',
        description: 'Create a new branch',
        parameters: {
          branchName: 'string',
          fromBranch: 'string (optional, defaults to default branch)',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'delete_branch',
        description: 'Delete a branch',
        parameters: {
          branchName: 'string',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'list_branches',
        description: 'List all branches',
        parameters: {
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },

      // File operations
      {
        name: 'get_file_content',
        description: 'Get content of a file',
        parameters: {
          path: 'string',
          ref: 'string (branch/tag/commit, optional)',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'create_or_update_file',
        description: 'Create or update a file',
        parameters: {
          path: 'string',
          content: 'string',
          message: 'string (commit message)',
          branch: 'string (optional)',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'search_code',
        description: 'Search for code in repositories',
        parameters: {
          query: 'string',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },

      // Commit operations
      {
        name: 'list_commits',
        description: 'List commits in a repository',
        parameters: {
          sha: 'string (optional)',
          path: 'string (optional)',
          author: 'string (optional)',
          since: 'string (ISO date, optional)',
          until: 'string (ISO date, optional)',
          perPage: 'number (optional)',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'get_commit_diff',
        description: 'Get diff for a specific commit',
        parameters: {
          commitSha: 'string',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },

      // User operations
      {
        name: 'get_authenticated_user',
        description: 'Get information about the authenticated user',
        parameters: {},
      },

      // Workflow operations
      {
        name: 'list_workflow_runs',
        description: 'List GitHub Actions workflow runs',
        parameters: {
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },
      {
        name: 'trigger_workflow',
        description: 'Trigger a workflow dispatch event',
        parameters: {
          workflowId: 'string | number',
          ref: 'string (branch/tag)',
          inputs: 'object (optional)',
          owner: 'string (optional)',
          repo: 'string (optional)',
        },
      },

      // AI-powered tools
      ...(this.enableAI
        ? [
            {
              name: 'generate_pr_description',
              description: 'AI-generated comprehensive PR description from commits',
              parameters: {
                pullNumber: 'number',
                owner: 'string (optional)',
                repo: 'string (optional)',
              },
            },
            {
              name: 'analyze_code_changes',
              description: 'AI analysis of code changes in a PR',
              parameters: {
                pullNumber: 'number',
                owner: 'string (optional)',
                repo: 'string (optional)',
              },
            },
            {
              name: 'suggest_issue_labels',
              description: 'AI-suggested labels for an issue',
              parameters: {
                issueNumber: 'number',
                owner: 'string (optional)',
                repo: 'string (optional)',
              },
            },
            {
              name: 'auto_review_pr',
              description: 'Automated AI code review with suggestions',
              parameters: {
                pullNumber: 'number',
                owner: 'string (optional)',
                repo: 'string (optional)',
              },
            },
          ]
        : []),
    ]

    return tools
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName: string, parameters: any): Promise<any> {
    try {
      switch (toolName) {
        // Repository operations
        case 'get_repository_info':
          return await this.github.getRepoInfo(parameters.owner, parameters.repo)

        case 'fork_repository':
          return await this.github.forkRepository(parameters.owner, parameters.repo)

        case 'list_collaborators':
          return await this.github.listCollaborators(parameters.owner, parameters.repo)

        // Issue operations
        case 'create_issue':
          return await this.github.createIssue(
            parameters.title,
            parameters.body,
            parameters.labels,
            parameters.owner,
            parameters.repo
          )

        case 'update_issue':
          return await this.github.updateIssue(
            parameters.issueNumber,
            {
              title: parameters.title,
              body: parameters.body,
              state: parameters.state,
              labels: parameters.labels,
              assignees: parameters.assignees,
            },
            parameters.owner,
            parameters.repo
          )

        case 'list_issues':
          return await this.github.listIssues(
            parameters.state || 'open',
            parameters.owner,
            parameters.repo
          )

        case 'search_issues':
          return await this.github.searchIssues(
            parameters.query,
            parameters.owner,
            parameters.repo
          )

        case 'create_comment':
          return await this.github.createComment(
            parameters.issueNumber,
            parameters.body,
            parameters.owner,
            parameters.repo
          )

        // Pull Request operations
        case 'create_pull_request':
          return await this.github.createPullRequest(
            parameters.title,
            parameters.body,
            parameters.head,
            parameters.base,
            parameters.owner,
            parameters.repo
          )

        case 'get_pull_request':
          return await this.github.getPullRequest(
            parameters.pullNumber,
            parameters.owner,
            parameters.repo
          )

        case 'merge_pull_request':
          return await this.github.mergePullRequest(
            parameters.pullNumber,
            parameters.commitMessage,
            parameters.mergeMethod || 'merge',
            parameters.owner,
            parameters.repo
          )

        case 'review_pull_request':
          return await this.github.reviewPullRequest(
            parameters.pullNumber,
            parameters.event,
            parameters.body,
            parameters.comments,
            parameters.owner,
            parameters.repo
          )

        case 'get_pull_request_files':
          return await this.github.getPullRequestFiles(
            parameters.pullNumber,
            parameters.owner,
            parameters.repo
          )

        case 'list_pull_requests':
          return await this.github.listPullRequests(
            parameters.state || 'open',
            parameters.owner,
            parameters.repo
          )

        // Branch operations
        case 'create_branch':
          return await this.github.createBranch(
            parameters.branchName,
            parameters.fromBranch,
            parameters.owner,
            parameters.repo
          )

        case 'delete_branch':
          return await this.github.deleteBranch(
            parameters.branchName,
            parameters.owner,
            parameters.repo
          )

        case 'list_branches':
          return await this.github.listBranches(parameters.owner, parameters.repo)

        // File operations
        case 'get_file_content':
          return await this.github.getFileContent(
            parameters.path,
            parameters.ref,
            parameters.owner,
            parameters.repo
          )

        case 'create_or_update_file':
          return await this.github.createOrUpdateFile(
            parameters.path,
            parameters.content,
            parameters.message,
            parameters.branch,
            parameters.owner,
            parameters.repo
          )

        case 'search_code':
          return await this.github.searchCode(
            parameters.query,
            parameters.owner,
            parameters.repo
          )

        // Repository management operations
        case 'create_repository':
          return await this.github.createRepository(
            parameters.name,
            {
              description: parameters.description,
              private: parameters.private,
              autoInit: parameters.autoInit,
              gitignoreTemplate: parameters.gitignoreTemplate,
              licenseTemplate: parameters.licenseTemplate,
              homepage: parameters.homepage,
            }
          )

        case 'delete_repository':
          return await this.github.deleteRepository(
            parameters.owner,
            parameters.repo
          )

        case 'push_files':
          return await this.github.pushFiles(
            parameters.files,
            parameters.message,
            parameters.branch,
            parameters.owner,
            parameters.repo
          )

        // Commit operations
        case 'list_commits':
          return await this.github.listCommits(
            {
              sha: parameters.sha,
              path: parameters.path,
              author: parameters.author,
              since: parameters.since,
              until: parameters.until,
              perPage: parameters.perPage,
            },
            parameters.owner,
            parameters.repo
          )

        case 'get_commit_diff':
          return await this.github.getCommitDiff(
            parameters.commitSha,
            parameters.owner,
            parameters.repo
          )

        // User operations
        case 'get_authenticated_user':
          return await this.github.getAuthenticatedUser()

        case 'get_tree':
          return await this.github.getTree(
            parameters.treeSha,
            parameters.recursive,
            parameters.owner,
            parameters.repo
          )

        // Workflow operations
        case 'list_workflow_runs':
          return await this.github.listWorkflowRuns(parameters.owner, parameters.repo)

        case 'trigger_workflow':
          return await this.github.triggerWorkflow(
            parameters.workflowId,
            parameters.ref,
            parameters.inputs,
            parameters.owner,
            parameters.repo
          )

        // AI-powered tools
        case 'generate_pr_description':
          return await this.generatePRDescription(
            parameters.pullNumber,
            parameters.owner,
            parameters.repo
          )

        case 'analyze_code_changes':
          return await this.analyzeCodeChanges(
            parameters.pullNumber,
            parameters.owner,
            parameters.repo
          )

        case 'suggest_issue_labels':
          return await this.suggestIssueLabels(
            parameters.issueNumber,
            parameters.owner,
            parameters.repo
          )

        case 'auto_review_pr':
          return await this.autoReviewPR(
            parameters.pullNumber,
            parameters.owner,
            parameters.repo
          )

        default:
          throw new Error(`Unknown tool: ${toolName}`)
      }
    } catch (error) {
      throw new Error(
        `Error executing ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * AI-powered: Generate comprehensive PR description
   */
  private async generatePRDescription(
    pullNumber: number,
    owner?: string,
    repo?: string
  ): Promise<string> {
    if (!this.aiService) {
      throw new Error('AI features are not enabled')
    }

    const pr = await this.github.getPullRequest(pullNumber, owner, repo)
    const files = await this.github.getPullRequestFiles(pullNumber, owner, repo)
    const commits = await this.github.listCommits(
      { sha: pr.body },
      owner,
      repo
    )

    const prompt = `Generate a comprehensive pull request description based on:

PR Title: ${pr.title}
Files Changed: ${files.map(f => `${f.filename} (+${f.additions} -${f.deletions})`).join(', ')}
Recent Commits: ${commits.slice(0, 5).map(c => c.message).join('\n')}

Generate a description that includes:
1. Summary of changes
2. Key features/fixes
3. Testing done
4. Breaking changes (if any)
5. Related issues

Format in Markdown.`

    const description = await this.aiService.generateText(prompt)
    return description
  }

  /**
   * AI-powered: Analyze code changes in a PR
   */
  private async analyzeCodeChanges(
    pullNumber: number,
    owner?: string,
    repo?: string
  ): Promise<{
    summary: string
    complexity: 'low' | 'medium' | 'high'
    suggestions: string[]
    risks: string[]
  }> {
    if (!this.aiService) {
      throw new Error('AI features are not enabled')
    }

    const files = await this.github.getPullRequestFiles(pullNumber, owner, repo)
    
    const codeChanges = files
      .filter(f => f.patch)
      .map(f => `File: ${f.filename}\n${f.patch}`)
      .join('\n\n')

    const prompt = `Analyze these code changes and provide:
1. Brief summary
2. Complexity level (low/medium/high)
3. Improvement suggestions
4. Potential risks

Code Changes:
${codeChanges}

Return JSON format: { summary, complexity, suggestions: [], risks: [] }`

    const analysis = await this.aiService.generateText(prompt)
    return JSON.parse(analysis)
  }

  /**
   * AI-powered: Suggest labels for an issue
   */
  private async suggestIssueLabels(
    issueNumber: number,
    owner?: string,
    repo?: string
  ): Promise<string[]> {
    if (!this.aiService) {
      throw new Error('AI features are not enabled')
    }

    const issues = await this.github.listIssues('open', owner, repo)
    const issue = issues.find(i => i.number === issueNumber)

    if (!issue) {
      throw new Error(`Issue #${issueNumber} not found`)
    }

    const prompt = `Based on this issue, suggest appropriate labels:

Title: ${issue.title}
Body: ${issue.body}

Common labels: bug, feature, enhancement, documentation, help wanted, good first issue, security, performance

Return only label names as JSON array.`

    const labels = await this.aiService.generateText(prompt)
    return JSON.parse(labels)
  }

  /**
   * AI-powered: Automated code review
   */
  private async autoReviewPR(
    pullNumber: number,
    owner?: string,
    repo?: string
  ): Promise<{
    decision: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
    feedback: string
    lineComments: Array<{ path: string; line: number; body: string }>
  }> {
    if (!this.aiService) {
      throw new Error('AI features are not enabled')
    }

    const files = await this.github.getPullRequestFiles(pullNumber, owner, repo)
    
    const codeChanges = files
      .filter(f => f.patch)
      .slice(0, 5) // Limit to first 5 files for token efficiency
      .map(f => `File: ${f.filename}\n${f.patch}`)
      .join('\n\n')

    const prompt = `Perform code review on these changes:

${codeChanges}

Provide:
1. Review decision: APPROVE, REQUEST_CHANGES, or COMMENT
2. Overall feedback
3. Specific line comments (if any issues found)

Focus on:
- Code quality
- Potential bugs
- Security issues
- Best practices
- Performance concerns

Return JSON: { decision, feedback, lineComments: [{path, line, body}] }`

    const review = await this.aiService.generateText(prompt)
    return JSON.parse(review)
  }
}

/**
 * Create GitHub MCP Server instance
 */
export function createGitHubMcpServer(config: GitHubMcpServerConfig): GitHubMcpServer {
  return new GitHubMcpServer(config)
}
