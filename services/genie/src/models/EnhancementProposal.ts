import { z } from 'zod'

/**
 * EnhancementProposal Model
 * Represents code enhancement proposals with diffs and impact scores
 */

// Enhancement type enum
export enum EnhancementType {
  REFACTOR = 'refactor',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  MAINTAINABILITY = 'maintainability',
  MODERNIZE = 'modernize',
  SIMPLIFY = 'simplify',
}

// Diff chunk schema
export const DiffChunkSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  oldCode: z.string(),
  newCode: z.string(),
  context: z.string().optional(),
})

export type DiffChunk = z.infer<typeof DiffChunkSchema>

// Impact metrics schema
export const ImpactMetricsSchema = z.object({
  complexity: z.number(), // Change in cyclomatic complexity
  performance: z.number().min(0).max(100), // Estimated performance improvement %
  maintainability: z.number().min(0).max(100), // Maintainability score improvement
  readability: z.number().min(0).max(100), // Readability score improvement
  testCoverage: z.number().optional(), // Change in test coverage
  linesChanged: z.number().nonnegative(),
  estimatedEffort: z.string(), // e.g., "30min", "2h"
})

export type ImpactMetrics = z.infer<typeof ImpactMetricsSchema>

// Risk assessment schema
export const RiskAssessmentSchema = z.object({
  level: z.enum(['low', 'medium', 'high', 'critical']),
  factors: z.array(z.string()),
  mitigation: z.string().optional(),
  requiresReview: z.boolean().default(false),
  requiresTesting: z.boolean().default(true),
})

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>

// Enhancement proposal item schema
export const EnhancementProposalItemSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(EnhancementType),
  title: z.string(),
  description: z.string(),
  file: z.string(),
  diffs: z.array(DiffChunkSchema),
  impact: ImpactMetricsSchema,
  risk: RiskAssessmentSchema,
  rationale: z.string(),
  alternatives: z.array(z.string()).default([]),
  references: z.array(z.string()).default([]),
  priority: z.number().int().min(1).max(5).default(3),
  confidence: z.number().min(0).max(1),
  agentId: z.string().uuid().optional(),
})

export type EnhancementProposalItem = z.infer<typeof EnhancementProposalItemSchema>

// Main EnhancementProposal schema
export const EnhancementProposalSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  proposals: z.array(EnhancementProposalItemSchema),
  overallImpact: ImpactMetricsSchema,
  estimatedTimeToComplete: z.string(), // e.g., "2h 30min"
  priority: z.number().int().min(1).max(5).default(3),
  status: z.enum(['draft', 'proposed', 'accepted', 'rejected', 'applied']).default('draft'),
  agentIds: z.array(z.string().uuid()),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  appliedAt: z.date().optional(),
})

export type EnhancementProposal = z.infer<typeof EnhancementProposalSchema>

// Factory function to create a new EnhancementProposal
export function createEnhancementProposal(
  data: Omit<EnhancementProposal, 'id' | 'createdAt' | 'updatedAt'>
): EnhancementProposal {
  return EnhancementProposalSchema.parse({
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

// Validation helper
export function validateEnhancementProposal(data: unknown): EnhancementProposal {
  return EnhancementProposalSchema.parse(data)
}

// Update helper
export function updateEnhancementProposal(
  existing: EnhancementProposal,
  updates: Partial<Omit<EnhancementProposal, 'id' | 'createdAt'>>
): EnhancementProposal {
  return EnhancementProposalSchema.parse({
    ...existing,
    ...updates,
    updatedAt: new Date(),
  })
}

// Helper to add proposal item
export function addProposalItem(
  proposal: EnhancementProposal,
  item: EnhancementProposalItem
): EnhancementProposal {
  const proposals = [...proposal.proposals, item]
  return updateEnhancementProposal(proposal, {
    proposals,
    overallImpact: calculateOverallImpact(proposals),
  })
}

// Helper to calculate overall impact
export function calculateOverallImpact(proposals: EnhancementProposalItem[]): ImpactMetrics {
  if (proposals.length === 0) {
    return {
      complexity: 0,
      performance: 0,
      maintainability: 0,
      readability: 0,
      linesChanged: 0,
      estimatedEffort: '0min',
    }
  }

  const totalComplexity = proposals.reduce((sum, p) => sum + p.impact.complexity, 0)
  const avgPerformance =
    proposals.reduce((sum, p) => sum + p.impact.performance, 0) / proposals.length
  const avgMaintainability =
    proposals.reduce((sum, p) => sum + p.impact.maintainability, 0) / proposals.length
  const avgReadability =
    proposals.reduce((sum, p) => sum + p.impact.readability, 0) / proposals.length
  const totalLinesChanged = proposals.reduce((sum, p) => sum + p.impact.linesChanged, 0)

  // Sum estimated effort (simplified)
  const totalMinutes = proposals.reduce((sum, p) => {
    const match = p.impact.estimatedEffort.match(/(\d+)h|(\d+)min/g)
    if (!match) return sum
    let minutes = 0
    match.forEach(m => {
      if (m.includes('h')) minutes += parseInt(m) * 60
      else minutes += parseInt(m)
    })
    return sum + minutes
  }, 0)

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const estimatedEffort = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`

  return {
    complexity: totalComplexity,
    performance: Math.round(avgPerformance),
    maintainability: Math.round(avgMaintainability),
    readability: Math.round(avgReadability),
    linesChanged: totalLinesChanged,
    estimatedEffort,
  }
}

// Helper to filter by type
export function filterByType(
  proposal: EnhancementProposal,
  type: EnhancementType
): EnhancementProposalItem[] {
  return proposal.proposals.filter(p => p.type === type)
}

// Helper to get high priority items
export function getHighPriorityItems(proposal: EnhancementProposal): EnhancementProposalItem[] {
  return proposal.proposals.filter(p => p.priority >= 4)
}

// Helper to mark as applied
export function markAsApplied(proposal: EnhancementProposal): EnhancementProposal {
  return updateEnhancementProposal(proposal, {
    status: 'applied',
    appliedAt: new Date(),
  })
}
