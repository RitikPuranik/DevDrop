import { z } from 'zod'
import { GenerationType } from './GenerationRequest'

/**
 * GenerationHistory Model
 * Tracks history of code generation requests and outputs
 */

// Generation status enum
export enum GenerationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// Feedback schema
export const FeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  helpful: z.boolean().optional(),
  usedCode: z.boolean().optional(),
  timestamp: z.date(),
})

export type Feedback = z.infer<typeof FeedbackSchema>

// Generation metrics schema
export const GenerationMetricsSchema = z.object({
  tokensUsed: z.number().int().nonnegative(),
  tokensPrompt: z.number().int().nonnegative().optional(),
  tokensCompletion: z.number().int().nonnegative().optional(),
  duration: z.number().nonnegative(), // milliseconds
  cacheHit: z.boolean().default(false),
  retryCount: z.number().int().nonnegative().default(0),
})

export type GenerationMetrics = z.infer<typeof GenerationMetricsSchema>

// History entry schema
export const HistoryEntrySchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  outputId: z.string().uuid().optional(),
  type: z.nativeEnum(GenerationType),
  status: z.nativeEnum(GenerationStatus),
  prompt: z.string(),
  projectId: z.string().uuid(),
  targetFile: z.string().optional(),
  agentId: z.string().uuid().optional(),
  metrics: GenerationMetricsSchema.optional(),
  feedback: FeedbackSchema.optional(),
  error: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().optional(),
})

export type HistoryEntry = z.infer<typeof HistoryEntrySchema>

// Main GenerationHistory schema
export const GenerationHistorySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().optional(),
  entries: z.array(HistoryEntrySchema),
  totalGenerations: z.number().int().nonnegative().default(0),
  successfulGenerations: z.number().int().nonnegative().default(0),
  failedGenerations: z.number().int().nonnegative().default(0),
  totalTokensUsed: z.number().int().nonnegative().default(0),
  averageRating: z.number().min(0).max(5).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type GenerationHistory = z.infer<typeof GenerationHistorySchema>

// Factory function to create a new GenerationHistory
export function createGenerationHistory(
  data: Omit<GenerationHistory, 'id' | 'createdAt' | 'updatedAt'>
): GenerationHistory {
  return GenerationHistorySchema.parse({
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

// Validation helper
export function validateGenerationHistory(data: unknown): GenerationHistory {
  return GenerationHistorySchema.parse(data)
}

// Update helper
export function updateGenerationHistory(
  existing: GenerationHistory,
  updates: Partial<Omit<GenerationHistory, 'id' | 'createdAt'>>
): GenerationHistory {
  return GenerationHistorySchema.parse({
    ...existing,
    ...updates,
    updatedAt: new Date(),
  })
}

// Helper to add entry
export function addHistoryEntry(
  history: GenerationHistory,
  entry: HistoryEntry
): GenerationHistory {
  const entries = [...history.entries, entry]
  const stats = calculateStatistics(entries)

  return updateGenerationHistory(history, {
    entries,
    ...stats,
  })
}

// Helper to update entry
export function updateHistoryEntry(
  history: GenerationHistory,
  entryId: string,
  updates: Partial<Omit<HistoryEntry, 'id' | 'createdAt'>>
): GenerationHistory {
  const entries = history.entries.map(entry =>
    entry.id === entryId
      ? HistoryEntrySchema.parse({
          ...entry,
          ...updates,
          updatedAt: new Date(),
        })
      : entry
  )

  const stats = calculateStatistics(entries)

  return updateGenerationHistory(history, {
    entries,
    ...stats,
  })
}

// Helper to calculate statistics
function calculateStatistics(entries: HistoryEntry[]) {
  const totalGenerations = entries.length
  const successfulGenerations = entries.filter(e => e.status === GenerationStatus.COMPLETED).length
  const failedGenerations = entries.filter(e => e.status === GenerationStatus.FAILED).length
  const totalTokensUsed = entries.reduce((sum, e) => sum + (e.metrics?.tokensUsed ?? 0), 0)

  const ratingsWithFeedback = entries.filter(e => e.feedback?.rating).map(e => e.feedback!.rating)
  const averageRating =
    ratingsWithFeedback.length > 0
      ? ratingsWithFeedback.reduce((sum, r) => sum + r, 0) / ratingsWithFeedback.length
      : undefined

  return {
    totalGenerations,
    successfulGenerations,
    failedGenerations,
    totalTokensUsed,
    averageRating,
  }
}

// Helper to add feedback to entry
export function addFeedbackToEntry(
  history: GenerationHistory,
  entryId: string,
  feedback: Feedback
): GenerationHistory {
  return updateHistoryEntry(history, entryId, { feedback })
}

// Helper to get recent entries
export function getRecentEntries(history: GenerationHistory, limit = 10): HistoryEntry[] {
  return [...history.entries]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
}

// Helper to get entries by status
export function getEntriesByStatus(
  history: GenerationHistory,
  status: GenerationStatus
): HistoryEntry[] {
  return history.entries.filter(e => e.status === status)
}

// Helper to get entries by type
export function getEntriesByType(history: GenerationHistory, type: GenerationType): HistoryEntry[] {
  return history.entries.filter(e => e.type === type)
}

// Helper to get success rate
export function getSuccessRate(history: GenerationHistory): number {
  if (history.totalGenerations === 0) return 0
  return (history.successfulGenerations / history.totalGenerations) * 100
}

// Helper to get average duration
export function getAverageDuration(history: GenerationHistory): number {
  const entriesWithMetrics = history.entries.filter(e => e.metrics?.duration)
  if (entriesWithMetrics.length === 0) return 0

  const totalDuration = entriesWithMetrics.reduce((sum, e) => sum + (e.metrics!.duration ?? 0), 0)
  return totalDuration / entriesWithMetrics.length
}
