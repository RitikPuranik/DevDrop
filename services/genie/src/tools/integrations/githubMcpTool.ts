import { Octokit } from '@octokit/rest'

/**
 * GitHub MCP Tool
 * Octokit wrapper for GitHub operations
 */

export interface GitHubConfig {
  token: string
  owner?: string
  repo?: string
}

export interface GitHubRepoInfo {
  name: string
  fullName: string
  description: string
  language: string
  stars: number
  forks: number
  openIssues: number
  defaultBranch: string
  url: string
}

export interface GitHubPullRequest {
  number: number
  title: string
  body: string
  state: string
  url: string
  createdAt: string
  updatedAt: string
}

export interface GitHubIssue {
  number: number
  title: string
  body: string
  state: string
  labels: string[]
  url: string
  createdAt: string
}

export class GitHubMcpTool {
  private octokit: Octokit
  private owner?: string
  private repo?: string

  constructor(config: GitHubConfig) {
    this.octokit = new Octokit({
      auth: config.token,
    })
    this.owner = config.owner
    this.repo = config.repo
  }

  /**
   * Get repository information
   */
  async getRepoInfo(owner?: string, repo?: string): Promise<GitHubRepoInfo> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.repos.get({
      owner: repoOwner,
      repo: repoName,
    })

    return {
      name: data.name,
      fullName: data.full_name,
      description: data.description || '',
      language: data.language || 'Unknown',
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssues: data.open_issues_count,
      defaultBranch: data.default_branch,
      url: data.html_url,
    }
  }

  /**
   * Get file content from repository
   */
  async getFileContent(
    path: string,
    ref?: string,
    owner?: string,
    repo?: string
  ): Promise<string> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path,
      ref,
    })

    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(`Path ${path} is not a file`)
    }

    if (!data.content) {
      throw new Error(`File ${path} has no content`)
    }

    return Buffer.from(data.content, 'base64').toString('utf-8')
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string,
    owner?: string,
    repo?: string
  ): Promise<GitHubPullRequest> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.pulls.create({
      owner: repoOwner,
      repo: repoName,
      title,
      body,
      head,
      base,
    })

    return {
      number: data.number,
      title: data.title,
      body: data.body || '',
      state: data.state,
      url: data.html_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  /**
   * List pull requests
   */
  async listPullRequests(
    state: 'open' | 'closed' | 'all' = 'open',
    owner?: string,
    repo?: string
  ): Promise<GitHubPullRequest[]> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.pulls.list({
      owner: repoOwner,
      repo: repoName,
      state,
    })

    return data.map(pr => ({
      number: pr.number,
      title: pr.title,
      body: pr.body || '',
      state: pr.state,
      url: pr.html_url,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    }))
  }

  /**
   * Create an issue
   */
  async createIssue(
    title: string,
    body: string,
    labels?: string[],
    owner?: string,
    repo?: string
  ): Promise<GitHubIssue> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.issues.create({
      owner: repoOwner,
      repo: repoName,
      title,
      body,
      labels,
    })

    return {
      number: data.number,
      title: data.title,
      body: data.body || '',
      state: data.state,
      labels: data.labels.map(l => (typeof l === 'string' ? l : l.name || '')),
      url: data.html_url,
      createdAt: data.created_at,
    }
  }

  /**
   * List issues
   */
  async listIssues(
    state: 'open' | 'closed' | 'all' = 'open',
    owner?: string,
    repo?: string
  ): Promise<GitHubIssue[]> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.issues.listForRepo({
      owner: repoOwner,
      repo: repoName,
      state,
    })

    return data.map(issue => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      state: issue.state,
      labels: issue.labels.map(l => (typeof l === 'string' ? l : l.name || '')),
      url: issue.html_url,
      createdAt: issue.created_at,
    }))
  }

  /**
   * Get commits for a repository
   */
  async listCommits(
    options: {
      sha?: string
      path?: string
      author?: string
      since?: string
      until?: string
      perPage?: number
    } = {},
    owner?: string,
    repo?: string
  ): Promise<
    Array<{
      sha: string
      message: string
      author: string
      date: string
      url: string
    }>
  > {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.repos.listCommits({
      owner: repoOwner,
      repo: repoName,
      sha: options.sha,
      path: options.path,
      author: options.author,
      since: options.since,
      until: options.until,
      per_page: options.perPage || 30,
    })

    return data.map(commit => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author?.name || 'Unknown',
      date: commit.commit.author?.date || '',
      url: commit.html_url,
    }))
  }

  /**
   * Create a comment on an issue or PR
   */
  async createComment(
    issueNumber: number,
    body: string,
    owner?: string,
    repo?: string
  ): Promise<void> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    await this.octokit.issues.createComment({
      owner: repoOwner,
      repo: repoName,
      issue_number: issueNumber,
      body,
    })
  }

  /**
   * Get authenticated user
   */
  async getAuthenticatedUser(): Promise<{
    login: string
    name: string
    email: string
  }> {
    const { data } = await this.octokit.users.getAuthenticated()

    return {
      login: data.login,
      name: data.name || '',
      email: data.email || '',
    }
  }

  /**
   * Create or update a file
   */
  async createOrUpdateFile(
    path: string,
    content: string,
    message: string,
    branch?: string,
    owner?: string,
    repo?: string
  ): Promise<void> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    // Get file SHA if it exists
    let sha: string | undefined
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: repoOwner,
        repo: repoName,
        path,
        ref: branch,
      })

      if (!Array.isArray(data) && data.type === 'file') {
        sha = data.sha
      }
    } catch (error) {
      // File doesn't exist, that's okay
    }

    await this.octokit.repos.createOrUpdateFileContents({
      owner: repoOwner,
      repo: repoName,
      path,
      message,
      content: Buffer.from(content).toString('base64'),
      sha,
      branch,
    })
  }

  /**
   * Get repository tree
   */
  async getTree(
    treeSha?: string,
    recursive: boolean = false,
    owner?: string,
    repo?: string
  ): Promise<
    Array<{
      path: string
      mode: string
      type: string
      sha: string
      size?: number
    }>
  > {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const sha = treeSha || (await this.getRepoInfo(repoOwner, repoName)).defaultBranch

    const { data } = await this.octokit.git.getTree({
      owner: repoOwner,
      repo: repoName,
      tree_sha: sha,
      recursive: recursive ? '1' : undefined,
    })

    return (
      data.tree?.map(item => ({
        path: item.path || '',
        mode: item.mode || '',
        type: item.type || '',
        sha: item.sha || '',
        size: item.size,
      })) || []
    )
  }

  /**
   * List branches
   */
  async listBranches(
    owner?: string,
    repo?: string
  ): Promise<Array<{ name: string; protected: boolean; sha: string }>> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.repos.listBranches({
      owner: repoOwner,
      repo: repoName,
    })

    return data.map(branch => ({
      name: branch.name,
      protected: branch.protected,
      sha: branch.commit.sha,
    }))
  }

  /**
   * Create a new branch
   */
  async createBranch(
    branchName: string,
    fromBranch?: string,
    owner?: string,
    repo?: string
  ): Promise<void> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    // Get SHA of the source branch
    const repoInfo = await this.getRepoInfo(repoOwner, repoName)
    const sourceBranch = fromBranch || repoInfo.defaultBranch

    const { data: refData } = await this.octokit.git.getRef({
      owner: repoOwner,
      repo: repoName,
      ref: `heads/${sourceBranch}`,
    })

    await this.octokit.git.createRef({
      owner: repoOwner,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    })
  }

  /**
   * Delete a branch
   */
  async deleteBranch(
    branchName: string,
    owner?: string,
    repo?: string
  ): Promise<void> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    await this.octokit.git.deleteRef({
      owner: repoOwner,
      repo: repoName,
      ref: `heads/${branchName}`,
    })
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(
    pullNumber: number,
    commitMessage?: string,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge',
    owner?: string,
    repo?: string
  ): Promise<void> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    await this.octokit.pulls.merge({
      owner: repoOwner,
      repo: repoName,
      pull_number: pullNumber,
      commit_message: commitMessage,
      merge_method: mergeMethod,
    })
  }

  /**
   * Add review to a pull request
   */
  async reviewPullRequest(
    pullNumber: number,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body?: string,
    comments?: Array<{
      path: string
      line: number
      body: string
    }>,
    owner?: string,
    repo?: string
  ): Promise<void> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    await this.octokit.pulls.createReview({
      owner: repoOwner,
      repo: repoName,
      pull_number: pullNumber,
      event,
      body,
      comments,
    })
  }

  /**
   * Get pull request files
   */
  async getPullRequestFiles(
    pullNumber: number,
    owner?: string,
    repo?: string
  ): Promise<
    Array<{
      filename: string
      status: string
      additions: number
      deletions: number
      changes: number
      patch?: string
    }>
  > {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.pulls.listFiles({
      owner: repoOwner,
      repo: repoName,
      pull_number: pullNumber,
    })

    return data.map(file => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
    }))
  }

  /**
   * Search code in repositories
   */
  async searchCode(
    query: string,
    owner?: string,
    repo?: string
  ): Promise<
    Array<{
      name: string
      path: string
      repository: string
      url: string
    }>
  > {
    let searchQuery = query
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (repoOwner && repoName) {
      searchQuery = `${query} repo:${repoOwner}/${repoName}`
    }

    const { data } = await this.octokit.search.code({
      q: searchQuery,
    })

    return data.items.map(item => ({
      name: item.name,
      path: item.path,
      repository: item.repository.full_name,
      url: item.html_url,
    }))
  }

  /**
   * Search issues
   */
  async searchIssues(
    query: string,
    owner?: string,
    repo?: string
  ): Promise<
    Array<{
      number: number
      title: string
      state: string
      url: string
      repository: string
    }>
  > {
    let searchQuery = query
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (repoOwner && repoName) {
      searchQuery = `${query} repo:${repoOwner}/${repoName}`
    }

    const { data } = await this.octokit.search.issuesAndPullRequests({
      q: searchQuery,
    })

    return data.items.map(item => ({
      number: item.number,
      title: item.title,
      state: item.state,
      url: item.html_url,
      repository: (item as any).repository_url?.split('/').slice(-2).join('/') || '',
    }))
  }

  /**
   * Get workflow runs
   */
  async listWorkflowRuns(
    owner?: string,
    repo?: string
  ): Promise<
    Array<{
      id: number
      name: string
      status: string
      conclusion: string | null
      url: string
      createdAt: string
    }>
  > {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.actions.listWorkflowRunsForRepo({
      owner: repoOwner,
      repo: repoName,
    })

    return data.workflow_runs.map(run => ({
      id: run.id,
      name: run.name || 'Unknown',
      status: run.status || 'unknown',
      conclusion: run.conclusion,
      url: run.html_url,
      createdAt: run.created_at,
    }))
  }

  /**
   * Trigger workflow dispatch
   */
  async triggerWorkflow(
    workflowId: string | number,
    ref: string,
    inputs?: Record<string, any>,
    owner?: string,
    repo?: string
  ): Promise<void> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    await this.octokit.actions.createWorkflowDispatch({
      owner: repoOwner,
      repo: repoName,
      workflow_id: workflowId,
      ref,
      inputs,
    })
  }

  /**
   * Update issue
   */
  async updateIssue(
    issueNumber: number,
    updates: {
      title?: string
      body?: string
      state?: 'open' | 'closed'
      labels?: string[]
      assignees?: string[]
    },
    owner?: string,
    repo?: string
  ): Promise<GitHubIssue> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.issues.update({
      owner: repoOwner,
      repo: repoName,
      issue_number: issueNumber,
      ...updates,
    })

    return {
      number: data.number,
      title: data.title,
      body: data.body || '',
      state: data.state,
      labels: data.labels.map(l => (typeof l === 'string' ? l : l.name || '')),
      url: data.html_url,
      createdAt: data.created_at,
    }
  }

  /**
   * Get pull request details
   */
  async getPullRequest(
    pullNumber: number,
    owner?: string,
    repo?: string
  ): Promise<GitHubPullRequest & { mergeable: boolean | null; merged: boolean }> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.pulls.get({
      owner: repoOwner,
      repo: repoName,
      pull_number: pullNumber,
    })

    return {
      number: data.number,
      title: data.title,
      body: data.body || '',
      state: data.state,
      url: data.html_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      mergeable: data.mergeable,
      merged: data.merged,
    }
  }

  /**
   * Fork a repository
   */
  async forkRepository(
    owner?: string,
    repo?: string
  ): Promise<{ fullName: string; cloneUrl: string }> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.repos.createFork({
      owner: repoOwner,
      repo: repoName,
    })

    return {
      fullName: data.full_name,
      cloneUrl: data.clone_url,
    }
  }

  /**
   * List repository collaborators
   */
  async listCollaborators(
    owner?: string,
    repo?: string
  ): Promise<Array<{ login: string; role: string }>> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.repos.listCollaborators({
      owner: repoOwner,
      repo: repoName,
    })

    return data.map(collab => ({
      login: collab.login,
      role: (collab as any).role_name || 'unknown',
    }))
  }

  /**
   * Get commit diff
   */
  async getCommitDiff(
    commitSha: string,
    owner?: string,
    repo?: string
  ): Promise<{
    files: Array<{
      filename: string
      status: string
      additions: number
      deletions: number
      patch?: string
    }>
  }> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    const { data } = await this.octokit.repos.getCommit({
      owner: repoOwner,
      repo: repoName,
      ref: commitSha,
    })

    return {
      files:
        data.files?.map(file => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch,
        })) || [],
    }
  }

  /**
   * Create a new repository
   */
  async createRepository(
    name: string,
    options: {
      description?: string
      private?: boolean
      autoInit?: boolean
      gitignoreTemplate?: string
      licenseTemplate?: string
      homepage?: string
    } = {}
  ): Promise<{
    name: string
    fullName: string
    description: string
    url: string
    cloneUrl: string
    sshUrl: string
    defaultBranch: string
    private: boolean
  }> {
    const { data } = await this.octokit.repos.createForAuthenticatedUser({
      name,
      description: options.description,
      private: options.private || false,
      auto_init: options.autoInit || true,
      gitignore_template: options.gitignoreTemplate,
      license_template: options.licenseTemplate,
      homepage: options.homepage,
    })

    return {
      name: data.name,
      fullName: data.full_name,
      description: data.description || '',
      url: data.html_url,
      cloneUrl: data.clone_url,
      sshUrl: data.ssh_url,
      defaultBranch: data.default_branch,
      private: data.private,
    }
  }

  /**
   * Delete a repository
   */
  async deleteRepository(owner?: string, repo?: string): Promise<void> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    await this.octokit.repos.delete({
      owner: repoOwner,
      repo: repoName,
    })
  }

  /**
   * Push multiple files to a repository (batch commit)
   */
  async pushFiles(
    files: Array<{ path: string; content: string }>,
    message: string,
    branch?: string,
    owner?: string,
    repo?: string
  ): Promise<{ commitSha: string; filesCreated: number }> {
    const repoOwner = owner || this.owner
    const repoName = repo || this.repo

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name must be provided')
    }

    // Get the current branch reference
    const repoInfo = await this.getRepoInfo(repoOwner, repoName)
    const targetBranch = branch || repoInfo.defaultBranch

    const { data: refData } = await this.octokit.git.getRef({
      owner: repoOwner,
      repo: repoName,
      ref: `heads/${targetBranch}`,
    })

    const currentCommitSha = refData.object.sha

    // Get the current commit tree
    const { data: commitData } = await this.octokit.git.getCommit({
      owner: repoOwner,
      repo: repoName,
      commit_sha: currentCommitSha,
    })

    const baseTreeSha = commitData.tree.sha

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async file => {
        const { data: blob } = await this.octokit.git.createBlob({
          owner: repoOwner,
          repo: repoName,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64',
        })

        return {
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.sha,
        }
      })
    )

    // Create a new tree
    const { data: newTree } = await this.octokit.git.createTree({
      owner: repoOwner,
      repo: repoName,
      base_tree: baseTreeSha,
      tree: blobs,
    })

    // Create a new commit
    const { data: newCommit } = await this.octokit.git.createCommit({
      owner: repoOwner,
      repo: repoName,
      message,
      tree: newTree.sha,
      parents: [currentCommitSha],
    })

    // Update the branch reference
    await this.octokit.git.updateRef({
      owner: repoOwner,
      repo: repoName,
      ref: `heads/${targetBranch}`,
      sha: newCommit.sha,
    })

    return {
      commitSha: newCommit.sha,
      filesCreated: files.length,
    }
  }
}

/**
 * Create GitHub tool instance
 */
export function createGitHubTool(config: GitHubConfig): GitHubMcpTool {
  return new GitHubMcpTool(config)
}
