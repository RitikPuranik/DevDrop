import { z } from 'zod'

/**
 * ProjectContext Model
 * Represents the complete context of a codebase project
 */

// File metadata schema
export const FileMetadataSchema = z.object({
  path: z.string(),
  language: z.string(),
  size: z.number(),
  lastModified: z.date(),
  hash: z.string().optional(),
})

export type FileMetadata = z.infer<typeof FileMetadataSchema>

// Embeddings metadata schema
export const EmbeddingsMetadataSchema = z.object({
  totalChunks: z.number(),
  avgChunkSize: z.number(),
  model: z.string(),
  dimensions: z.number(),
  createdAt: z.date(),
  lastUpdated: z.date(),
})

export type EmbeddingsMetadata = z.infer<typeof EmbeddingsMetadataSchema>

// Project statistics schema
export const ProjectStatisticsSchema = z.object({
  totalFiles: z.number(),
  totalLines: z.number(),
  totalBytes: z.number(),
  filesByLanguage: z.record(z.string(), z.number()),
  lastScanned: z.date(),
})

export type ProjectStatistics = z.infer<typeof ProjectStatisticsSchema>

// Main ProjectContext schema
export const ProjectContextSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  rootPath: z.string(),
  description: z.string().optional(),
  files: z.array(FileMetadataSchema),
  embeddings: EmbeddingsMetadataSchema.optional(),
  statistics: ProjectStatisticsSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  metadata: z.record(z.string(), z.any()).optional(),
})

export type ProjectContext = z.infer<typeof ProjectContextSchema>

// Factory function to create a new ProjectContext
export function createProjectContext(
  data: Omit<ProjectContext, 'id' | 'createdAt' | 'updatedAt'>
): ProjectContext {
  return ProjectContextSchema.parse({
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

// Validation helper
export function validateProjectContext(data: unknown): ProjectContext {
  return ProjectContextSchema.parse(data)
}

// Partial update helper
export function updateProjectContext(
  existing: ProjectContext,
  updates: Partial<Omit<ProjectContext, 'id' | 'createdAt'>>
): ProjectContext {
  return ProjectContextSchema.parse({
    ...existing,
    ...updates,
    updatedAt: new Date(),
  })
}
