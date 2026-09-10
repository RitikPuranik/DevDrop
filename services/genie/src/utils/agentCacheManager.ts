/**
 * Agent Cache Integration Helper
 * 
 * Helps initialize and manage filesystem cache for agent instances
 * Provides utilities to parallelize tool execution and batch operations
 */

import { RepositoryFileSystemCache } from './repositoryFileSystemCache';

/**
 * Initialize cache for agent
 */
export class AgentCacheManager {
  private cache: RepositoryFileSystemCache;
  private activeRepositories: Set<string> = new Set();

  constructor(config?: any) {
    this.cache = new RepositoryFileSystemCache(config);
  }

  /**
   * Get cache instance
   */
  getCache(): RepositoryFileSystemCache {
    return this.cache;
  }

  /**
   * Pre-load repository into cache before agent starts
   * This dramatically speeds up initial operations
   */
  async preLoadRepository(
    owner: string,
    repo: string,
    branch: string = 'main'
  ): Promise<{ fileCount: number; totalSize: string }> {
    console.log(`[AgentCacheManager] Pre-loading ${owner}/${repo}@${branch}...`);

    const repoInfo = await this.cache.ensureRepository(owner, repo, branch);
    this.activeRepositories.add(`${owner}/${repo}`);

    console.log(
      `[AgentCacheManager] Pre-loaded: ${repoInfo.fileCount} files (${this.formatBytes(repoInfo.totalSize)})`
    );

    return {
      fileCount: repoInfo.fileCount,
      totalSize: this.formatBytes(repoInfo.totalSize),
    };
  }

  /**
   * Batch search - find all relevant files at once
   * Returns immediately available for agent to use in parallel
   */
  async batchSearch(
    owner: string,
    repo: string,
    patterns: string[],
    branch: string = 'main'
  ): Promise<Map<string, any[]>> {
    console.log(
      `[AgentCacheManager] Batch searching ${patterns.length} patterns in ${owner}/${repo}...`
    );

    const results = new Map<string, any[]>();

    // Execute all searches in parallel
    const searchPromises = patterns.map((pattern) =>
      this.cache
        .searchFiles(owner, repo, pattern, branch)
        .then((matches) => {
          results.set(pattern, matches);
        })
        .catch((error) => {
          console.warn(`[AgentCacheManager] Search failed for "${pattern}":`, error.message);
          results.set(pattern, []);
        })
    );

    await Promise.all(searchPromises);

    console.log(`[AgentCacheManager] Batch search complete: ${results.size} patterns analyzed`);
    return results;
  }

  /**
   * Batch file read - load multiple files in parallel
   */
  async batchReadFiles(
    owner: string,
    repo: string,
    paths: string[],
    branch: string = 'main'
  ): Promise<Map<string, string>> {
    console.log(`[AgentCacheManager] Batch reading ${paths.length} files...`);

    const results = new Map<string, string>();

    // Execute all reads in parallel
    const readPromises = paths.map((filePath) =>
      this.cache
        .getFileContent(owner, repo, filePath, branch)
        .then((content) => {
          results.set(filePath, content);
        })
        .catch((error) => {
          console.warn(
            `[AgentCacheManager] Failed to read ${filePath}:`,
            error.message
          );
          results.set(filePath, '');
        })
    );

    await Promise.all(readPromises);

    console.log(`[AgentCacheManager] Batch read complete: ${results.size} files loaded`);
    return results;
  }

  /**
   * Create context injection for agent
   * Pre-loads all information needed to answer questions
   */
  async createAgentContext(
    owner: string,
    repo: string,
    branch: string = 'main'
  ): Promise<{
    repository: {
      owner: string;
      repo: string;
      branch: string;
    };
    fileStructure: Array<{
      path: string;
      type: 'file' | 'directory';
      size?: number;
    }>;
    keyFiles: string[];
    cacheStats: any;
  }> {
    console.log(`[AgentCacheManager] Creating agent context for ${owner}/${repo}@${branch}...`);

    // Ensure repo is cached
    await this.preLoadRepository(owner, repo, branch);

    // Get file tree
    const fileStructure = await this.cache.getFileTree(owner, repo, branch);

    // Get cache stats
    const cacheStats = this.cache.getStats();

    // Identify key files
    const keyFiles = [
      'package.json',
      'pyproject.toml',
      'setup.py',
      'requirements.txt',
      'README.md',
      'Dockerfile',
      'docker-compose.yml',
      '.github/workflows',
      'src/index.ts',
      'src/main.py',
    ];

    const context = {
      repository: { owner, repo, branch },
      fileStructure: fileStructure.slice(0, 500), // Limit to top 500 entries
      keyFiles,
      cacheStats,
    };

    console.log(`[AgentCacheManager] Context created with ${fileStructure.length} files`);

    return context;
  }

  /**
   * Get context summary for system prompt injection
   */
  getContextSummary(): string {
    const stats = this.cache.getStats();
    const repoCount = stats.repositories.length;
    const memoryUsage = stats.memoryCache.totalSize;

    return `
### Local File Cache Status
- **Cached Repositories:** ${repoCount}
- **Memory Usage:** ${memoryUsage}
- **Available Tools:**
  - \`bot_github_get_file_cached\` - Read files instantly from cache
  - \`bot_github_search_cached\` - Search using local filesystem (10x faster)
  - \`bot_github_tree_cached\` - Browse repository structure
  - \`bot_github_edit_cached\` - Edit files locally
  - \`bot_github_modified_cached\` - View local changes

**Performance Tip:** All file operations now use local cache - expect 50-100x faster response times compared to API calls.
    `.trim();
  }

  /**
   * Cleanup
   */
  async cleanup() {
    console.log('[AgentCacheManager] Cleaning up cache...');
    this.cache.destroy();
  }

  // ============ Private ============

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

/**
 * Parallel tool execution helper
 * Executes multiple tool calls concurrently for better performance
 */
export class ParallelToolExecutor {
  /**
   * Execute multiple search operations in parallel
   */
  static async parallelSearch(
    cache: RepositoryFileSystemCache,
    owner: string,
    repo: string,
    searches: Array<{
      pattern: string;
      filePattern?: string;
      maxResults?: number;
    }>,
    branch: string = 'main'
  ): Promise<
    Array<{
      pattern: string;
      results: any[];
      error?: string;
    }>
  > {
    const results = await Promise.allSettled(
      searches.map((search) =>
        cache
          .searchFiles(owner, repo, search.pattern, branch, search.filePattern)
          .then((results) => ({
            pattern: search.pattern,
            results: results.slice(0, search.maxResults || 50),
          }))
      )
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          pattern: searches[index].pattern,
          results: [],
          error: (result.reason as Error).message,
        };
      }
    });
  }

  /**
   * Execute multiple file reads in parallel
   */
  static async parallelReadFiles(
    cache: RepositoryFileSystemCache,
    owner: string,
    repo: string,
    files: string[],
    branch: string = 'main'
  ): Promise<
    Array<{
      path: string;
      content: string;
      error?: string;
    }>
  > {
    const results = await Promise.allSettled(
      files.map((path) =>
        cache.getFileContent(owner, repo, path, branch).then((content) => ({
          path,
          content,
        }))
      )
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          path: files[index],
          content: '',
          error: (result.reason as Error).message,
        };
      }
    });
  }

  /**
   * Execute multiple edits in parallel (on same branch)
   */
  static async parallelEditFiles(
    cache: RepositoryFileSystemCache,
    owner: string,
    repo: string,
    edits: Array<{
      path: string;
      oldContent: string;
      newContent: string;
    }>,
    branch: string = 'main'
  ): Promise<
    Array<{
      path: string;
      success: boolean;
      error?: string;
    }>
  > {
    const results = await Promise.allSettled(
      edits.map((edit) =>
        cache
          .editFile(owner, repo, edit.path, edit.oldContent, edit.newContent, branch)
          .then(() => ({
            path: edit.path,
            success: true,
          }))
      )
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          path: edits[index].path,
          success: false,
          error: (result.reason as Error).message,
        };
      }
    });
  }
}
