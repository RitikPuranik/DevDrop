import { z } from 'zod'

/**
 * GenerationRequest Model
 * Represents a code generation request with validation
 */

// Generation type enum
export enum GenerationType {
  CODE = 'code',
  TEST = 'test',
  REFACTOR = 'refactor',
  FIX = 'fix',
  OPTIMIZE = 'optimize',
  DOCUMENT = 'document',
}

// Generation options schema
export const GenerationOptionsSchema = z.object({
  language: z.string().optional(),
  framework: z.string().optional(),
  style: z.enum(['functional', 'oop', 'mixed']).optional(),
  testFramework: z.string().optional(),
  includeComments: z.boolean().default(true),
  includeTypeHints: z.boolean().default(true),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  streaming: z.boolean().default(false),
})

export type GenerationOptions = z.infer<typeof GenerationOptionsSchema>

// Context file schema
export const ContextFileSchema = z.object({
  path: z.string(),
  content: z.string().optional(),
  relevance: z.number().min(0).max(1).optional(),
})

export type ContextFile = z.infer<typeof ContextFileSchema>

// Main GenerationRequest schema
export const GenerationRequestSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(GenerationType),
  prompt: z.string().min(1),
  projectId: z.string().uuid(),
  contextFiles: z.array(ContextFileSchema).default([]),
  options: GenerationOptionsSchema.optional(),
  targetFile: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  userId: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type GenerationRequest = z.infer<typeof GenerationRequestSchema>

// Factory function to create a new GenerationRequest
export function createGenerationRequest(
  data: Omit<GenerationRequest, 'id' | 'createdAt' | 'updatedAt'>
): GenerationRequest {
  return GenerationRequestSchema.parse({
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

// Validation helper
export function validateGenerationRequest(data: unknown): GenerationRequest {
  return GenerationRequestSchema.parse(data)
}

// Update helper
export function updateGenerationRequest(
  existing: GenerationRequest,
  updates: Partial<Omit<GenerationRequest, 'id' | 'createdAt'>>
): GenerationRequest {
  return GenerationRequestSchema.parse({
    ...existing,
    ...updates,
    updatedAt: new Date(),
  })
}

// Helper to validate prompt length
export function isValidPromptLength(prompt: string): boolean {
  return prompt.length >= 10 && prompt.length <= 10000
}

// Helper to add context files
export function addContextFile(request: GenerationRequest, file: ContextFile): GenerationRequest {
  return updateGenerationRequest(request, {
    contextFiles: [...request.contextFiles, file],
  })
}

// Helper to get relevant context files (sorted by relevance)
export function getRelevantContextFiles(
  request: GenerationRequest,
  minRelevance = 0.5
): ContextFile[] {
  return request.contextFiles
    .filter(file => (file.relevance ?? 1) >= minRelevance)
    .sort((a, b) => (b.relevance ?? 1) - (a.relevance ?? 1))
}
