/**
 * GitHub Tools with Bot Token Support
 * 
 * This module provides GitHub tools that use the Genie AI bot token
 * for public repository operations, eliminating the need for users to
 * provide their personal access tokens for most operations.
 * 
 * STRATEGY:
 * - Bot Token: Used for PRs (via fork), issues, comments, forking, reading public repos
 * - User Token: Only needed for creating repos in user's account, direct push, merge PRs, delete repos
 * - Bot Account: Used for operations that need write access (create repo in bot account, give user link)
 * 
 * WORKFLOW:
 * 1. User asks to create PR → Bot forks repo → Bot creates branch in fork → Bot commits → Bot creates PR
 * 2. User asks to create issue → Bot creates issue (appears as from bot)
 * 3. User asks to create repo → Bot creates in bot account → Returns link to user (user can fork if needed)
 * 4. User asks to delete repo → Bot deletes from bot account (not user's repos)
 */

import { createTool } from '@iqai/adk'
import { z } from 'zod'
import { createGitHubMcpServer } from '../mcp-servers/github'
import { getConfig } from './config'

/**
 * Create ADK-compatible GitHub tools using bot token
 * These tools work on public repositories without requiring user's personal token
 */
export function createBotGitHubTools() {
  const config = getConfig()
  
  if (!config.geniebotGithubToken) {
    throw new Error('GENIE_BOT_GITHUB_TOKEN (or legacy CODEFORGE_BOT_GITHUB_TOKEN) not configured. Bot operations are unavailable.')
  }

  const botToken = config.geniebotGithubToken
  const botUsername = config.geniebotGithubUsername || 'genie-ai-bot'

  // Create server instance with bot token
  const server = createGitHubMcpServer({
    token: botToken,
    owner: botUsername,
    enableAIFeatures: false,
  })

  const githubTools = [
    createTool({
      name: 'bot_github_fork_repository',
      description: 'Fork a public repository to bot account (for creating PRs)',
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
      }),
      fn: async (args) => {
        const { Octokit } = await import('@octokit/rest')
        const client = new Octokit({ auth: botToken })
        
        try {
          const { data } = await client.repos.createFork({
            owner: args.owner,
            repo: args.repo,
          })
          
          return {
            success: true,
            fork: {
              owner: data.owner.login,
              repo: data.name,
              url: data.html_url,
              cloneUrl: data.clone_url,
            },
            message: `✅ Forked ${args.owner}/${args.repo} to ${data.owner.login}/${data.name}`,
          }
        } catch (error: any) {
          // Check if fork already exists
          if (error.status === 422) {
            return {
              success: true,
              fork: {
                owner: botUsername,
                repo: args.repo,
                url: `https://github.com/${botUsername}/${args.repo}`,
              },
              message: `ℹ️ Fork already exists: ${botUsername}/${args.repo}`,
            }
          }
          throw error
        }
      },
    }),

    createTool({
      name: 'bot_github_create_pull_request_from_fork',
      description: 'Create a pull request from bot fork to original repository',
      schema: z.object({
        owner: z.string().describe('Original repository owner'),
        repo: z.string().describe('Original repository name'),
        title: z.string().describe('PR title'),
        body: z.string().describe('PR description'),
        head_branch: z.string().describe('Branch name in fork (e.g., "feature-xyz")'),
        base_branch: z.string().optional().default('main').describe('Base branch in original repo'),
      }),
      fn: async (args) => {
        const { Octokit } = await import('@octokit/rest')
        const client = new Octokit({ auth: botToken })
        
        try {
          const { data } = await client.pulls.create({
            owner: args.owner,
            repo: args.repo,
            title: args.title,
            body: `${args.body}\n\n---\n🤖 *This PR was created by Genie AI Bot*`,
            head: `${botUsername}:${args.head_branch}`, // fork:branch format
            base: args.base_branch,
          })
          
          return {
            success: true,
            pr: {
              number: data.number,
              url: data.html_url,
              title: data.title,
              state: data.state,
            },
            message: `✅ Created PR #${data.number}: ${data.title}`,
          }
        } catch (error: any) {
          // Handle permission errors
          if (error.status === 403) {
            return {
              success: false,
              error: 'permission_denied',
              message: `❌ Cannot create PR: Bot doesn't have permission to create PRs in ${args.owner}/${args.repo}.
              
This usually means:
1. **Repository is private** - Bot can only create PRs to public repos without collaborator access
2. **Bot is not a collaborator** - Ask the repo owner to add '${botUsername}' as a collaborator

**Alternative Solutions:**
- Make the repository public (temporarily if needed)
- Add bot as collaborator: Go to repo Settings → Collaborators → Add '${botUsername}'
- Create an issue instead with the proposed changes
- Push directly if you have write access (requires your personal token)

**What was done:**
✅ Forked repository to bot account: https://github.com/${botUsername}/${args.repo}
✅ Created branch: ${args.head_branch}
✅ Pushed changes to fork

You can manually create a PR from the fork:
https://github.com/${args.owner}/${args.repo}/compare/${args.base_branch}...${botUsername}:${args.repo}:${args.head_branch}`,
              fork_url: `https://github.com/${botUsername}/${args.repo}`,
              branch: args.head_branch,
              manual_pr_url: `https://github.com/${args.owner}/${args.repo}/compare/${args.base_branch}...${botUsername}:${args.repo}:${args.head_branch}`,
            }
          }
          
          // Handle other errors
          throw error
        }
      },
    }),

    createTool({
      name: 'bot_github_create_branch_in_fork',
      description: 'Create a new branch in bot fork',
      schema: z.object({
        repo: z.string().describe('Repository name (in bot account)'),
        branchName: z.string().describe('New branch name'),
        fromBranch: z.string().optional().default('main').describe('Base branch'),
      }),
      fn: async (args) => {
        return await server.executeTool('create_branch', {
          owner: botUsername,
          repo: args.repo,
          branchName: args.branchName,
          fromBranch: args.fromBranch,
        })
      },
    }),

    createTool({
      name: 'bot_github_push_to_fork',
      description: 'Push file changes to a repository (fork or bot-owned repo). IMPORTANT: ALWAYS include a descriptive commit message! If not provided, a fallback message will be auto-generated. Use this for: 1) Pushing to forked repos (any branch) 2) Pushing to bot-owned repos created via bot_github_create_repository (typically to main branch)',
      schema: z.object({
        repo: z.string().describe('Repository name (in bot account)'),
        files: z.array(z.object({
          path: z.string(),
          content: z.string(),
        })).describe('Files to push'),
        message: z.string().optional().describe('Commit message (RECOMMENDED - provide descriptive message; auto-generated if omitted)'),
        branch: z.string().describe('Target branch (e.g., "main" for new repos, feature branch for forks)'),
      }),
      fn: async (args) => {
        const fileCount = args.files.length;
        const filePaths = args.files.map(f => f.path).join(', ');
        const autoMessage = args.message || `🤖 Genie AI: Updated ${fileCount} file${fileCount > 1 ? 's' : ''} (${filePaths})`;
        
        return await server.executeTool('push_files', {
          owner: botUsername,
          repo: args.repo,
          files: args.files,
          message: autoMessage,
          branch: args.branch,
        })
      },
    }),

    createTool({
      name: 'bot_github_create_issue',
      description: 'Create an issue in a public repository (will appear as created by bot)',
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        title: z.string().describe('Issue title'),
        body: z.string().describe('Issue description'),
        labels: z.array(z.string()).optional().describe('Labels'),
      }),
      fn: async (args) => {
        const { Octokit } = await import('@octokit/rest')
        const client = new Octokit({ auth: botToken })
        
        const { data } = await client.issues.create({
          owner: args.owner,
          repo: args.repo,
          title: args.title,
          body: `${args.body}\n\n---\n🤖 *This issue was created by Genie AI Bot on behalf of a user*`,
          labels: args.labels,
        })
        
        return {
          success: true,
          issue: {
            number: data.number,
            url: data.html_url,
            title: data.title,
            state: data.state,
          },
          message: `✅ Created issue #${data.number}: ${data.title}`,
        }
      },
    }),

    createTool({
      name: 'bot_github_comment_on_issue',
      description: 'Add a comment to an issue or PR',
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        issue_number: z.number().describe('Issue or PR number'),
        body: z.string().describe('Comment text'),
      }),
      fn: async (args) => {
        const { Octokit } = await import('@octokit/rest')
        const client = new Octokit({ auth: botToken })
        
        const { data } = await client.issues.createComment({
          owner: args.owner,
          repo: args.repo,
          issue_number: args.issue_number,
          body: `${args.body}\n\n---\n🤖 *Genie AI Bot*`,
        })
        
        return {
          success: true,
          comment: {
            id: data.id,
            url: data.html_url,
          },
          message: `✅ Added comment to #${args.issue_number}`,
        }
      },
    }),

    createTool({
      name: 'bot_github_get_file_content',
      description: 'Get file content from any public repository (no auth needed for public repos)',
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        path: z.string().describe('File path'),
        ref: z.string().optional().describe('Branch or commit SHA'),
      }),
      fn: async (args) => {
        return await server.executeTool('get_file_content', {
          owner: args.owner,
          repo: args.repo,
          path: args.path,
          ref: args.ref,
        })
      },
    }),

    createTool({
      name: 'bot_github_get_repo_info',
      description: 'Get repository information from any public repository',
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
      }),
      fn: async (args) => {
        return await server.executeTool('get_repository_info', args)
      },
    }),

    createTool({
      name: 'bot_github_list_branches',
      description: 'List branches in a repository',
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
      }),
      fn: async (args) => {
        return await server.executeTool('list_branches', args)
      },
    }),

    createTool({
      name: 'bot_github_create_repo_in_bot_account',
      description: 'Create a new repository in bot account (user can fork it later)',
      schema: z.object({
        name: z.string().describe('Repository name'),
        description: z.string().optional().describe('Repository description'),
        private: z.boolean().optional().default(false).describe('Make repository private'),
        autoInit: z.boolean().optional().default(true).describe('Initialize with README'),
      }),
      fn: async (args) => {
        const { Octokit } = await import('@octokit/rest')
        const client = new Octokit({ auth: botToken })
        
        const { data } = await client.repos.createForAuthenticatedUser({
          name: args.name,
          description: args.description,
          private: args.private,
          auto_init: args.autoInit,
        })
        
        return {
          success: true,
          repository: {
            owner: data.owner.login,
            name: data.name,
            url: data.html_url,
            cloneUrl: data.clone_url,
            description: data.description,
          },
          message: `✅ Created repository: ${data.html_url}\n\n💡 This repo is in the bot account. You can fork it to your account if needed!`,
        }
      },
    }),

    createTool({
      name: 'bot_github_search_code',
      description: 'Search code in public repositories',
      schema: z.object({
        query: z.string().describe('Search query'),
        owner: z.string().optional().describe('Limit to specific owner'),
        repo: z.string().optional().describe('Limit to specific repo'),
      }),
      fn: async (args) => {
        return await server.executeTool('search_code', args)
      },
    }),

    createTool({
      name: 'bot_github_list_issues',
      description: 'List issues from a repository',
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        state: z.enum(['open', 'closed', 'all']).optional().default('open'),
      }),
      fn: async (args) => {
        return await server.executeTool('list_issues', args)
      },
    }),

    createTool({
      name: 'bot_github_list_pull_requests',
      description: 'List pull requests from a repository',
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        state: z.enum(['open', 'closed', 'all']).optional().default('open'),
      }),
      fn: async (args) => {
        return await server.executeTool('list_pull_requests', args)
      },
    }),

    createTool({
      name: 'bot_github_search_users',
      description: 'Search for GitHub users by username or name',
      schema: z.object({
        query: z.string().describe('Search query (username or name)'),
        perPage: z.number().optional().default(10).describe('Results per page (max 100)'),
      }),
      fn: async (args) => {
        const { Octokit } = await import('@octokit/rest')
        const client = new Octokit({ auth: botToken })
        
        const { data } = await client.search.users({
          q: args.query,
          per_page: args.perPage,
        })
        
        return {
          success: true,
          total: data.total_count,
          users: data.items.map((user: any) => ({
            username: user.login,
            id: user.id,
            type: user.type,
            url: user.html_url,
            avatar: user.avatar_url,
          })),
          message: `✅ Found ${data.total_count} users matching "${args.query}"`,
        }
      },
    }),

    createTool({
      name: 'bot_github_get_user_info',
      description: 'Get detailed information about a GitHub user',
      schema: z.object({
        username: z.string().describe('GitHub username'),
      }),
      fn: async (args) => {
        const { Octokit } = await import('@octokit/rest')
        const client = new Octokit({ auth: botToken })
        
        const { data } = await client.users.getByUsername({
          username: args.username,
        })
        
        return {
          success: true,
          user: {
            username: data.login,
            name: data.name,
            bio: data.bio,
            company: data.company,
            location: data.location,
            email: data.email,
            blog: data.blog,
            twitter: data.twitter_username,
            publicRepos: data.public_repos,
            publicGists: data.public_gists,
            followers: data.followers,
            following: data.following,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            url: data.html_url,
            avatar: data.avatar_url,
          },
          message: `✅ Retrieved info for user: ${data.login}`,
        }
      },
    }),

    createTool({
      name: 'bot_github_list_user_repositories',
      description: 'List all public repositories for a specific GitHub user',
      schema: z.object({
        username: z.string().describe('GitHub username'),
        type: z.enum(['all', 'owner', 'member']).optional().default('owner').describe('Filter by repo type'),
        sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional().default('updated').describe('Sort by'),
        perPage: z.number().optional().default(30).describe('Results per page (max 100)'),
      }),
      fn: async (args) => {
        const { Octokit } = await import('@octokit/rest')
        const client = new Octokit({ auth: botToken })
        
        const { data } = await client.repos.listForUser({
          username: args.username,
          type: args.type,
          sort: args.sort,
          per_page: args.perPage,
        })
        
        return {
          success: true,
          total: data.length,
          repositories: data.map((repo: any) => ({
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description || 'No description',
            private: repo.private,
            fork: repo.fork,
            url: repo.html_url,
            homepage: repo.homepage,
            stars: repo.stargazers_count,
            watchers: repo.watchers_count,
            forks: repo.forks_count,
            language: repo.language || 'Unknown',
            openIssues: repo.open_issues_count,
            defaultBranch: repo.default_branch,
            createdAt: repo.created_at,
            updatedAt: repo.updated_at,
            pushedAt: repo.pushed_at,
          })),
          message: `✅ Found ${data.length} repositories for user: ${args.username}`,
        }
      },
    }),

    createTool({
      name: 'bot_github_search_repositories',
      description: 'Search for GitHub repositories by name, description, or other criteria',
      schema: z.object({
        query: z.string().describe('Search query (e.g., "react" or "user:facebook react" or "language:typescript stars:>1000")'),
        sort: z.enum(['stars', 'forks', 'help-wanted-issues', 'updated']).optional().describe('Sort results by'),
        order: z.enum(['asc', 'desc']).optional().default('desc').describe('Sort order'),
        perPage: z.number().optional().default(10).describe('Results per page (max 100)'),
      }),
      fn: async (args) => {
        const { Octokit } = await import('@octokit/rest')
        const client = new Octokit({ auth: botToken })
        
        const { data } = await client.search.repos({
          q: args.query,
          sort: args.sort,
          order: args.order,
          per_page: args.perPage,
        })
        
        return {
          success: true,
          total: data.total_count,
          repositories: data.items.map((repo: any) => ({
            name: repo.name,
            fullName: repo.full_name,
            owner: repo.owner.login,
            description: repo.description || 'No description',
            private: repo.private,
            fork: repo.fork,
            url: repo.html_url,
            stars: repo.stargazers_count,
            watchers: repo.watchers_count,
            forks: repo.forks_count,
            language: repo.language || 'Unknown',
            openIssues: repo.open_issues_count,
            topics: repo.topics || [],
            createdAt: repo.created_at,
            updatedAt: repo.updated_at,
          })),
          message: `✅ Found ${data.total_count} repositories matching "${args.query}"`,
        }
      },
    }),

    createTool({
      name: 'bot_github_list_commits',
      description: 'List commits from a repository',
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        sha: z.string().optional().describe('Branch or commit SHA to start from'),
        path: z.string().optional().describe('Only commits containing this file path'),
        author: z.string().optional().describe('GitHub username or email'),
        since: z.string().optional().describe('ISO 8601 date - only commits after this date'),
        until: z.string().optional().describe('ISO 8601 date - only commits before this date'),
        perPage: z.number().optional().default(30).describe('Results per page (max 100)'),
      }),
      fn: async (args) => {
        return await server.executeTool('list_commits', args)
      },
    }),

    createTool({
      name: 'bot_github_get_repo_tree',
      description: 'Get the directory tree/structure of a repository',
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        branch: z.string().optional().default('main').describe('Branch name'),
        recursive: z.boolean().optional().default(true).describe('Get full tree recursively'),
      }),
      fn: async (args) => {
        const { Octokit } = await import('@octokit/rest')
        const client = new Octokit({ auth: botToken })
        
        // Get the default branch's SHA
        const { data: branchData } = await client.repos.getBranch({
          owner: args.owner,
          repo: args.repo,
          branch: args.branch,
        })
        
        const treeSha = branchData.commit.sha
        
        // Get the tree
        const { data: treeData } = await client.git.getTree({
          owner: args.owner,
          repo: args.repo,
          tree_sha: treeSha,
          recursive: args.recursive ? 'true' : undefined,
        })
        
        return {
          success: true,
          tree: treeData.tree.map((item: any) => ({
            path: item.path,
            mode: item.mode,
            type: item.type,
            sha: item.sha,
            size: item.size,
            url: item.url,
          })),
          truncated: treeData.truncated,
          message: `✅ Retrieved ${treeData.tree.length} items from ${args.owner}/${args.repo}`,
        }
      },
    }),

    createTool({
      name: 'bot_github_list_repo_contributors',
      description: 'List contributors to a repository',
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        perPage: z.number().optional().default(30).describe('Results per page (max 100)'),
      }),
      fn: async (args) => {
        const { Octokit } = await import('@octokit/rest')
        const client = new Octokit({ auth: botToken })
        
        const { data } = await client.repos.listContributors({
          owner: args.owner,
          repo: args.repo,
          per_page: args.perPage,
        })
        
        return {
          success: true,
          total: data.length,
          contributors: data.map((contributor: any) => ({
            username: contributor.login,
            contributions: contributor.contributions,
            url: contributor.html_url,
            avatar: contributor.avatar_url,
            type: contributor.type,
          })),
          message: `✅ Found ${data.length} contributors for ${args.owner}/${args.repo}`,
        }
      },
    }),
  ]

  return {
    tools: githubTools,
    botUsername,
    botToken,
  }
}

/**
 * Bot GitHub tools description for agent prompt
 */
export const BOT_GITHUB_TOOLS_DESCRIPTION = `
## 🤖 GitHub Bot Integration (No User Token Required!)

The bot can perform most GitHub operations on PUBLIC repositories without requiring your personal access token:

**✅ What Bot Can Do (No User Token Needed):**

**Discovery & Search:**
- bot_github_search_users - Find GitHub users by username or name
- bot_github_get_user_info - Get detailed user profile information
- bot_github_list_user_repositories - List ALL repositories of a specific user
- bot_github_search_repositories - Search repos by name, language, stars, etc.
- bot_github_search_code - Search code across repositories

**New Repository Workflow (Direct Push):**
1. bot_github_create_repo_in_bot_account - Create new repo in bot account (no user token needed!)
2. bot_github_push_to_fork - Push all code files directly to main branch
3. DONE - No forking/branching/PR needed for initial commit!

**Pull Request Workflow (Existing Repos):**
1. bot_github_fork_repository - Fork target repo to bot account
2. bot_github_create_branch_in_fork - Create feature branch in fork
3. bot_github_push_to_fork - Push your changes to fork branch
4. bot_github_create_pull_request_from_fork - Create PR from fork to original repo

**Issues & Communication:**
- bot_github_create_issue - Create issues (appears as bot)
- bot_github_comment_on_issue - Comment on issues/PRs
- bot_github_list_issues - List issues
- bot_github_list_pull_requests - List PRs

**Repository Operations:**
- bot_github_get_file_content - Read files from any public repo
- bot_github_get_repo_info - Get specific repo information
- bot_github_list_branches - List branches in a repo
- bot_github_list_commits - List commits with filters (author, date, path)
- bot_github_get_repo_tree - Get full directory structure
- bot_github_list_repo_contributors - List contributors to a repo

**Bot Account Operations:**
- bot_github_create_repo_in_bot_account - Create repo in bot account (user can fork)

**Example Discovery Queries:**
- "Find user with username 'octocat'"
- "List all repositories of user 'facebook'"
- "Search for React repositories with more than 10k stars"
- "Show me TypeScript projects about AI"
- "Who are the top contributors to the 'react' repo?"

**❌ Operations That Need User Collaboration:**

1. **Creating branches in user's repo:** Ask user to add bot as collaborator
2. **Merging PRs:** User must merge (or add bot as collaborator with write access)
3. **Deleting user's repos:** Only user can delete their repos
4. **Creating repos in user's account:** Use bot account, user can fork

**Recommended Workflows:**

**Scenario A: Create NEW Repository (in Bot Account)**
\`\`\`
User: "Create a new repo 'calculator-app' with HTML calculator"

Bot Actions:
1. Create repo in bot account → bot_github_create_repo_in_bot_account('calculator-app')
2. Generate code files (index.html, styles.css, script.js)
3. Push to main → bot_github_push_to_fork(repo, files, message, branch='main')
4. Return repo URL: https://github.com/genie-ai-bot/calculator-app

Result: ✅ Repository created in bot account with code live on main branch!
Note: No forking/branching/PR needed for new repos
User can fork the bot's repo to their account if they want
\`\`\`

**Scenario B: Modify EXISTING Repository**
\`\`\`
User: "Add dark mode to my myapp repo"

Bot Actions:
1. Fork user's repo → genie-ai-bot/myapp
2. Create branch in fork → genie-ai-bot/myapp:add-dark-mode
3. Push dark mode files to fork branch
4. Create PR from genie-ai-bot/myapp:add-dark-mode → user/myapp:main
5. Return PR link to user

Result: ✅ PR created without user's personal token!
\`\`\`

**Note:** All bot operations will show "🤖 Genie AI Bot" as the author. This is transparent and secure.
`

export default createBotGitHubTools
