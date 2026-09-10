/**
 * GitHub MCP Demo Script
 * Demonstrates GitHub MCP Server capabilities
 */

import { createGitHubMcpServer } from './mcp-servers/github'
import {
  repoHealthCheckWorkflow,
  // Uncomment these when needed:
  // autoFixBugWorkflow,
  // smartPRReviewWorkflow,
  // autoTriageIssuesWorkflow,
  // generateReleaseNotesWorkflow,
} from './workflows/GitHubAgentWorkflows'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  // Check for GitHub token
  const githubToken = process.env.GITHUB_TOKEN
  if (!githubToken) {
    console.error('❌ GITHUB_TOKEN not found in environment variables')
    console.log('Please set GITHUB_TOKEN in your .env file')
    process.exit(1)
  }

  // Get repository from command line args or use default
  const owner = process.argv[2] || 'zaikaman'
  const repo = process.argv[3] || 'genie'

  console.log('🚀 GitHub MCP Server Demo')
  console.log('=' .repeat(50))
  console.log(`Repository: ${owner}/${repo}`)
  console.log('=' .repeat(50))
  console.log()

  // Create GitHub MCP Server
  const server = createGitHubMcpServer({
    token: githubToken,
    owner,
    repo,
    enableAIFeatures: false, // Set to true when AI integration is ready
  })

  try {
    // Demo 1: Repository Health Check
    console.log('📊 Demo 1: Repository Health Check')
    console.log('-'.repeat(50))
    const healthResult = await repoHealthCheckWorkflow({ server, owner, repo })
    if (healthResult.success) {
      console.log(`✓ Health Score: ${healthResult.health.score}/100`)
      console.log(`  - Open Issues: ${healthResult.health.openIssues}`)
      console.log(`  - Open PRs: ${healthResult.health.openPRs}`)
      console.log(`  - Failed Workflows: ${healthResult.health.failedWorkflows}`)
    } else {
      console.log(`✗ Error: ${healthResult.error}`)
    }
    console.log()

    // Demo 2: List available resources
    console.log('🔍 Demo 2: Available Resources')
    console.log('-'.repeat(50))
    const resources = server.getResources()
    Object.entries(resources).forEach(([name, info]: [string, any]) => {
      console.log(`${name}: ${info.description}`)
      console.log(`  Methods: ${info.methods.join(', ')}`)
    })
    console.log()

    // Demo 3: List available tools
    console.log('🛠️  Demo 3: Available Tools')
    console.log('-'.repeat(50))
    const tools = server.getTools()
    console.log(`Total tools: ${tools.length}`)
    tools.slice(0, 10).forEach((tool: any) => {
      console.log(`- ${tool.name}: ${tool.description}`)
    })
    console.log(`... and ${tools.length - 10} more tools`)
    console.log()

    // Demo 4: Get Repository Info
    console.log('📁 Demo 4: Repository Information')
    console.log('-'.repeat(50))
    const repoInfo = await server.executeTool('get_repository_info', { owner, repo })
    console.log(`Name: ${repoInfo.name}`)
    console.log(`Description: ${repoInfo.description}`)
    console.log(`Language: ${repoInfo.language}`)
    console.log(`Stars: ⭐ ${repoInfo.stars}`)
    console.log(`Forks: 🍴 ${repoInfo.forks}`)
    console.log(`Open Issues: 📋 ${repoInfo.openIssues}`)
    console.log(`Default Branch: 🌿 ${repoInfo.defaultBranch}`)
    console.log()

    // Demo 5: List Recent Commits
    console.log('📝 Demo 5: Recent Commits')
    console.log('-'.repeat(50))
    const commits = await server.executeTool('list_commits', {
      owner,
      repo,
      perPage: 5,
    })
    commits.forEach((commit: any, index: number) => {
      console.log(`${index + 1}. ${commit.message.split('\n')[0]}`)
      console.log(`   ${commit.sha.substring(0, 7)} by ${commit.author} on ${new Date(commit.date).toLocaleDateString()}`)
    })
    console.log()

    // Demo 6: List Branches
    console.log('🌿 Demo 6: Branches')
    console.log('-'.repeat(50))
    const branches = await server.executeTool('list_branches', { owner, repo })
    console.log(`Total branches: ${branches.length}`)
    branches.slice(0, 5).forEach((branch: any) => {
      console.log(
        `- ${branch.name} ${branch.protected ? '🔒' : ''} (${branch.sha.substring(0, 7)})`
      )
    })
    if (branches.length > 5) {
      console.log(`... and ${branches.length - 5} more branches`)
    }
    console.log()

    // Demo 7: List Open Issues
    console.log('📋 Demo 7: Open Issues')
    console.log('-'.repeat(50))
    const issues = await server.executeTool('list_issues', {
      owner,
      repo,
      state: 'open',
    })
    console.log(`Total open issues: ${issues.length}`)
    issues.slice(0, 3).forEach((issue: any) => {
      console.log(`#${issue.number}: ${issue.title}`)
      console.log(`   Labels: ${issue.labels.join(', ') || 'none'}`)
    })
    console.log()

    // Demo 8: List Open Pull Requests
    console.log('🔀 Demo 8: Open Pull Requests')
    console.log('-'.repeat(50))
    const prs = await server.executeTool('list_pull_requests', {
      owner,
      repo,
      state: 'open',
    })
    console.log(`Total open PRs: ${prs.length}`)
    prs.slice(0, 3).forEach((pr: any) => {
      console.log(`#${pr.number}: ${pr.title}`)
      console.log(`   Created: ${new Date(pr.createdAt).toLocaleDateString()}`)
    })
    console.log()

    // Demo 9: Auto-triage Issues (if there are open issues)
    if (issues.length > 0) {
      console.log('🏷️  Demo 9: Auto-triage Issues')
      console.log('-'.repeat(50))
      console.log('⚠️  This will add labels to issues. Skipping in demo mode.')
      console.log('Uncomment the code below to enable.')
      // const triageResult = await autoTriageIssuesWorkflow({ server, owner, repo })
      // if (triageResult.success) {
      //   console.log(`✓ Triaged ${triageResult.triaged} issues`)
      // }
      console.log()
    }

    // Demo 10: Generate Release Notes
    console.log('📋 Demo 10: Generate Release Notes')
    console.log('-'.repeat(50))
    console.log('⚠️  This will create an issue. Skipping in demo mode.')
    console.log('Uncomment the code below to enable.')
    // const releaseResult = await generateReleaseNotesWorkflow(
    //   { server, owner, repo },
    //   new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    // )
    // if (releaseResult.success) {
    //   console.log(`✓ Created release notes issue #${releaseResult.issueNumber}`)
    // }
    console.log()

    console.log('✅ Demo completed successfully!')
    console.log()
    console.log('💡 Advanced Features (requires enableAIFeatures: true):')
    console.log('   - generate_pr_description: AI-generated PR descriptions')
    console.log('   - analyze_code_changes: AI code analysis')
    console.log('   - suggest_issue_labels: AI label suggestions')
    console.log('   - auto_review_pr: Automated code review')
    console.log()
    console.log('📖 Run workflows with:')
    console.log('   - autoFixBugWorkflow(context, issueNumber)')
    console.log('   - smartPRReviewWorkflow(context, prNumber)')
    console.log('   - autoTriageIssuesWorkflow(context)')
    console.log('   - generateReleaseNotesWorkflow(context)')
    console.log('   - repoHealthCheckWorkflow(context)')
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

// Run demo
if (require.main === module) {
  main()
}
