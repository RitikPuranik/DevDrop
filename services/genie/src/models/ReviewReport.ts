import { z } from 'zod'

/**
 * ReviewReport Model
 * Represents code review findings with severity levels and metrics
 */

// Severity level enum
export enum SeverityLevel {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

// Finding category enum
export enum FindingCategory {
  BUG = 'bug',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  STYLE = 'style',
  MAINTAINABILITY = 'maintainability',
  BEST_PRACTICE = 'best-practice',
  DOCUMENTATION = 'documentation',
}

// Code location schema
export const CodeLocationSchema = z.object({
  file: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  startColumn: z.number().int().nonnegative().optional(),
  endColumn: z.number().int().nonnegative().optional(),
  snippet: z.string().optional(),
})

export type CodeLocation = z.infer<typeof CodeLocationSchema>

// Review finding schema
export const ReviewFindingSchema = z.object({
  id: z.string().uuid(),
  category: z.nativeEnum(FindingCategory),
  severity: z.nativeEnum(SeverityLevel),
  title: z.string(),
  description: z.string(),
  location: CodeLocationSchema,
  suggestion: z.string().optional(),
  fixCode: z.string().optional(),
  references: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  agentId: z.string().uuid().optional(),
})

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>

// Code metrics schema
export const CodeMetricsSchema = z.object({
  complexity: z.number().nonnegative(),
  maintainability: z.number().min(0).max(100),
  testCoverage: z.number().min(0).max(100).optional(),
  duplicatedLines: z.number().nonnegative(),
  codeSmells: z.number().nonnegative(),
  technicalDebt: z.string().optional(), // e.g., "2h 30min"
  linesOfCode: z.number().nonnegative(),
})

export type CodeMetrics = z.infer<typeof CodeMetricsSchema>

// Review summary schema
export const ReviewSummarySchema = z.object({
  totalFindings: z.number().nonnegative(),
  criticalCount: z.number().nonnegative(),
  highCount: z.number().nonnegative(),
  mediumCount: z.number().nonnegative(),
  lowCount: z.number().nonnegative(),
  infoCount: z.number().nonnegative(),
  overallScore: z.number().min(0).max(100),
  recommendation: z.enum(['approve', 'needs-work', 'reject']),
})

export type ReviewSummary = z.infer<typeof ReviewSummarySchema>

// Main ReviewReport schema
export const ReviewReportSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  targetFile: z.string().optional(),
  findings: z.array(ReviewFindingSchema),
  metrics: CodeMetricsSchema,
  summary: ReviewSummarySchema,
  agentIds: z.array(z.string().uuid()),
  reviewTime: z.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type ReviewReport = z.infer<typeof ReviewReportSchema>

// Factory function to create a new ReviewReport
export function createReviewReport(
  data: Omit<ReviewReport, 'id' | 'createdAt' | 'updatedAt'>
): ReviewReport {
  return ReviewReportSchema.parse({
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

// Validation helper
export function validateReviewReport(data: unknown): ReviewReport {
  return ReviewReportSchema.parse(data)
}

// Update helper
export function updateReviewReport(
  existing: ReviewReport,
  updates: Partial<Omit<ReviewReport, 'id' | 'createdAt'>>
): ReviewReport {
  return ReviewReportSchema.parse({
    ...existing,
    ...updates,
    updatedAt: new Date(),
  })
}

// Helper to add finding
export function addFinding(report: ReviewReport, finding: ReviewFinding): ReviewReport {
  const findings = [...report.findings, finding]
  return updateReviewReport(report, {
    findings,
    summary: calculateSummary(findings, report.metrics),
  })
}

// Helper to calculate summary
export function calculateSummary(findings: ReviewFinding[], metrics: CodeMetrics): ReviewSummary {
  const criticalCount = findings.filter(f => f.severity === SeverityLevel.CRITICAL).length
  const highCount = findings.filter(f => f.severity === SeverityLevel.HIGH).length
  const mediumCount = findings.filter(f => f.severity === SeverityLevel.MEDIUM).length
  const lowCount = findings.filter(f => f.severity === SeverityLevel.LOW).length
  const infoCount = findings.filter(f => f.severity === SeverityLevel.INFO).length

  // Calculate overall score based on findings and metrics
  const findingsPenalty = criticalCount * 20 + highCount * 10 + mediumCount * 5
  const baseScore = Math.max(0, 100 - findingsPenalty)
  const overallScore = Math.round((baseScore + metrics.maintainability) / 2)

  // Determine recommendation
  let recommendation: 'approve' | 'needs-work' | 'reject'
  if (criticalCount > 0 || overallScore < 50) {
    recommendation = 'reject'
  } else if (highCount > 3 || overallScore < 70) {
    recommendation = 'needs-work'
  } else {
    recommendation = 'approve'
  }

  return {
    totalFindings: findings.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    infoCount,
    overallScore,
    recommendation,
  }
}

// Helper to filter findings by severity
export function filterBySeverity(report: ReviewReport, severity: SeverityLevel): ReviewFinding[] {
  return report.findings.filter(f => f.severity === severity)
}

// Helper to filter findings by category
export function filterByCategory(report: ReviewReport, category: FindingCategory): ReviewFinding[] {
  return report.findings.filter(f => f.category === category)
}

// Helper to get critical issues
export function getCriticalIssues(report: ReviewReport): ReviewFinding[] {
  return filterBySeverity(report, SeverityLevel.CRITICAL)
}
