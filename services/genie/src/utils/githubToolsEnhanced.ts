/**
 * Enhanced GitHub Tools with Codebase Analysis
 * 
 * Extends bot GitHub tools with advanced codebase analysis capabilities
 * for better understanding of complex projects
 */

import { createTool } from '@iqai/adk';
import { z } from 'zod';
import { CodebaseAnalyzer } from './codebaseAnalyzer';
import { createBotGitHubTools, BOT_GITHUB_TOOLS_DESCRIPTION } from './githubToolsWithBot';
import { createGitHubFilePatcherTools } from './githubFilePatcherTools';
import { performSmartEdit, SmartEditParams } from './githubSmartEditTool';
import { performGitHubSearch, GitHubSearchParams, formatSearchResults } from './githubSearchTools';
import { 
  saveMemory, 
  loadMemory, 
  clearMemory, 
  formatMemoryForDisplay,
  SaveMemoryParams,
  LoadMemoryParams,
  MemoryData 
} from './githubMemoryTool';
import { getConfig } from './config';
import { Octokit } from '@octokit/rest';

/**
 * Create enhanced GitHub tools with codebase analysis
 */
export function createEnhancedGitHubTools() {
  const config = getConfig();
  
  if (!config.geniebotGithubToken) {
    throw new Error('GENIE_BOT_GITHUB_TOKEN (or legacy CODEFORGE_BOT_GITHUB_TOKEN) not configured. Bot operations are unavailable.');
  }

  const botToken = config.geniebotGithubToken;
  
  // Get base bot tools
  const botTools = createBotGitHubTools();
  
  // Create analyzer instance
  const analyzer = new CodebaseAnalyzer(botToken);

  // Get file patcher tools
  const patcherTools = createGitHubFilePatcherTools();

  // Create Octokit instance for smart edit
  const octokit = new Octokit({ auth: botToken });

  // Add enhanced analysis tools
  const enhancedTools = [
    // Smart Edit Tool - Uses 3 strategies + self-correction
    createTool({
      name: 'bot_github_smart_edit',
      description: `Smart search-and-replace with 3 fallback strategies + self-correction. Use for targeted code changes. Automatically handles whitespace differences and self-corrects if initial edit fails.`,
      schema: z.object({
        owner: z.string().describe('Repository owner username'),
        repo: z.string().describe('Repository name'),
        path: z.string().describe('Path to file to edit (e.g., src/index.ts, README.md)'),
        oldString: z.string().describe('Exact code block to find and replace (must include 3+ lines of context to be unique)'),
        newString: z.string().describe('New code to replace oldString with'),
        instruction: z.string().optional().describe('High-level goal (optional, helps with self-correction if edit fails)'),
        branch: z.string().optional().describe('Branch to edit (defaults to main/default branch)'),
      }),
      fn: async (args, context) => {
        try {
          // Validate required parameters
          if (!args.owner) throw new Error('REQUIRED: owner parameter missing (repository owner username)');
          if (!args.repo) throw new Error('REQUIRED: repo parameter missing (repository name)');
          if (!args.path) {
            throw new Error('REQUIRED: path parameter missing (path to file like src/index.ts or README.md)');
          }
          if (!args.oldString) throw new Error('REQUIRED: oldString parameter missing (exact code block to find)');
          if (!args.newString) throw new Error('REQUIRED: newString parameter missing (replacement code)');
          
          const params: SmartEditParams = {
            owner: args.owner,
            repo: args.repo,
            filePath: args.path, // Map path to filePath for the internal function
            oldString: args.oldString,
            newString: args.newString,
            instruction: args.instruction || 'Replace code block', // Default instruction if not provided
            branch: args.branch,
          };

          // Create LLM call function for self-correction
          const llmCall = async (systemPrompt: string, userPrompt: string): Promise<string> => {
            // Use the agent's context to make LLM call
            // This assumes context has a method to call the LLM
            if (context && typeof (context as any).generateText === 'function') {
              return await (context as any).generateText({
                systemInstruction: systemPrompt,
                prompt: userPrompt,
                temperature: 0.1,
              });
            }
            throw new Error('LLM context not available for self-correction');
          };

          const result = await performSmartEdit(octokit, params, llmCall);

          if (result.success) {
            return {
              success: true,
              newContent: result.newContent,
              occurrences: result.occurrences,
              strategy: result.strategy,
              message: `✅ Smart edit succeeded using ${result.strategy} strategy (${result.occurrences} replacement${result.occurrences! > 1 ? 's' : ''})`,
            };
          } else {
            return {
              success: false,
              error: result.error,
              message: `❌ Smart edit failed: ${result.error}`,
            };
          }
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            message: `❌ Smart edit error: ${error.message}`,
          };
        }
      },
    }),

    // Advanced Search Tool - Multi-strategy search
    createTool({
      name: 'bot_github_advanced_search',
      description: `🔍 ADVANCED CODE SEARCH: Multi-strategy search with automatic fallbacks

**SEARCH STRATEGIES (Automatic):**
1. **GitHub API** - Fast cloud-based search (tries first)
2. **Local Search** - Local filesystem search if repo is cached (fallback)
3. **JavaScript** - Pure JS fallback (always works)

**FEATURES:**
- ✅ Regex pattern support
- ✅ File pattern filtering (*.ts, *.{js,jsx})
- ✅ Path-based filtering
- ✅ Case-insensitive by default
- ✅ Line number results
- ✅ Grouped by file

**USE CASES:**
- Find function/class definitions
- Search for specific patterns
- Locate imports/dependencies
- Find TODO/FIXME comments
- Search error messages

**EXAMPLES:**
- Pattern: "function.*getUserProfile" (regex)
- Pattern: "TODO" (plain text)
- Include: "*.ts" (TypeScript files only)
- Path: "src/components" (search in specific directory)

**TIPS:**
- Use regex for flexible matching
- Add include pattern to limit scope
- Results show line numbers for quick navigation`,
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        pattern: z.string().describe('Search pattern (regex or plain text)'),
        path: z.string().optional().describe('Optional: search within specific path (e.g., "src/components")'),
        include: z.string().optional().describe('Optional: file pattern to include (e.g., "*.ts", "*.{js,jsx}")'),
        branch: z.string().optional().describe('Optional: branch to search (defaults to default branch)'),
        isRegex: z.boolean().optional().describe('Whether pattern is regex (default: true)'),
      }),
      fn: async (args) => {
        try {
          const searchParams: GitHubSearchParams = {
            owner: args.owner,
            repo: args.repo,
            pattern: args.pattern,
            path: args.path,
            include: args.include,
            branch: args.branch,
            isRegex: args.isRegex,
          };

          const result = await performGitHubSearch(octokit, searchParams);
          const formatted = formatSearchResults(result);

          return {
            success: result.success,
            strategy: result.strategy,
            totalMatches: result.totalMatches,
            matchesByFile: result.matchesByFile,
            formatted,
            message: formatted,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            message: `❌ Search failed: ${error.message}`,
          };
        }
      },
    }),

    // Memory Tools - Context persistence across sessions
    createTool({
      name: 'bot_github_save_memory',
      description: `💾 SAVE MEMORY: Store important context for future reference

**WHAT TO SAVE:**
- 📁 **Project Context**: Repo structure, architecture, key files
- 🔍 **Investigation Notes**: Findings, patterns, root causes
- ✅ **Decisions Made**: Approaches chosen, alternatives considered
- 💡 **Things to Remember**: User preferences, special requirements
- 🧩 **Codebase Insights**: Complex logic explained, gotchas discovered

**WHEN TO USE:**
- After analyzing a complex codebase
- When discovering important patterns
- After making architectural decisions
- When user shares preferences/requirements
- When finding non-obvious code behavior

**BENEFITS:**
- ✅ Context persists across sessions
- ✅ Avoid re-analyzing same code
- ✅ Remember user preferences
- ✅ Build knowledge over time

**EXAMPLE ENTRIES:**
- "Main entry point: src/index.ts exports App component"
- "Database uses Supabase with RLS policies enabled"
- "User prefers TypeScript strict mode and functional style"
- "Auth flow: JWT stored in httpOnly cookie, refreshed on /api/refresh"`,
      schema: z.object({
        repoOwner: z.string().describe('Repository owner'),
        repoName: z.string().describe('Repository name'),
        section: z.enum([
          'project_context',
          'investigation_notes',
          'decisions_made',
          'things_to_remember',
          'codebase_insights',
        ]).describe('Memory section to save to'),
        content: z.string().describe('What to remember (clear, concise statement)'),
        timestamp: z.boolean().optional().describe('Add timestamp to entry (default: true)'),
      }),
      fn: async (args) => {
        try {
          const params: SaveMemoryParams = {
            repoOwner: args.repoOwner,
            repoName: args.repoName,
            section: args.section,
            content: args.content,
            timestamp: args.timestamp,
          };
          
          const result = await saveMemory(params);
          return result;
        } catch (error: any) {
          return {
            success: false,
            message: `❌ Failed to save memory: ${error.message}`,
            error: error.message,
          };
        }
      },
    }),

    createTool({
      name: 'bot_github_load_memory',
      description: `📖 LOAD MEMORY: Retrieve saved context and insights

**USE CASES:**
- Resume work on a repository
- Recall previous findings
- Check past decisions
- Load user preferences
- Review codebase insights

**RETURNS:**
All saved memories organized by section, or specific section if requested.

**TIP:** Always load memory at the start of complex tasks to avoid redundant work!`,
      schema: z.object({
        repoOwner: z.string().describe('Repository owner'),
        repoName: z.string().describe('Repository name'),
        section: z.enum([
          'project_context',
          'investigation_notes',
          'decisions_made',
          'things_to_remember',
          'codebase_insights',
        ]).optional().describe('Optional: load specific section only'),
      }),
      fn: async (args) => {
        try {
          const params: LoadMemoryParams = {
            repoOwner: args.repoOwner,
            repoName: args.repoName,
            section: args.section,
          };
          
          const result = await loadMemory(params);
          
          if (result.success && result.memory) {
            // Format for display
            const formatted = typeof result.memory === 'object' && !Array.isArray(result.memory)
              ? formatMemoryForDisplay(result.memory as MemoryData)
              : result.memory.join('\n');
            
            return {
              ...result,
              formatted,
            };
          }
          
          return result;
        } catch (error: any) {
          return {
            success: false,
            message: `❌ Failed to load memory: ${error.message}`,
            error: error.message,
          };
        }
      },
    }),

    createTool({
      name: 'bot_github_clear_memory',
      description: `🗑️ CLEAR MEMORY: Delete all saved context for a repository

Use when:
- Repository has been restructured
- Starting fresh analysis
- Memory is outdated/incorrect

**WARNING:** This action cannot be undone!`,
      schema: z.object({
        repoOwner: z.string().describe('Repository owner'),
        repoName: z.string().describe('Repository name'),
      }),
      fn: async (args) => {
        try {
          return await clearMemory(args.repoOwner, args.repoName);
        } catch (error: any) {
          return {
            success: false,
            message: `❌ Failed to clear memory: ${error.message}`,
            error: error.message,
          };
        }
      },
    }),

    createTool({
      name: 'bot_github_analyze_codebase',
      description: `🧠 CRITICAL TOOL: Analyze entire codebase structure, architecture, and complexity.
      
USE THIS FIRST when working with unknown/complex repositories!

Returns comprehensive analysis:
- Project complexity level (simple/moderate/complex/very-complex)
- Languages and frameworks used
- Project structure and organization
- Entry points and key files
- Build tools and test frameworks
- Recommendations for approaching the codebase

This tool provides the "big picture" understanding needed before making changes.

NOTE: Automatically detects the default branch (main/master) if not specified.`,
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        branch: z.string().optional().describe('Branch to analyze (auto-detects default if not provided)'),
      }),
      fn: async (args) => {
        try {
          const analysis = await analyzer.analyzeCodebase(args.owner, args.repo, args.branch);
          const report = analyzer.generateAnalysisReport(analysis);
          
          return {
            success: true,
            analysis: {
              complexity: analysis.complexity,
              fileCount: analysis.fileCount,
              estimatedLines: analysis.estimatedLines,
              languages: Object.fromEntries(analysis.languages),
              frameworks: analysis.frameworks,
              buildTools: analysis.buildTools,
              testFrameworks: analysis.testFrameworks,
              entryPoints: analysis.entryPoints,
              keyFiles: analysis.keyFiles.slice(0, 20), // Top 20 key files
            },
            report,
            message: `✅ Analyzed ${args.owner}/${args.repo} - Complexity: ${analysis.complexity.toUpperCase()}`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            message: `❌ Failed to analyze codebase: ${error.message}`,
          };
        }
      },
    }),

    createTool({
      name: 'bot_github_find_related_files',
      description: `🔍 Find files related to specific keywords or issue context.

Smart search that:
- Searches code for keywords
- Extracts file paths mentioned in issue descriptions
- Ranks results by relevance
- Returns actionable list of files to review

Use when you need to find code related to a bug/feature before modifying.`,
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        keywords: z.array(z.string()).describe('Keywords to search for (function names, error messages, feature names)'),
        issueContext: z.string().optional().describe('Full issue description for better context'),
      }),
      fn: async (args) => {
        try {
          const relatedFiles = await analyzer.findRelatedFiles(
            args.owner,
            args.repo,
            args.keywords,
            args.issueContext
          );
          
          return {
            success: true,
            files: relatedFiles,
            count: relatedFiles.length,
            message: `✅ Found ${relatedFiles.length} files related to: ${args.keywords.join(', ')}`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            message: `❌ Failed to find related files: ${error.message}`,
          };
        }
      },
    }),

    createTool({
      name: 'bot_github_analyze_files_deep',
      description: `📊 Deep analysis of specific files including imports, exports, functions, classes, and complexity.

Returns detailed information about each file:
- File content
- Detected imports/exports
- Function and class definitions
- Code complexity metrics
- Relationships between files (dependency graph)

Use to understand specific files before modifying them.`,
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        filePaths: z.array(z.string()).describe('Array of file paths to analyze'),
        branch: z.string().optional().describe('Branch name'),
      }),
      fn: async (args) => {
        try {
          const analysis = await analyzer.analyzeFiles(
            args.owner,
            args.repo,
            args.filePaths,
            args.branch
          );
          
          return {
            success: true,
            filesAnalyzed: analysis.files.length,
            files: analysis.files.map(f => ({
              path: f.path,
              language: f.language,
              lines: f.lines,
              complexity: f.complexity,
              functions: f.functions,
              classes: f.classes,
              imports: f.imports,
              exports: f.exports,
              // Include content only for small files to avoid token limits
              content: f.lines < 200 ? f.content : `[File too large - ${f.lines} lines. Use bot_github_get_file_content to read specific sections]`,
            })),
            relationships: analysis.relationships,
            message: `✅ Analyzed ${analysis.files.length} files in detail`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            message: `❌ Failed to analyze files: ${error.message}`,
          };
        }
      },
    }),

    createTool({
      name: 'bot_github_analyze_dependencies',
      description: `📦 Analyze project dependencies and package managers.

Returns:
- Detected package managers (npm, pip, bundler, etc.)
- Production dependencies
- Development dependencies
- Peer dependencies

Use to understand project dependencies before adding/modifying packages.`,
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        branch: z.string().optional().describe('Branch name'),
      }),
      fn: async (args) => {
        try {
          const deps = await analyzer.analyzeDependencies(
            args.owner,
            args.repo,
            args.branch
          );
          
          return {
            success: true,
            packageManagers: deps.packageManagers,
            dependencies: deps.dependencies,
            devDependencies: deps.devDependencies,
            peerDependencies: deps.peerDependencies,
            totalDependencies: Object.keys(deps.dependencies).length,
            message: `✅ Found ${deps.packageManagers.join(', ')} with ${Object.keys(deps.dependencies).length} dependencies`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            message: `❌ Failed to analyze dependencies: ${error.message}`,
          };
        }
      },
    }),

    createTool({
      name: 'bot_github_get_issue_context',
      description: `🎯 Get full context for a specific issue including description, comments, and labels.

Returns comprehensive issue information:
- Issue title and body
- Labels and assignees
- All comments and discussions
- Related PRs (if mentioned)
- Current state

Use to fully understand an issue before starting work.`,
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        issueNumber: z.number().describe('Issue number'),
      }),
      fn: async (args) => {
        try {
          const { Octokit } = await import('@octokit/rest');
          const client = new Octokit({ auth: botToken });
          
          // Get issue details
          const { data: issue } = await client.issues.get({
            owner: args.owner,
            repo: args.repo,
            issue_number: args.issueNumber,
          });
          
          // Get comments
          const { data: comments } = await client.issues.listComments({
            owner: args.owner,
            repo: args.repo,
            issue_number: args.issueNumber,
          });
          
          return {
            success: true,
            issue: {
              number: issue.number,
              title: issue.title,
              body: issue.body,
              state: issue.state,
              labels: issue.labels.map((l: any) => l.name),
              assignees: issue.assignees?.map((a: any) => a.login) || [],
              createdAt: issue.created_at,
              updatedAt: issue.updated_at,
              author: issue.user?.login || 'unknown',
            },
            comments: comments.map((c: any) => ({
              author: c.user.login,
              body: c.body,
              createdAt: c.created_at,
            })),
            commentCount: comments.length,
            message: `✅ Retrieved issue #${args.issueNumber}: ${issue.title}`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            message: `❌ Failed to get issue context: ${error.message}`,
          };
        }
      },
    }),

    createTool({
      name: 'bot_github_smart_file_search',
      description: `🔎 Smart multi-pattern code search with ranking.

Searches for multiple patterns simultaneously and ranks results by relevance.
Better than individual searches when you have multiple keywords.

Use when exploring unfamiliar codebase or tracking down bugs.`,
      schema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        patterns: z.array(z.string()).describe('Search patterns (can use GitHub search syntax)'),
        maxResults: z.number().optional().default(30).describe('Max total results'),
      }),
      fn: async (args) => {
        try {
          const { Octokit } = await import('@octokit/rest');
          const client = new Octokit({ auth: botToken });
          
          const allResults: any[] = [];
          const seen = new Set<string>();
          
          for (const pattern of args.patterns) {
            try {
              const { data } = await client.search.code({
                q: `${pattern} repo:${args.owner}/${args.repo}`,
                per_page: Math.min(10, args.maxResults),
              });
              
              for (const item of data.items) {
                if (!seen.has(item.path) && allResults.length < args.maxResults) {
                  seen.add(item.path);
                  allResults.push({
                    path: item.path,
                    matchedPattern: pattern,
                    url: item.html_url,
                  });
                }
              }
            } catch (error) {
              // Continue with other patterns if one fails
              console.error(`Search failed for pattern: ${pattern}`);
            }
          }
          
          return {
            success: true,
            results: allResults,
            totalFound: allResults.length,
            patterns: args.patterns,
            message: `✅ Found ${allResults.length} files matching ${args.patterns.length} patterns`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            message: `❌ Failed to search files: ${error.message}`,
          };
        }
      },
    }),
  ];

  return {
    tools: [...botTools.tools, ...enhancedTools, ...patcherTools],
    botUsername: botTools.botUsername,
    botToken: botTools.botToken,
    analyzer, // Expose analyzer instance
  };
}

/**
 * Enhanced bot GitHub tools description
 */
export const ENHANCED_GITHUB_TOOLS_DESCRIPTION = `
${BOT_GITHUB_TOOLS_DESCRIPTION}

## 🧠 Advanced Codebase Analysis Tools (NEW!)

**Essential for Complex Issues:**

**1. bot_github_analyze_codebase** ⭐ USE THIS FIRST!
- Comprehensive project analysis
- Detects: languages, frameworks, build tools, test frameworks
- Provides complexity assessment
- Recommends approach based on project size
- Identifies entry points and key files
- **When to use**: First time working with a repo, or before major changes

**2. bot_github_find_related_files** ⭐ USE FOR ISSUE INVESTIGATION
- Smart keyword-based file search
- Extracts context from issue descriptions
- Returns ranked list of relevant files
- **When to use**: Finding code related to bug/feature

**3. bot_github_analyze_files_deep**
- Deep analysis of specific files
- Extracts: imports, exports, functions, classes
- Calculates complexity metrics
- Maps file relationships
- **When to use**: Understanding files before modification

**4. bot_github_analyze_dependencies**
- Detects package managers
- Lists all dependencies
- **When to use**: Before adding/updating packages

**5. bot_github_get_issue_context**
- Gets complete issue information
- Includes all comments and discussion
- **When to use**: Understanding requirements for an issue

**6. bot_github_smart_file_search**
- Multi-pattern code search
- Ranks results by relevance
- **When to use**: Exploring unfamiliar codebase

## 🎯 File Patching Tools (RECOMMENDED FOR CODE CHANGES!)

**Instead of rewriting entire files, use surgical patches:**

**1. github_patch_file_lines** ⭐ BEST FOR TARGETED FIXES
- Modify specific line range in a file
- **When to use**: Fixing a function, replacing specific code block
- Example: Replace lines 45-60 in auth.js with fixed code
- **Benefits**: No truncation, clear changes, reviewable PRs

**2. github_patch_file_search_replace** ⭐ BEST FOR EXACT REPLACEMENTS  
- Find and replace exact code
- **When to use**: Replacing a function, updating specific values
- Example: Find "function oldAuth() {..." replace with "function newAuth() {..."
- **Benefits**: No line numbers needed, works even if file changes

**3. github_patch_multiple_files**
- Apply patches to multiple files at once
- **When to use**: Multi-file related changes
- Supports both line-range and search-replace

**4. github_validate_patch**
- Test a patch before applying
- **When to use**: Verify patch will work before using
- Returns preview and validation errors

**💡 WHY USE PATCHES?**

❌ **OLD WAY (Don't do this):**
\`\`\`
// Read entire file
// Rewrite entire file with changes
// Risk: File gets truncated with "# rest of file..."
// Result: Broken PR, lost code
\`\`\`

✅ **NEW WAY (Do this):**
\`\`\`
// Read file
// Create patch for exact lines/code to change
// Apply patch (rest of file preserved)
// Result: Clean PR, clear changes, no truncation
\`\`\`

**📋 RECOMMENDED WORKFLOW FOR CODE CHANGES:**

**SCENARIO A: NEW REPOSITORY (Direct Push to Bot Account)**
\`\`\`
Step 1: Create repository in bot account
→ Use bot_github_create_repo_in_bot_account(name, description)

Step 2: Generate code files
→ Create all necessary files (HTML, CSS, JS, etc.)

Step 3: Push directly to main
→ Use bot_github_push_to_fork(repo, files, message?, branch='main')
   - message is OPTIONAL (auto-generated if not provided)
→ DONE - No forking/branching/PR needed!

Result: ✅ Repository live at https://github.com/genie-ai-bot/{repo-name}
Note: It's a new repo in bot account, no existing code to protect
User can fork the bot's repo to their account if they want
\`\`\`

**SCENARIO B: EXISTING REPOSITORY (Fork + PR Workflow)**
\`\`\`
Step 1: Read file (bot_github_get_file_content)
Step 2: Identify exact change needed
Step 3: Choose editing strategy:
   
   OPTION A - Smart Edit (RECOMMENDED for surgical changes):
   → Use bot_github_smart_edit(path, oldString, newString, instruction)
   → Handles whitespace differences automatically
   → Self-corrects if search fails
   → Best for targeted function/line changes
   
   OPTION B - Line-based Patch (for known line numbers):
   → Use github_patch_file_lines(path, 45, 60, newCode, original)
   → Good when you know exact line range
   
   OPTION C - Search-Replace Patch (for exact code):
   → Use github_patch_file_search_replace(path, oldCode, newCode, original)
   → Precise but requires exact match
  
Step 4: Push patched content (bot_github_push_to_fork)
   - Parameters: repo, files, message (optional), branch
   - Message will be auto-generated if not provided
Step 5: Create PR (bot_github_create_pull_request_from_fork)
\`\`\`

**📋 RECOMMENDED WORKFLOW FOR COMPLEX ISSUES:**

\`\`\`
Step 0: Load Context (if resuming work)
→ Use bot_github_load_memory
   - Retrieves previous findings
   - Recalls decisions made
   - Loads user preferences
   - Avoids redundant analysis

Step 1: Understand the Repository
→ Use bot_github_analyze_codebase
→ SAVE findings: bot_github_save_memory(section='project_context')

Step 2: Get Issue Details
→ Use bot_github_get_issue_context (if working on specific issue)

Step 3: Find Relevant Code
→ OPTION A: Use bot_github_advanced_search (RECOMMENDED)
   - Supports regex patterns
   - Multiple fallback strategies
   - Returns line numbers
   - Grouped results by file
→ OPTION B: Use bot_github_find_related_files (keyword search)
→ OPTION C: Use bot_github_smart_file_search (multi-pattern)
→ SAVE findings: bot_github_save_memory(section='investigation_notes')

Step 4: Analyze Key Files
→ Use bot_github_analyze_files_deep on identified files
→ SAVE insights: bot_github_save_memory(section='codebase_insights')

Step 5: Check Dependencies (if needed)
→ Use bot_github_analyze_dependencies

Step 6: Plan & Decide
→ Determine approach
→ SAVE decision: bot_github_save_memory(section='decisions_made')

Step 7: Read Specific Code
→ Use bot_github_get_file_content for detailed reading

Step 8: Implement Solution
→ Use fork → branch → push → PR workflow
   → Prefer bot_github_smart_edit for surgical changes
\`\`\`

**💡 PRO TIPS:**

- **Always load memory first** - Check what you already know before starting
- **Save important findings** - Don't lose valuable insights between sessions
- **Use memory for preferences** - Remember user's coding style, requirements
- **Always start with analysis** - Don't jump to coding
- **Use caching** - Analysis results are cached to save API calls
- **Be selective** - Analyze only what you need (avoid token limits)
- **Follow the workflow** - Systematic approach = better results
- **Build knowledge over time** - Memory accumulates insights across tasks
`;

export default createEnhancedGitHubTools;
