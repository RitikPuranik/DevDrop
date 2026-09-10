/**
 * Repository Barrel Export
 * Provides centralized access to all Supabase repositories
 */

export { ProjectRepository } from './ProjectRepository';
export { GenerationHistoryRepository } from './GenerationHistoryRepository';
export { EmbeddingRepository } from './EmbeddingRepository';
export { UserSettingsRepository } from './UserSettingsRepository';

// Re-export types
export type { DatabaseProject } from './ProjectRepository';
export type { DatabaseHistoryEntry } from './GenerationHistoryRepository';
export type {
  DatabaseEmbedding,
  EmbeddingInput,
  EmbeddingWithSimilarity,
} from './EmbeddingRepository';
export type { UserSettings } from './UserSettingsRepository';
