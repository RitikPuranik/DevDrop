import { z } from 'zod'
import { GenerationType } from './GenerationRequest'

/**
 * CodeOutput Model
 * Represents generated code with validation results and metadata
 */

// Validation result schema
export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  lintScore: z.number().min(0).max(100).optional(),
  testCoverage: z.number().min(0).max(100).optional(),
})

export type ValidationResult = z.infer<typeof ValidationResultSchema>

// Code snippet schema
export const CodeSnippetSchema = z.object({
  language: z.string(),
  content: z.string(),
  filePath: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
})

export type CodeSnippet = z.infer<typeof CodeSnippetSchema>

// Test file schema
export const TestFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  framework: z.string(),
  testCount: z.number().int().nonnegative().default(0),
})

export type TestFile = z.infer<typeof TestFileSchema>

// Confidence score schema
export const ConfidenceScoreSchema = z.object({
  overall: z.number().min(0).max(1),
  syntax: z.number().min(0).max(1),
  semantics: z.number().min(0).max(1),
  style: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
})

export type ConfidenceScore = z.infer<typeof ConfidenceScoreSchema>

// Main CodeOutput schema
export const CodeOutputSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  type: z.nativeEnum(GenerationType),
  code: CodeSnippetSchema,
  tests: z.array(TestFileSchema).default([]),
  validation: ValidationResultSchema,
  confidence: ConfidenceScoreSchema,
  explanation: z.string().optional(),
  alternatives: z.array(CodeSnippetSchema).default([]),
  tokensUsed: z.number().int().nonnegative().optional(),
  generationTime: z.number().nonnegative().optional(),
  agentId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type CodeOutput = z.infer<typeof CodeOutputSchema>

// Factory function to create a new CodeOutput
export function createCodeOutput(
  data: Omit<CodeOutput, 'id' | 'createdAt' | 'updatedAt'>
): CodeOutput {
  return CodeOutputSchema.parse({
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

// Validation helper
export function validateCodeOutput(data: unknown): CodeOutput {
  return CodeOutputSchema.parse(data)
}

// Update helper
export function updateCodeOutput(
  existing: CodeOutput,
  updates: Partial<Omit<CodeOutput, 'id' | 'createdAt'>>
): CodeOutput {
  return CodeOutputSchema.parse({
    ...existing,
    ...updates,
    updatedAt: new Date(),
  })
}

// Helper to check if code is production-ready
export function isProductionReady(output: CodeOutput): boolean {
  return (
    output.validation.isValid &&
    output.confidence.overall >= 0.8 &&
    output.validation.errors.length === 0
  )
}

// Helper to get quality score
export function getQualityScore(output: CodeOutput): number {
  const validationScore = output.validation.isValid ? 1 : 0
  const confidenceScore = output.confidence.overall
  const errorPenalty = Math.max(0, 1 - output.validation.errors.length * 0.1)
  const warningPenalty = Math.max(0, 1 - output.validation.warnings.length * 0.05)

  return (validationScore + confidenceScore + errorPenalty + warningPenalty) / 4
}

// Helper to add test file
export function addTestFile(output: CodeOutput, test: TestFile): CodeOutput {
  return updateCodeOutput(output, {
    tests: [...output.tests, test],
  })
}

// Helper to add alternative solution
export function addAlternative(output: CodeOutput, alternative: CodeSnippet): CodeOutput {
  return updateCodeOutput(output, {
    alternatives: [...output.alternatives, alternative],
  })
}
