/**
 * Advanced GitHub Search Tools
 * Ported from gemini-cli with 3 search strategies
 * 
 * Strategies:
 * 1. GitHub Code Search API (cloud-based, fastest for repos on GitHub)
 * 2. Local file search (if repo is cached locally)
 * 3. Pure JavaScript fallback (via API)
 */

import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Parameters for GitHub search
 */
export interface GitHubSearchParams {
  owner: string;
  repo: string;
  pattern: string; // Regex pattern or plain text
  path?: string; // Optional: search within specific path
  include?: string; // Optional: file pattern (e.g., "*.ts", "*.{js,jsx}")
  branch?: string; // Optional: specific branch
  isRegex?: boolean; // Whether pattern is regex (default: true)
}

/**
 * Search result for a single match
 */
export interface SearchMatch {
  filePath: string;
  lineNumber: number;
  line: string;
  snippet?: string; // Optional: surrounding context
}

/**
 * Grouped search results
 */
export interface SearchResult {
  success: boolean;
  strategy: 'github-api' | 'git-grep' | 'javascript' | 'none';
  totalMatches: number;
  matchesByFile: Record<string, SearchMatch[]>;
  error?: string;
}

/**
 * Strategy 1: GitHub Code Search API
 * - Fast for repos on GitHub
 * - Limited by API rate limits (10 req/min for code search)
 * - Returns rich results with snippets
 */
async function searchWithGitHubAPI(
  octokit: Octokit,
  params: GitHubSearchParams
): Promise<SearchResult | null> {
  try {
    // Build search query
    let query = `${params.pattern} repo:${params.owner}/${params.repo}`;
    
    if (params.path) {
      query += ` path:${params.path}`;
    }
    
    if (params.include) {
      // Convert glob pattern to GitHub search format
      const extension = params.include.replace('*.', '').replace('{', '').replace('}', '');
      query += ` extension:${extension}`;
    }

    console.log('🔍 GitHub API search query:', query);

    const { data } = await octokit.search.code({
      q: query,
      per_page: 100, // Max allowed
    });

    if (data.total_count === 0) {
      return {
        success: true,
        strategy: 'github-api',
        totalMatches: 0,
        matchesByFile: {},
      };
    }

    // Parse results
    const matchesByFile: Record<string, SearchMatch[]> = {};
    let totalMatches = 0;

    for (const item of data.items) {
      const filePath = item.path;
      
      // GitHub search doesn't provide line numbers directly
      // We'll need to fetch file content to get exact line numbers
      try {
        const { data: fileData } = await octokit.repos.getContent({
          owner: params.owner,
          repo: params.repo,
          path: item.path,
          ref: params.branch,
        });

        if (Array.isArray(fileData) || fileData.type !== 'file') {
          continue;
        }

        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        const lines = content.split('\n');
        
        const regex = params.isRegex !== false 
          ? new RegExp(params.pattern, 'i')
          : new RegExp(params.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        const matches: SearchMatch[] = [];
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            matches.push({
              filePath,
              lineNumber: index + 1,
              line: line.trim(),
            });
            totalMatches++;
          }
        });

        if (matches.length > 0) {
          matchesByFile[filePath] = matches;
        }
      } catch (err) {
        console.warn(`Failed to fetch content for ${item.path}:`, err);
      }
    }

    console.log('✓ GitHub API search: found', totalMatches, 'matches');

    return {
      success: true,
      strategy: 'github-api',
      totalMatches,
      matchesByFile,
    };
  } catch (error: any) {
    console.log('GitHub API search failed:', error.message);
    return null; // Fallback to next strategy
  }
}

/**
 * Strategy 2: Local file search (if repo is cached locally)
 * - Very fast for local repos
 * - No external commands required (pure Node.js)
 * - Works with cached repositories
 */
async function searchWithLocalFiles(
  repoPath: string,
  params: GitHubSearchParams
): Promise<SearchResult | null> {
  try {
    console.log('🔍 Local file search in:', repoPath);

    const matchesByFile: Record<string, SearchMatch[]> = {};
    let totalMatches = 0;
    const regex = new RegExp(params.pattern, 'i'); // Case-insensitive regex

    // Recursively search through files
    const searchDir = async (dirPath: string, relativePath: string = '') => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          // Skip hidden files and git directory
          if (entry.name.startsWith('.')) continue;

          const fullPath = path.join(dirPath, entry.name);
          const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            await searchDir(fullPath, relPath);
          } else {
            // Check file pattern if specified
            if (params.include && !relPath.match(new RegExp(params.include))) {
              continue;
            }

            // Check path filter if specified
            if (params.path && !relPath.startsWith(params.path)) {
              continue;
            }

            try {
              // Read file content
              const content = await fs.readFile(fullPath, 'utf-8');
              const lines = content.split('\n');

              // Search for pattern in each line
              for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                if (regex.test(line)) {
                  if (!matchesByFile[relPath]) {
                    matchesByFile[relPath] = [];
                  }

                  matchesByFile[relPath].push({
                    filePath: relPath,
                    lineNumber: lineNum + 1, // 1-indexed
                    line: line.trim(),
                  });
                  totalMatches++;
                }
              }
            } catch (error: any) {
              // Skip binary files or read errors
              if (!error.message.includes('ENOENT')) {
                console.warn(`Could not read ${relPath}: ${error.message}`);
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Error scanning directory:`, error);
      }
    };

    await searchDir(repoPath);

    console.log(`✓ Local search: found ${totalMatches} matches`);

    return {
      success: true,
      strategy: 'git-grep',
      totalMatches,
      matchesByFile,
    };
  } catch (error: any) {
    console.log('Local file search failed:', error.message);
    return null; // Fallback to next strategy
  }
}

/**
 * Strategy 3: JavaScript fallback (fetch files via API and search)
 * - Slowest but most reliable
 * - Works for any GitHub repo
 * - No external dependencies
 */
async function searchWithJavaScript(
  octokit: Octokit,
  params: GitHubSearchParams
): Promise<SearchResult> {
  try {
    console.log('🔍 JavaScript fallback search...');

    // Get repository tree
    const { data: repoData } = await octokit.repos.get({
      owner: params.owner,
      repo: params.repo,
    });

    const defaultBranch = params.branch || repoData.default_branch;

    const { data: tree } = await octokit.git.getTree({
      owner: params.owner,
      repo: params.repo,
      tree_sha: defaultBranch,
      recursive: 'true',
    });

    // Filter files
    let files = tree.tree.filter(item => item.type === 'blob');

    // Apply path filter
    if (params.path) {
      files = files.filter(item => item.path?.startsWith(params.path!));
    }

    // Apply include pattern filter
    if (params.include) {
      const pattern = params.include
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\{/g, '(')
        .replace(/\}/g, ')')
        .replace(/,/g, '|');
      const regex = new RegExp(pattern + '$');
      files = files.filter(item => item.path && regex.test(item.path));
    }

    console.log(`Searching in ${files.length} files...`);

    const matchesByFile: Record<string, SearchMatch[]> = {};
    let totalMatches = 0;
    let filesProcessed = 0;

    // Limit to avoid API rate limits
    const maxFiles = Math.min(files.length, 50);

    for (const file of files.slice(0, maxFiles)) {
      if (!file.path) continue;

      try {
        const { data: fileData } = await octokit.repos.getContent({
          owner: params.owner,
          repo: params.repo,
          path: file.path,
          ref: defaultBranch,
        });

        if (Array.isArray(fileData) || fileData.type !== 'file') {
          continue;
        }

        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        const lines = content.split('\n');

        const regex = params.isRegex !== false
          ? new RegExp(params.pattern, 'i')
          : new RegExp(params.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        const matches: SearchMatch[] = [];
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            matches.push({
              filePath: file.path!,
              lineNumber: index + 1,
              line: line.trim(),
            });
            totalMatches++;
          }
        });

        if (matches.length > 0) {
          matchesByFile[file.path] = matches;
        }

        filesProcessed++;
        
        // Add small delay to avoid rate limits
        if (filesProcessed % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (err) {
        console.warn(`Failed to search in ${file.path}:`, err);
      }
    }

    console.log('✓ JavaScript search: found', totalMatches, 'matches in', filesProcessed, 'files');

    return {
      success: true,
      strategy: 'javascript',
      totalMatches,
      matchesByFile,
    };
  } catch (error: any) {
    console.error('JavaScript search failed:', error.message);
    return {
      success: false,
      strategy: 'none',
      totalMatches: 0,
      matchesByFile: {},
      error: error.message,
    };
  }
}

/**
 * Main search function with cascading strategies
 */
export async function performGitHubSearch(
  octokit: Octokit,
  params: GitHubSearchParams,
  localRepoPath?: string
): Promise<SearchResult> {
  console.log('🔎 Starting GitHub search with pattern:', params.pattern);

  // Strategy 1: GitHub Code Search API
  const apiResult = await searchWithGitHubAPI(octokit, params);
  if (apiResult && apiResult.totalMatches > 0) {
    return apiResult;
  }

  // Strategy 2: Local file search (if repo is cached locally)
  if (localRepoPath) {
    const localResult = await searchWithLocalFiles(localRepoPath, params);
    if (localResult && localResult.totalMatches > 0) {
      return localResult;
    }
  }

  // Strategy 3: JavaScript fallback
  return await searchWithJavaScript(octokit, params);
}

/**
 * Format search results for display
 */
export function formatSearchResults(result: SearchResult): string {
  if (!result.success) {
    return `❌ Search failed: ${result.error || 'Unknown error'}`;
  }

  if (result.totalMatches === 0) {
    return '📭 No matches found';
  }

  const fileCount = Object.keys(result.matchesByFile).length;
  const matchTerm = result.totalMatches === 1 ? 'match' : 'matches';
  const fileTerm = fileCount === 1 ? 'file' : 'files';

  let output = `✅ Found ${result.totalMatches} ${matchTerm} in ${fileCount} ${fileTerm} (strategy: ${result.strategy})\n\n`;

  for (const [filePath, matches] of Object.entries(result.matchesByFile)) {
    output += `📄 ${filePath}\n`;
    
    // Limit matches per file to avoid overwhelming output
    const displayMatches = matches.slice(0, 10);
    for (const match of displayMatches) {
      output += `   L${match.lineNumber}: ${match.line}\n`;
    }
    
    if (matches.length > 10) {
      output += `   ... and ${matches.length - 10} more matches\n`;
    }
    
    output += '\n';
  }

  return output.trim();
}

/**
 * Create ADK tool for GitHub search
 */
export function createGitHubSearchTool() {
  return {
    name: 'bot_github_advanced_search',
    description: `🔍 ADVANCED CODE SEARCH: Multi-strategy search with automatic fallbacks

**SEARCH STRATEGIES (Automatic):**
1. **GitHub API** - Fast cloud-based search (tries first)
2. **Local Search** - Fast local filesystem search if repo is cached (fallback)
3. **JavaScript** - Pure JS fallback via API (always works)

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
    parameters: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'Repository owner',
        },
        repo: {
          type: 'string',
          description: 'Repository name',
        },
        pattern: {
          type: 'string',
          description: 'Search pattern (regex or plain text)',
        },
        path: {
          type: 'string',
          description: 'Optional: search within specific path (e.g., "src/components")',
        },
        include: {
          type: 'string',
          description: 'Optional: file pattern to include (e.g., "*.ts", "*.{js,jsx}")',
        },
        branch: {
          type: 'string',
          description: 'Optional: branch to search (defaults to default branch)',
        },
        isRegex: {
          type: 'boolean',
          description: 'Whether pattern is regex (default: true)',
        },
      },
      required: ['owner', 'repo', 'pattern'],
    },
  };
}
