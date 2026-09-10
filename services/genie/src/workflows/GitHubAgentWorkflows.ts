/**
 * GitHub Agent Workflows
 * Pre-built workflows demonstrating GitHub MCP server capabilities
 */

import { GitHubMcpServer } from '../mcp-servers/github'

export interface WorkflowContext {
  server: GitHubMcpServer
  owner: string
  repo: string
}

/**
 * Workflow: Auto-fix bug from issue
 * 1. Read issue description
 * 2. Analyze codebase
 * 3. Create fix
 * 4. Create branch
 * 5. Commit changes
 * 6. Create PR
 */
export async function autoFixBugWorkflow(
  context: WorkflowContext,
  issueNumber: number
): Promise<{ success: boolean; prNumber?: number; error?: string }> {
  try {
    const { server, owner, repo } = context

    // Step 1: Get issue details
    console.log(`[Workflow] Fetching issue #${issueNumber}...`)
    const issues = await server.executeTool('list_issues', { owner, repo, state: 'open' })
    const issue = issues.find((i: any) => i.number === issueNumber)

    if (!issue) {
      throw new Error(`Issue #${issueNumber} not found`)
    }

    console.log(`[Workflow] Issue: ${issue.title}`)

    // Step 2: Create feature branch
    const branchName = `fix/issue-${issueNumber}-${Date.now()}`
    console.log(`[Workflow] Creating branch: ${branchName}`)
    await server.executeTool('create_branch', { branchName, owner, repo })

    // Step 3: Make changes (simplified - in real scenario, AI would analyze and fix)
    const fixMessage = `Fix: ${issue.title}\n\nResolves #${issueNumber}`
    console.log('[Workflow] Creating fix...')

    // Example: Add a fix comment to a file
    const fixContent = `// Auto-generated fix for issue #${issueNumber}\n// TODO: Implement actual fix based on issue description\n`

    await server.executeTool('create_or_update_file', {
      path: `fixes/issue-${issueNumber}.md`,
      content: `# Fix for Issue #${issueNumber}\n\n${issue.title}\n\n${issue.body}\n\n${fixContent}`,
      message: fixMessage,
      branch: branchName,
      owner,
      repo,
    })

    // Step 4: Create PR
    console.log('[Workflow] Creating pull request...')
    const pr = await server.executeTool('create_pull_request', {
      title: `Fix: ${issue.title}`,
      body: `This PR fixes #${issueNumber}\n\n## Changes\n- Auto-generated fix\n- Closes #${issueNumber}`,
      head: branchName,
      base: 'main',
      owner,
      repo,
    })

    console.log(`[Workflow] ✓ Created PR #${pr.number}`)

    return {
      success: true,
      prNumber: pr.number,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Workflow: Smart PR review
 * 1. Get PR details
 * 2. Analyze code changes
 * 3. Generate review comments
 * 4. Submit review
 */
export async function smartPRReviewWorkflow(
  context: WorkflowContext,
  prNumber: number
): Promise<{ success: boolean; reviewed: boolean; error?: string }> {
  try {
    const { server, owner, repo } = context

    console.log(`[Workflow] Reviewing PR #${prNumber}...`)

    // Step 1: Get PR files
    const files = await server.executeTool('get_pull_request_files', {
      pullNumber: prNumber,
      owner,
      repo,
    })

    console.log(`[Workflow] Analyzing ${files.length} changed files...`)

    // Step 2: Analyze changes (if AI enabled)
    try {
      const analysis = await server.executeTool('analyze_code_changes', {
        pullNumber: prNumber,
        owner,
        repo,
      })

      console.log(`[Workflow] Complexity: ${analysis.complexity}`)

      // Step 3: Submit review
      const reviewBody = `## Automated Review\n\n**Complexity:** ${analysis.complexity}\n\n**Summary:** ${analysis.summary}\n\n**Suggestions:**\n${analysis.suggestions.map((s: string) => `- ${s}`).join('\n')}\n\n**Potential Risks:**\n${analysis.risks.map((r: string) => `- ${r}`).join('\n')}`

      await server.executeTool('review_pull_request', {
        pullNumber: prNumber,
        event: 'COMMENT',
        body: reviewBody,
        owner,
        repo,
      })

      console.log('[Workflow] ✓ Review submitted')
    } catch (aiError) {
      // If AI features not enabled, do basic review
      console.log('[Workflow] AI features not available, skipping advanced analysis')
      
      const basicReview = `## Automated Review\n\n**Files Changed:** ${files.length}\n**Total Changes:** +${files.reduce((acc: number, f: any) => acc + f.additions, 0)} -${files.reduce((acc: number, f: any) => acc + f.deletions, 0)}\n\nBasic review completed.`

      await server.executeTool('review_pull_request', {
        pullNumber: prNumber,
        event: 'COMMENT',
        body: basicReview,
        owner,
        repo,
      })
    }

    return {
      success: true,
      reviewed: true,
    }
  } catch (error) {
    return {
      success: false,
      reviewed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Workflow: Auto-triage issues
 * 1. Get all open issues
 * 2. Analyze and suggest labels
 * 3. Update issues with labels
 */
export async function autoTriageIssuesWorkflow(
  context: WorkflowContext
): Promise<{ success: boolean; triaged: number; error?: string }> {
  try {
    const { server, owner, repo } = context

    console.log('[Workflow] Fetching open issues...')
    const issues = await server.executeTool('list_issues', { owner, repo, state: 'open' })

    console.log(`[Workflow] Found ${issues.length} open issues`)

    let triagedCount = 0

    for (const issue of issues.slice(0, 5)) {
      // Limit to 5 for demo
      try {
        console.log(`[Workflow] Triaging issue #${issue.number}...`)

        // Try to get AI suggestions
        try {
          const labels = await server.executeTool('suggest_issue_labels', {
            issueNumber: issue.number,
            owner,
            repo,
          })

          await server.executeTool('update_issue', {
            issueNumber: issue.number,
            labels,
            owner,
            repo,
          })

          console.log(`[Workflow] ✓ Added labels to #${issue.number}: ${labels.join(', ')}`)
        } catch {
          // If AI not available, add basic labels
          const basicLabels = issue.title.toLowerCase().includes('bug')
            ? ['bug']
            : issue.title.toLowerCase().includes('feature')
              ? ['enhancement']
              : ['needs-triage']

          await server.executeTool('update_issue', {
            issueNumber: issue.number,
            labels: basicLabels,
            owner,
            repo,
          })

          console.log(`[Workflow] ✓ Added basic labels to #${issue.number}`)
        }

        triagedCount++
      } catch (error) {
        console.log(
          `[Workflow] Failed to triage #${issue.number}: ${error instanceof Error ? error.message : 'Unknown'}`
        )
      }
    }

    return {
      success: true,
      triaged: triagedCount,
    }
  } catch (error) {
    return {
      success: false,
      triaged: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Workflow: Generate release notes
 * 1. Get commits since last release
 * 2. Categorize changes
 * 3. Create release notes
 * 4. Create issue with release notes
 */
export async function generateReleaseNotesWorkflow(
  context: WorkflowContext,
  sinceDate?: string
): Promise<{ success: boolean; issueNumber?: number; error?: string }> {
  try {
    const { server, owner, repo } = context

    console.log('[Workflow] Fetching recent commits...')
    const commits = await server.executeTool('list_commits', {
      owner,
      repo,
      since: sinceDate,
      perPage: 50,
    })

    console.log(`[Workflow] Found ${commits.length} commits`)

    // Categorize commits
    const features = commits.filter((c: any) =>
      c.message.toLowerCase().startsWith('feat')
    )
    const fixes = commits.filter((c: any) => c.message.toLowerCase().startsWith('fix'))
    const others = commits.filter(
      (c: any) =>
        !c.message.toLowerCase().startsWith('feat') &&
        !c.message.toLowerCase().startsWith('fix')
    )

    // Generate release notes
    const releaseNotes = `# Release Notes

## 🎉 Features (${features.length})
${features.map((c: any) => `- ${c.message} (${c.sha.substring(0, 7)})`).join('\n')}

## 🐛 Bug Fixes (${fixes.length})
${fixes.map((c: any) => `- ${c.message} (${c.sha.substring(0, 7)})`).join('\n')}

## 🔧 Other Changes (${others.length})
${others.slice(0, 10).map((c: any) => `- ${c.message} (${c.sha.substring(0, 7)})`).join('\n')}

---
Generated automatically by GitHub MCP Agent
`

    // Create issue with release notes
    console.log('[Workflow] Creating release notes issue...')
    const issue = await server.executeTool('create_issue', {
      title: `Release Notes - ${new Date().toISOString().split('T')[0]}`,
      body: releaseNotes,
      labels: ['release', 'documentation'],
      owner,
      repo,
    })

    console.log(`[Workflow] ✓ Created issue #${issue.number}`)

    return {
      success: true,
      issueNumber: issue.number,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Workflow: Monitor and report repo health
 * 1. Check open issues/PRs
 * 2. Check workflow status
 * 3. Generate health report
 */
export async function repoHealthCheckWorkflow(
  context: WorkflowContext
): Promise<{
  success: boolean
  health: {
    openIssues: number
    openPRs: number
    failedWorkflows: number
    score: number
  }
  error?: string
}> {
  try {
    const { server, owner, repo } = context

    console.log('[Workflow] Checking repository health...')

    // Get repo info
    const repoInfo = await server.executeTool('get_repository_info', { owner, repo })

    // Get open issues and PRs
    const issues = await server.executeTool('list_issues', { owner, repo, state: 'open' })
    const prs = await server.executeTool('list_pull_requests', {
      owner,
      repo,
      state: 'open',
    })

    // Get workflow runs
    const workflows = await server.executeTool('list_workflow_runs', { owner, repo })
    const failedWorkflows = workflows.filter(
      (w: any) => w.conclusion === 'failure'
    ).length

    // Calculate health score (0-100)
    let score = 100
    score -= Math.min(issues.length * 2, 30) // Max -30 for issues
    score -= Math.min(prs.length * 3, 30) // Max -30 for PRs
    score -= Math.min(failedWorkflows * 10, 40) // Max -40 for failed workflows

    const health = {
      openIssues: issues.length,
      openPRs: prs.length,
      failedWorkflows,
      score: Math.max(0, score),
    }

    console.log(`[Workflow] Repository: ${repoInfo.name}`)
    console.log(`[Workflow] Health Score: ${health.score}/100`)
    console.log(`[Workflow] - Open Issues: ${health.openIssues}`)
    console.log(`[Workflow] - Open PRs: ${health.openPRs}`)
    console.log(`[Workflow] - Failed Workflows: ${health.failedWorkflows}`)

    return {
      success: true,
      health,
    }
  } catch (error) {
    return {
      success: false,
      health: { openIssues: 0, openPRs: 0, failedWorkflows: 0, score: 0 },
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
