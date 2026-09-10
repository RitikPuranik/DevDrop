/**
 * Heroku-Aware Cache Configuration
 * 
 * Automatically detects Heroku environment and configures caching appropriately
 * - Development: Uses /tmp (ephemeral)
 * - Production with storage: Uses persistent + ephemeral (hybrid)
 * - Production without storage: Uses /tmp with warnings
 */

import * as path from 'path';
import * as os from 'os';
import { RepositoryFileSystemCache } from './repositoryFileSystemCache';

/**
 * Detect if running on Heroku
 */
export function isHeroku(): boolean {
  return !!process.env.HEROKU_APP_NAME;
}

/**
 * Get appropriate cache directory based on environment
 */
export function getCacheDirectory(): {
  path: string;
  persistent: boolean;
  maxSize: number;
  warning?: string;
} {
  const isProduction = process.env.NODE_ENV === 'production';
  const onHeroku = isHeroku();

  // Check for persistent storage configuration
  const persistentPath = process.env.PERSISTENT_CACHE_PATH;
  const s3Bucket = process.env.AWS_S3_CACHE_BUCKET;

  if (isProduction && onHeroku) {
    // Heroku production
    if (persistentPath) {
      // Persistent storage available
      console.log(`[HerokuCache] Using persistent storage: ${persistentPath}`);
      return {
        path: persistentPath,
        persistent: true,
        maxSize: 10 * 1024 * 1024 * 1024, // 10GB
      };
    } else if (s3Bucket) {
      // S3 backend (would need different implementation)
      console.log(`[HerokuCache] Using S3 bucket: ${s3Bucket}`);
      return {
        path: path.join(os.tmpdir(), 'genie-agent-cache'),
        persistent: false,
        maxSize: 500 * 1024 * 1024, // 500MB
        warning: 'S3 caching not yet implemented, using ephemeral fallback',
      };
    } else {
      // No persistent storage on production
      console.warn(
        '[HerokuCache] ⚠️  Production without persistent storage. Cache will be lost on dyno restart.'
      );
      return {
        path: path.join(os.tmpdir(), 'genie-agent-cache'),
        persistent: false,
        maxSize: 500 * 1024 * 1024, // 500MB
        warning: 'No persistent storage configured. Set PERSISTENT_CACHE_PATH or AWS_S3_CACHE_BUCKET.',
      };
    }
  } else {
    // Development or local
    return {
      path: path.join(os.tmpdir(), 'genie-agent-cache'),
      persistent: false,
      maxSize: 500 * 1024 * 1024, // 500MB
    };
  }
}

/**
 * Get cache configuration for current environment
 */
export function getHerokuCacheConfig() {
  const cacheDir = getCacheDirectory();

  return {
    maxCacheSize: cacheDir.maxSize,
    cacheTTL: cacheDir.persistent
      ? 24 * 60 * 60 * 1000 // 24 hours if persistent
      : 2 * 60 * 60 * 1000, // 2 hours if ephemeral
    maxRepositories: cacheDir.persistent ? 50 : 10,
    compressionEnabled: false,
    // Custom property for logging
    _herokuConfig: {
      isHeroku: isHeroku(),
      isPersistent: cacheDir.persistent,
      path: cacheDir.path,
      warning: cacheDir.warning,
    },
  };
}

/**
 * Create cache instance with Heroku-aware configuration
 */
export function createHerokuAwareCache(): {
  cache: RepositoryFileSystemCache;
  config: ReturnType<typeof getHerokuCacheConfig>;
  info: string;
} {
  const config = getHerokuCacheConfig();
  const cache = new RepositoryFileSystemCache(config);

  const info = formatCacheInfo(config);

  console.log(info);

  return { cache, config, info };
}

/**
 * Format cache configuration information
 */
function formatCacheInfo(config: ReturnType<typeof getHerokuCacheConfig>): string {
  const lines: string[] = [];

  lines.push('╔════════════════════════════════════════╗');
  lines.push('║    Repository File System Cache        ║');
  lines.push('╚════════════════════════════════════════╝');

  if (config._herokuConfig.isHeroku) {
    lines.push(`Environment: Heroku ${process.env.NODE_ENV === 'production' ? '(Production)' : '(Staging)'}`);
  } else {
    lines.push('Environment: Local Development');
  }

  lines.push(`Storage: ${config._herokuConfig.isPersistent ? 'Persistent ✅' : 'Ephemeral ⚠️'}`);
  lines.push(`Path: ${config._herokuConfig.path}`);
  lines.push(`Max Size: ${formatBytes(config.maxCacheSize)}`);
  lines.push(`Max Repos: ${config.maxRepositories}`);
  lines.push(`TTL: ${formatTime(config.cacheTTL)}`);

  if (config._herokuConfig.warning) {
    lines.push(`⚠️  Warning: ${config._herokuConfig.warning}`);
  }

  lines.push('');
  lines.push('Expected Performance:');
  if (config._herokuConfig.isPersistent) {
    lines.push('  • First request: 1-2 minutes (cache hit from persistent storage)');
    lines.push('  • Subsequent requests: 30-60 seconds');
    lines.push('  • Cache survives dyno restarts ✅');
  } else {
    lines.push('  • First request: 2-5 minutes (clone needed)');
    lines.push('  • Subsequent requests: 30-60 seconds');
    lines.push('  • Cache lost on dyno restart ❌');
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Setup recommendations for Heroku
 */
export function getHerokuSetupRecommendations(): string[] {
  const recommendations: string[] = [];

  const isProduction = process.env.NODE_ENV === 'production';
  const onHeroku = isHeroku();

  if (onHeroku && isProduction) {
    if (!process.env.PERSISTENT_CACHE_PATH && !process.env.AWS_S3_CACHE_BUCKET) {
      recommendations.push('Add persistent storage for better cache performance:');
      recommendations.push('  heroku addons:create heroku-postgresql:free');
      recommendations.push('  OR');
      recommendations.push('  heroku config:set PERSISTENT_CACHE_PATH=/mnt/heroku-file-store');
      recommendations.push('  OR');
      recommendations.push('  heroku config:set AWS_S3_CACHE_BUCKET=your-s3-bucket');
    }
  }

  if (onHeroku) {
    recommendations.push('Monitor cache performance:');
    recommendations.push('  heroku logs --tail --app ' + (process.env.HEROKU_APP_NAME || 'your-app'));
    recommendations.push('');
    recommendations.push('View cache statistics:');
    recommendations.push('  Use bot_github_cache_stats tool in agent');
  }

  return recommendations;
}

// ============================================================
// Heroku-specific utilities
// ============================================================

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format time duration
 */
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Get cache health status
 */
export function getCacheHealthStatus(cache: RepositoryFileSystemCache): {
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  details: Record<string, any>;
} {
  const stats = cache.getStats();
  const repos = stats.repositories.length;

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  let message = 'Cache operating normally';

  if (repos === 0) {
    status = 'warning';
    message = 'No repositories cached yet';
  }

  if (stats.memoryCache.totalSize === '0 B') {
    status = 'warning';
    message = 'Memory cache empty';
  }

  // Check if approaching limits
  const maxSize = parseInt(stats.memoryCache.maxSize);
  const currentSize = parseInt(stats.memoryCache.totalSize);
  if (currentSize > maxSize * 0.8) {
    status = 'critical';
    message = 'Cache approaching size limit';
  }

  return {
    status,
    message,
    details: {
      repositories: repos,
      memoryUsage: stats.memoryCache.totalSize,
      maxSize: stats.memoryCache.maxSize,
      entries: stats.memoryCache.entries,
    },
  };
}

// ============================================================
// Log recommendations on startup
// ============================================================

export function logCacheRecommendations() {
  const recommendations = getHerokuSetupRecommendations();
  if (recommendations.length > 0) {
    console.log('\n📋 Cache Setup Recommendations:\n');
    recommendations.forEach((rec) => console.log('  ' + rec));
    console.log('');
  }
}

export {};
