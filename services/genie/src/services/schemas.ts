import {
  ProjectContextSchema,
  AgentSchema,
  GenerationRequestSchema,
  CodeOutputSchema,
  ReviewReportSchema,
  EnhancementProposalSchema,
  ToolIntegrationSchema,
  GenerationHistorySchema,
} from '../models'
import { z } from 'zod'

/**
 * Database Schemas
 * Defines validation schemas for database collections
 */

// Metadata schema
export const MetadataSchema = z.object({
  version: z.string(),
  createdAt: z.string(),
  lastBackup: z.string().optional(),
  lastMigration: z.string().optional(),
  migrationVersion: z.number().int().nonnegative().default(0),
})

export type Metadata = z.infer<typeof MetadataSchema>

// Complete database schema
export const DatabaseSchema = z.object({
  projects: z.array(ProjectContextSchema),
  agents: z.array(AgentSchema),
  requests: z.array(GenerationRequestSchema),
  outputs: z.array(CodeOutputSchema),
  reviews: z.array(ReviewReportSchema),
  enhancements: z.array(EnhancementProposalSchema),
  integrations: z.array(ToolIntegrationSchema),
  histories: z.array(GenerationHistorySchema),
  metadata: MetadataSchema,
})

export type Database = z.infer<typeof DatabaseSchema>

/**
 * Validate database structure
 */
export function validateDatabase(data: unknown): Database {
  return DatabaseSchema.parse(data)
}

/**
 * Validate partial database (for updates)
 */
export function validatePartialDatabase(data: unknown): Partial<Database> {
  return DatabaseSchema.partial().parse(data)
}

/**
 * Check if database structure is valid
 */
export function isDatabaseValid(data: unknown): boolean {
  try {
    validateDatabase(data)
    return true
  } catch {
    return false
  }
}

/**
 * Collection schemas map
 */
export const CollectionSchemas = {
  projects: z.array(ProjectContextSchema),
  agents: z.array(AgentSchema),
  requests: z.array(GenerationRequestSchema),
  outputs: z.array(CodeOutputSchema),
  reviews: z.array(ReviewReportSchema),
  enhancements: z.array(EnhancementProposalSchema),
  integrations: z.array(ToolIntegrationSchema),
  histories: z.array(GenerationHistorySchema),
} as const

export type CollectionName = keyof typeof CollectionSchemas

/**
 * Validate a specific collection
 */
export function validateCollection<T extends CollectionName>(
  collection: T,
  data: unknown
): z.infer<(typeof CollectionSchemas)[T]> {
  const schema = CollectionSchemas[collection]
  return schema.parse(data)
}

/**
 * Get empty database structure
 */
export function getEmptyDatabase(): Database {
  return {
    projects: [],
    agents: [],
    requests: [],
    outputs: [],
    reviews: [],
    enhancements: [],
    integrations: [],
    histories: [],
    metadata: {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      migrationVersion: 0,
    },
  }
}

/**
 * Database version
 */
export const CURRENT_DB_VERSION = '1.0.0'
export const CURRENT_MIGRATION_VERSION = 0
