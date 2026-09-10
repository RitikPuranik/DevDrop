/**
 * Repository FileSystem Cache
 * 
 * Local filesystem-based caching system for GitHub repositories
 * Dramatically reduces GitHub API calls and improves agent performance
 * 
 * Features:
 * - Clone and cache entire repositories locally
 * - Fast file access without API calls
 * - Local filesystem operations (search, analysis) for advanced searches
 * - Automatic cleanup and expiration
 * - Memory and disk-based dual caching
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import crypto from 'crypto';

/**
 * Configuration for filesystem cache
 */
export interface FileCacheConfig {
  maxCacheSize: number; // bytes, default 1GB
  cacheTTL: number; // milliseconds, default 1 hour
  maxRepositories: number; // default 10
  compressionEnabled: boolean; // gzip compression
  octokit?: any; // Optional Octokit instance for API fallback
}

/**
 * Cache entry metadata
 */
interface CacheEntry {
  key: string;
  owner: string;
  repo: string;
  branch: string;
  type: 'repository' | 'file' | 'tree';
  path?: string; // for file entries
  size: number;
  hash: string;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
  ttl: number;
}

/**
 * Repository cache info
 */
interface RepositoryCacheInfo {
  owner: string;
  repo: string;
  branch: string;
  localPath: string;
  clonedAt: number;
  lastPulledAt: number;
  fileCount: number;
  totalSize: number;
  gitSha: string;
}

/**
 * Search result from local filesystem search
 */
interface GitGrepResult {
  file: string;
  line: number;
  content: string;
  match: string;
}

/**
 * File index entry for fast lookup
 */
interface FileIndexEntry {
  path: string;
  size: number;
  hash: string;
  type: 'file' | 'directory';
  modifiedAt?: number;
}

/**
 * Repository file index
 */
interface RepositoryFileIndex {
  owner: string;
  repo: string;
  branch: string;
  indexedAt: number;
  files: Map<string, FileIndexEntry>;
}

/**
 * Main repository filesystem cache class
 */
export class RepositoryFileSystemCache {
  private cacheDir: string;
  private config: FileCacheConfig;
  private memoryCache: Map<string, { data: any; entry: CacheEntry }> = new Map();
  private repositoryIndex: Map<string, RepositoryCacheInfo> = new Map();
  private fileIndex: Map<string, RepositoryFileIndex> = new Map(); // File index for fast lookup
  private modifiedFiles: Map<string, Set<string>> = new Map(); // Track local modifications: repoKey => Set<filePath>
  private cleanupInterval: NodeJS.Timeout | null = null;
  private octokit: any = null;

  constructor(_config: Partial<FileCacheConfig> = {}) {
    // Apply default config
    this.config = {
      maxCacheSize: _config.maxCacheSize ?? 1024 * 1024 * 1024, // 1GB
      cacheTTL: _config.cacheTTL ?? 60 * 60 * 1000, // 1 hour
      maxRepositories: _config.maxRepositories ?? 10,
      compressionEnabled: _config.compressionEnabled ?? false,
      octokit: _config.octokit,
    };

    // Store octokit for API fallback
    this.octokit = _config.octokit;

    // Set cache directory
    this.cacheDir = path.join(os.tmpdir(), 'genie-agent-cache');

    // Initialize
    this.initialize();

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Initialize cache directory
   */
  private async initialize() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      console.log(`[RepositoryFileSystemCache] Initialized at ${this.cacheDir}`);
      await this.loadRepositoryIndex();
      await this.loadFileIndex(); // Load file index for fast lookups
    } catch (error) {
      console.error('[RepositoryFileSystemCache] Initialization error:', error);
    }
  }

  /**
   * Fetch and cache repository via GitHub API (no git required)
   */
  async ensureRepository(
    owner: string,
    repo: string,
    branch: string = 'main'
  ): Promise<RepositoryCacheInfo> {
    const repoKey = `${owner}/${repo}`;
    const localPath = path.join(this.cacheDir, 'repos', owner, repo);

    // Check if already cached and fresh
    const cached = this.repositoryIndex.get(repoKey);
    if (cached && cached.branch === branch) {
      const ageMs = Date.now() - cached.lastPulledAt;
      if (ageMs < this.config.cacheTTL) {
        console.log(
          `[RepositoryFileSystemCache] Using cached repo ${repoKey}@${branch} (age: ${Math.round(ageMs / 1000)}s)`
        );
        return cached;
      }
    }

    console.log(`[RepositoryFileSystemCache] Preparing ${repoKey}@${branch} via API...`);

    try {
      if (!this.octokit) {
        throw new Error('Octokit instance required for GitHub API access');
      }

      // Ensure directory exists
      await fs.mkdir(localPath, { recursive: true });

      let fileCount = 0;
      let totalSize = 0;
      let sha = 'api-mode';

      // Get branch info to get commit SHA
      try {
        const branchInfo = await this.octokit.repos.getBranch({
          owner,
          repo,
          branch,
        });
        sha = branchInfo.data.commit.sha;
      } catch (error: any) {
        console.warn(`[RepositoryFileSystemCache] Could not get branch info: ${error.message}`);
      }

      // Fetch all files via GitHub API
      const analyzed = await this.fetchFilesViaAPI(owner, repo, branch, localPath);
      fileCount = analyzed.fileCount;
      totalSize = analyzed.totalSize;

      const info: RepositoryCacheInfo = {
        owner,
        repo,
        branch,
        localPath,
        clonedAt: cached?.clonedAt || Date.now(),
        lastPulledAt: Date.now(),
        fileCount,
        totalSize,
        gitSha: sha,
      };

      this.repositoryIndex.set(repoKey, info);
      await this.saveRepositoryIndex();

      // Build file index for fast lookup
      await this.buildFileIndex(owner, repo, branch, localPath);

      console.log(`[RepositoryFileSystemCache] ✅ Ready: ${repoKey}@${branch} (${fileCount} files, ${this.formatBytes(totalSize)})`);

      return info;
    } catch (error: any) {
      console.error(`[RepositoryFileSystemCache] Error preparing ${repoKey}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch repository tree and files via GitHub API (when git is not available)
   */
  private async fetchFilesViaAPI(
    owner: string,
    repo: string,
    branch: string,
    localPath: string
  ): Promise<{ fileCount: number; totalSize: number }> {
    if (!this.octokit) {
      throw new Error('Octokit instance not available for API access');
    }

    let fileCount = 0;
    let totalSize = 0;

    try {
      // Get repository tree recursively
      const treeResponse = await this.octokit.git.getTree({
        owner,
        repo,
        tree_sha: branch,
        recursive: 1,
      });

      const tree = treeResponse.data.tree || [];

      // Filter to files only and fetch each one
      const files = tree.filter((item: any) => item.type === 'blob');
      console.log(`[RepositoryFileSystemCache] Found ${files.length} files to fetch from API`);

      for (const file of files) {
        try {
          const fileResponse = await this.octokit.repos.getContent({
            owner,
            repo,
            path: file.path,
            ref: branch,
          });

          if (Array.isArray(fileResponse.data)) {
            continue; // Skip directories
          }

          const content = Buffer.from(fileResponse.data.content, 'base64');
          const fullPath = path.join(localPath, file.path);

          // Create parent directories
          const dirPath = path.dirname(fullPath);
          await fs.mkdir(dirPath, { recursive: true });

          // Write file
          await fs.writeFile(fullPath, content);

          fileCount++;
          totalSize += content.length;
        } catch (error: any) {
          console.warn(`[RepositoryFileSystemCache] Failed to fetch ${file.path}:`, error.message);
          // Continue with next file
        }
      }

      console.log(
        `[RepositoryFileSystemCache] API fetch complete: ${fileCount} files, ${this.formatBytes(totalSize)}`
      );
      return { fileCount, totalSize };
    } catch (error: any) {
      console.error(`[RepositoryFileSystemCache] API tree fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get file content from cache
   */
  async getFileContent(
    owner: string,
    repo: string,
    filePath: string,
    branch: string = 'main'
  ): Promise<string> {
    const cacheKey = `file:${owner}/${repo}/${branch}/${filePath}`;

    // Check memory cache first
    const memEntry = this.memoryCache.get(cacheKey);
    if (memEntry && !this.isExpired(memEntry.entry)) {
      memEntry.entry.accessedAt = Date.now();
      memEntry.entry.accessCount++;
      return memEntry.data;
    }

    try {
      const repoInfo = await this.ensureRepository(owner, repo, branch);
      const fullPath = path.join(repoInfo.localPath, filePath);

      // Security check
      if (!fullPath.startsWith(repoInfo.localPath)) {
        throw new Error('Path traversal attempt detected');
      }

      const content = await fs.readFile(fullPath, 'utf-8');

      // Store in memory cache
      const entry: CacheEntry = {
        key: cacheKey,
        owner,
        repo,
        branch,
        path: filePath,
        type: 'file',
        size: Buffer.byteLength(content),
        hash: this.hashContent(content),
        createdAt: Date.now(),
        accessedAt: Date.now(),
        accessCount: 1,
        ttl: this.config.cacheTTL,
      };

      this.memoryCache.set(cacheKey, { data: content, entry });
      console.log(`[RepositoryFileSystemCache] Cached file ${filePath} from ${cacheKey}`);

      return content;
    } catch (error: any) {
      // Fallback to GitHub API if local cache fails
      if (this.octokit) {
        console.warn(`[RepositoryFileSystemCache] Git cache failed, trying API fallback for ${filePath}`);
        try {
          const response = await this.octokit.repos.getContent({
            owner,
            repo,
            path: filePath,
            ref: branch,
          });

          if (Array.isArray(response.data)) {
            throw new Error('Expected file, got directory');
          }

          const content = Buffer.from(response.data.content, 'base64').toString('utf-8');

          // Store in memory cache
          const entry: CacheEntry = {
            key: cacheKey,
            owner,
            repo,
            branch,
            path: filePath,
            type: 'file',
            size: Buffer.byteLength(content),
            hash: this.hashContent(content),
            createdAt: Date.now(),
            accessedAt: Date.now(),
            accessCount: 1,
            ttl: this.config.cacheTTL,
          };

          this.memoryCache.set(cacheKey, { data: content, entry });
          console.log(`[RepositoryFileSystemCache] ✅ Retrieved ${filePath} from GitHub API (cached)`);

          return content;
        } catch (apiError: any) {
          console.error(`[RepositoryFileSystemCache] API fallback failed:`, apiError.message);
          throw new Error(`Failed to retrieve ${filePath}: ${apiError.message}`);
        }
      }

      if (error.code === 'ENOENT') {
        console.warn(`[RepositoryFileSystemCache] File not found: ${filePath}`);
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Search files locally in cached repository (fast, no API calls)
   */
  async searchFiles(
    owner: string,
    repo: string,
    pattern: string,
    branch: string = 'main',
    filePattern?: string
  ): Promise<GitGrepResult[]> {
    try {
      // Ensure repo is cached locally first
      const repoInfo = await this.ensureRepository(owner, repo, branch);

      const results: GitGrepResult[] = [];
      
      // Remove inline flags like (?i) since we add 'i' flag separately
      const cleanPattern = pattern.replace(/\(\?[imsx]+\)/g, '');
      
      const regex = new RegExp(cleanPattern, 'i'); // Case-insensitive regex

      console.log(`[RepositoryFileSystemCache] Searching locally for "${pattern}" in ${owner}/${repo}...`);

      // Convert glob pattern to regex-friendly pattern
      const globToRegex = (glob: string): RegExp => {
        // Escape special regex characters except for glob wildcards
        let regexStr = glob
          .replace(/\./g, '\\.')
          .replace(/\//g, '[/\\\\]') // Allow both / and \ for path separators
          .replace(/\?/g, '.')
          .replace(/\*\*/g, '{{GLOBSTAR}}')
          .replace(/\*/g, '[^/\\\\]*')
          .replace(/\{\{GLOBSTAR\}\}/g, '.*');
        
        return new RegExp(`^${regexStr}$`, 'i');
      };

      // Recursively search through cached files
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
              if (filePattern) {
                try {
                  const fileRegex = globToRegex(filePattern);
                  if (!fileRegex.test(relPath)) {
                    continue;
                  }
                } catch (regexError: any) {
                  console.warn(`[RepositoryFileSystemCache] Invalid file pattern "${filePattern}":`, regexError.message);
                  continue;
                }
              }

              try {
                // Read file content
                const content = await fs.readFile(fullPath, 'utf-8');
                const lines = content.split('\n');

                // Search for pattern in each line
                for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                  const line = lines[lineNum];
                  if (regex.test(line)) {
                    results.push({
                      file: relPath,
                      line: lineNum + 1, // 1-indexed
                      content: line.trim(),
                      match: pattern,
                    });
                  }
                }
              } catch (error: any) {
                // Skip binary files or read errors
                if (!error.message.includes('ENOENT')) {
                  console.warn(`[RepositoryFileSystemCache] Could not read ${relPath}`);
                }
              }
            }
          }
        } catch (error) {
          console.warn(`[RepositoryFileSystemCache] Error scanning directory:`, error);
        }
      };

      await searchDir(repoInfo.localPath);

      console.log(
        `[RepositoryFileSystemCache] Found ${results.length} matches for "${pattern}" in ${owner}/${repo} (local search)`
      );

      return results;
    } catch (error: any) {
      console.error(`[RepositoryFileSystemCache] Search error:`, error.message);
      // Return empty array instead of throwing
      return [];
    }
  }

  /**
   * Get file tree structure
   */
  async getFileTree(
    owner: string,
    repo: string,
    branch: string = 'main',
    dirPath: string = ''
  ): Promise<
    Array<{
      path: string;
      type: 'file' | 'directory';
      size?: number;
    }>
  > {
    try {
      const repoInfo = await this.ensureRepository(owner, repo, branch);
      const fullPath = path.join(repoInfo.localPath, dirPath);

      // Security check
      if (!fullPath.startsWith(repoInfo.localPath)) {
        throw new Error('Path traversal attempt detected');
      }

      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const result = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name === '.git') continue;

        const entryPath = path.join(dirPath, entry.name);
        const fullEntryPath = path.join(fullPath, entry.name);

        if (entry.isDirectory()) {
          result.push({
            path: entryPath,
            type: 'directory' as const,
          });
        } else {
          const stat = await fs.stat(fullEntryPath);
          result.push({
            path: entryPath,
            type: 'file' as const,
            size: stat.size,
          });
        }
      }

      return result;
    } catch (error) {
      console.error(`[RepositoryFileSystemCache] Tree error:`, error);
      throw error;
    }
  }

  /**
   * Edit file locally and return new content
   */
  async editFile(
    owner: string,
    repo: string,
    filePath: string,
    oldContent: string,
    newContent: string,
    branch: string = 'main'
  ): Promise<string> {
    try {
      const repoInfo = await this.ensureRepository(owner, repo, branch);
      const fullPath = path.join(repoInfo.localPath, filePath);

      // Security check
      if (!fullPath.startsWith(repoInfo.localPath)) {
        throw new Error('Path traversal attempt detected');
      }

      let updated: string;
      const fileExists = await this.fileExists(fullPath);

      if (!fileExists) {
        // File doesn't exist - create it
        if (oldContent !== '') {
          throw new Error(
            `File does not exist (${filePath}) but oldContent is not empty. Cannot apply edit.`
          );
        }

        // Create parent directories if needed
        const dirPath = path.dirname(fullPath);
        await fs.mkdir(dirPath, { recursive: true });

        // Write new file
        updated = newContent;
        await fs.writeFile(fullPath, updated, 'utf-8');

        console.log(
          `[RepositoryFileSystemCache] Created new file ${filePath} in ${owner}/${repo}@${branch}`
        );
      } else {
        // File exists - update it
        const currentContent = await fs.readFile(fullPath, 'utf-8');

        // Verify old content matches
        if (!currentContent.includes(oldContent)) {
          throw new Error('Old content not found in file');
        }

        // Replace
        updated = currentContent.replace(oldContent, newContent);

        // Write back
        await fs.writeFile(fullPath, updated, 'utf-8');

        console.log(
          `[RepositoryFileSystemCache] Updated ${filePath} in ${owner}/${repo}@${branch}`
        );
      }

      // Invalidate cache
      this.invalidateFileCache(owner, repo, filePath);

      // Track as modified
      const repoKey = `${owner}/${repo}@${branch}`;
      if (!this.modifiedFiles.has(repoKey)) {
        this.modifiedFiles.set(repoKey, new Set());
      }
      this.modifiedFiles.get(repoKey)!.add(filePath);

      return updated;
    } catch (error) {
      console.error(`[RepositoryFileSystemCache] Edit error:`, error);
      throw error;
    }
  }

  /**
   * Get list of all modified files from local tracking
   */
  async getModifiedFiles(
    owner: string,
    repo: string,
    branch: string = 'main'
  ): Promise<
    Array<{
      path: string;
      status: 'modified' | 'added' | 'deleted';
      oldContent?: string;
      newContent?: string;
    }>
  > {
    try {
      const repoKey = `${owner}/${repo}@${branch}`;
      const modifiedSet = this.modifiedFiles.get(repoKey);

      if (!modifiedSet || modifiedSet.size === 0) {
        console.log(
          `[RepositoryFileSystemCache] No local modifications found in ${owner}/${repo}@${branch}`
        );
        return [];
      }

      const results = [];
      for (const filePath of modifiedSet) {
        results.push({
          path: filePath,
          status: 'modified' as const,
        });
      }

      console.log(
        `[RepositoryFileSystemCache] Found ${results.length} modified files in ${owner}/${repo}@${branch}`
      );

      return results;
    } catch (error: any) {
      console.error(`[RepositoryFileSystemCache] Modified files error:`, error.message);
      return [];
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let memoryUsage = 0;
    let validEntries = 0;

    for (const [, entry] of this.memoryCache) {
      if (!this.isExpired(entry.entry)) {
        memoryUsage += entry.entry.size;
        validEntries++;
      }
    }

    return {
      memoryCache: {
        entries: validEntries,
        totalSize: this.formatBytes(memoryUsage),
        maxSize: this.formatBytes(this.config.maxCacheSize),
      },
      repositories: Array.from(this.repositoryIndex.values()).map((info) => ({
        key: `${info.owner}/${info.repo}`,
        branch: info.branch,
        path: info.localPath,
        fileCount: info.fileCount,
        size: this.formatBytes(info.totalSize),
        age: this.formatTime(Date.now() - info.lastPulledAt),
      })),
    };
  }

  /**
   * Clear modified files tracking after successful commit
   */
  clearModifiedFiles(owner: string, repo: string, branch: string = 'main') {
    const repoKey = `${owner}/${repo}@${branch}`;
    this.modifiedFiles.delete(repoKey);
    console.log(`[RepositoryFileSystemCache] Cleared modified files tracking for ${repoKey}`);
  }

  /**
   * Clear cache for specific repository
   */
  async clearRepository(owner: string, repo: string) {
    const repoKey = `${owner}/${repo}`;
    const info = this.repositoryIndex.get(repoKey);

    if (info) {
      try {
        await fs.rm(info.localPath, { recursive: true, force: true });
        this.repositoryIndex.delete(repoKey);
        await this.saveRepositoryIndex();

        // Also clear memory cache entries for this repo
        for (const key of this.memoryCache.keys()) {
          if (key.includes(`${owner}/${repo}`)) {
            this.memoryCache.delete(key);
          }
        }

        // Clear modified files tracking
        for (const key of this.modifiedFiles.keys()) {
          if (key.startsWith(`${owner}/${repo}@`)) {
            this.modifiedFiles.delete(key);
          }
        }

        console.log(`[RepositoryFileSystemCache] Cleared cache for ${repoKey}`);
      } catch (error) {
        console.error(`[RepositoryFileSystemCache] Clear error:`, error);
      }
    }
  }

  /**
   * Clear all caches
   */
  async clearAll() {
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
      this.memoryCache.clear();
      this.repositoryIndex.clear();
      console.log(`[RepositoryFileSystemCache] Cleared all caches`);
    } catch (error) {
      console.error(`[RepositoryFileSystemCache] Clear all error:`, error);
    }
  }

  // ============ Private methods ============

  /**
   * Build file index for fast lookups
   */
  private async buildFileIndex(
    owner: string,
    repo: string,
    branch: string,
    localPath: string
  ): Promise<void> {
    const repoKey = `${owner}/${repo}@${branch}`;
    const files = new Map<string, FileIndexEntry>();

    console.log(`[RepositoryFileSystemCache] Building file index for ${repoKey}...`);

    const scanDir = async (dirPath: string, relativePath: string = '') => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          // Skip hidden files and git directory
          if (entry.name.startsWith('.')) continue;

          const fullPath = path.join(dirPath, entry.name);
          const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            // Index directory
            files.set(relPath, {
              path: relPath,
              size: 0,
              hash: '',
              type: 'directory',
            });
            // Recursively scan subdirectory
            await scanDir(fullPath, relPath);
          } else {
            // Index file with hash
            try {
              const stat = await fs.stat(fullPath);
              const content = await fs.readFile(fullPath, 'utf-8');
              const hash = this.hashContent(content);

              files.set(relPath, {
                path: relPath,
                size: stat.size,
                hash,
                type: 'file',
                modifiedAt: stat.mtimeMs,
              });
            } catch (error) {
              console.warn(`[RepositoryFileSystemCache] Could not index ${relPath}:`, error);
            }
          }
        }
      } catch (error) {
        console.warn(`[RepositoryFileSystemCache] Error scanning directory:`, error);
      }
    };

    await scanDir(localPath);

    // Store in file index
    const index: RepositoryFileIndex = {
      owner,
      repo,
      branch,
      indexedAt: Date.now(),
      files,
    };

    this.fileIndex.set(repoKey, index);
    await this.saveFileIndex();

    console.log(`[RepositoryFileSystemCache] File index built: ${files.size} entries for ${repoKey}`);
  }

  /**
   * Get file index for repository
   */
  private getFileIndex(owner: string, repo: string, branch: string): RepositoryFileIndex | null {
    const repoKey = `${owner}/${repo}@${branch}`;
    return this.fileIndex.get(repoKey) || null;
  }

  /**
   * List files in directory using index
   */
  async listFilesInDirectory(
    owner: string,
    repo: string,
    dirPath: string = '',
    branch: string = 'main'
  ): Promise<FileIndexEntry[]> {
    const index = this.getFileIndex(owner, repo, branch);
    if (!index) {
      throw new Error(`No file index for ${owner}/${repo}@${branch}`);
    }

    const results: FileIndexEntry[] = [];
    const prefix = dirPath ? `${dirPath}/` : '';

    for (const [path, entry] of index.files) {
      if (path.startsWith(prefix)) {
        // Check if it's a direct child (not nested deeper)
        const remainder = path.slice(prefix.length);
        if (!remainder.includes('/')) {
          results.push(entry);
        }
      }
    }

    return results;
  }

  /**
   * Check if file exists using index (fast O(1) lookup)
   */
  fileExistsInIndex(
    owner: string,
    repo: string,
    filePath: string,
    branch: string = 'main'
  ): boolean {
    const index = this.getFileIndex(owner, repo, branch);
    if (!index) {
      return false;
    }
    return index.files.has(filePath);
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Hash content
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if cache entry expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.createdAt > entry.ttl;
  }

  /**
   * Invalidate file cache
   */
  private invalidateFileCache(owner: string, repo: string, filePath: string) {
    const prefix = `file:${owner}/${repo}`;
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix) && key.includes(filePath)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Perform cleanup
   */
  private performCleanup() {
    // Remove expired memory cache entries
    let removed = 0;
    for (const [key, entry] of this.memoryCache) {
      if (this.isExpired(entry.entry)) {
        this.memoryCache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(
        `[RepositoryFileSystemCache] Cleaned up ${removed} expired cache entries`
      );
    }

    // Log stats
    console.log('[RepositoryFileSystemCache] Stats:', JSON.stringify(this.getStats(), null, 2));
  }

  /**
   * Save repository index
   */
  private async saveRepositoryIndex() {
    try {
      const indexPath = path.join(this.cacheDir, 'repo-index.json');
      const data = Array.from(this.repositoryIndex.values());
      await fs.writeFile(indexPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('[RepositoryFileSystemCache] Error saving repo index:', error);
    }
  }

  /**
   * Load repository index
   */
  private async loadRepositoryIndex() {
    try {
      const indexPath = path.join(this.cacheDir, 'repo-index.json');
      if (await this.fileExists(indexPath)) {
        const data = await fs.readFile(indexPath, 'utf-8');
        const repos: RepositoryCacheInfo[] = JSON.parse(data);
        for (const repo of repos) {
          this.repositoryIndex.set(`${repo.owner}/${repo.repo}`, repo);
        }
        console.log(
          `[RepositoryFileSystemCache] Loaded ${repos.length} repositories from index`
        );
      }
    } catch (error) {
      console.warn('[RepositoryFileSystemCache] Error loading repo index:', error);
    }
  }

  /**
   * Save file index to disk for persistence
   */
  private async saveFileIndex() {
    try {
      const indexPath = path.join(this.cacheDir, 'file-index.json');
      const data = Array.from(this.fileIndex.values()).map((index) => ({
        owner: index.owner,
        repo: index.repo,
        branch: index.branch,
        indexedAt: index.indexedAt,
        files: Array.from(index.files.entries()).map(([filePath, entry]) => ({
          filePath,
          ...entry,
        })),
      }));
      await fs.writeFile(indexPath, JSON.stringify(data, null, 2));
      console.log(`[RepositoryFileSystemCache] Saved file index (${this.fileIndex.size} repos)`);
    } catch (error) {
      console.warn('[RepositoryFileSystemCache] Error saving file index:', error);
    }
  }

  /**
   * Load file index from disk
   */
  private async loadFileIndex() {
    try {
      const indexPath = path.join(this.cacheDir, 'file-index.json');
      if (await this.fileExists(indexPath)) {
        const data = await fs.readFile(indexPath, 'utf-8');
        const indices = JSON.parse(data);

        for (const index of indices) {
          const files = new Map<string, FileIndexEntry>(
            index.files.map((f: any) => {
              const { filePath, ...entry } = f;
              return [filePath as string, entry as FileIndexEntry];
            })
          );
          this.fileIndex.set(`${index.owner}/${index.repo}@${index.branch}`, {
            owner: index.owner,
            repo: index.repo,
            branch: index.branch,
            indexedAt: index.indexedAt,
            files,
          });
        }

        console.log(`[RepositoryFileSystemCache] Loaded file index (${this.fileIndex.size} repos)`);
      }
    } catch (error) {
      console.warn('[RepositoryFileSystemCache] Error loading file index:', error);
    }
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Format time duration
   */
  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  /**
   * Cleanup on destroy
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
