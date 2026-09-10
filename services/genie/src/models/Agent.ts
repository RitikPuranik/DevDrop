import { z } from 'zod'

/**
 * Agent Model
 * Represents AI agents with different capabilities and tools
 */

// Agent types enum
export enum AgentType {
  CODE_GENERATOR = 'code-generator',
  BUG_HUNTER = 'bug-hunter',
  SECURITY_SENTINEL = 'security-sentinel',
  PERFORMANCE_PROFILER = 'performance-profiler',
  TEST_GENERATOR = 'test-generator',
  REFACTORING_EXPERT = 'refactoring-expert',
  ORCHESTRATOR = 'orchestrator',
}

// Tool schema
export const ToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.any()),
  enabled: z.boolean().default(true),
})

export type Tool = z.infer<typeof ToolSchema>

// Agent capability schema
export const AgentCapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  enabled: z.boolean().default(true),
  confidence: z.number().min(0).max(1).optional(),
})

export type AgentCapability = z.infer<typeof AgentCapabilitySchema>

// Agent configuration schema
export const AgentConfigSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  timeout: z.number().positive().default(30000),
})

export type AgentConfig = z.infer<typeof AgentConfigSchema>

// Main Agent schema
export const AgentSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(AgentType),
  name: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  tools: z.array(ToolSchema),
  capabilities: z.array(AgentCapabilitySchema),
  config: AgentConfigSchema,
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Agent = z.infer<typeof AgentSchema>

// Factory function to create a new Agent
export function createAgent(data: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Agent {
  return AgentSchema.parse({
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

// Validation helper
export function validateAgent(data: unknown): Agent {
  return AgentSchema.parse(data)
}

// Update helper
export function updateAgent(
  existing: Agent,
  updates: Partial<Omit<Agent, 'id' | 'createdAt'>>
): Agent {
  return AgentSchema.parse({
    ...existing,
    ...updates,
    updatedAt: new Date(),
  })
}

// Helper to check if agent has a specific tool
export function hasAgentTool(agent: Agent, toolName: string): boolean {
  return agent.tools.some(tool => tool.name === toolName && tool.enabled)
}

// Helper to check if agent has a specific capability
export function hasAgentCapability(agent: Agent, capabilityName: string): boolean {
  return agent.capabilities.some(cap => cap.name === capabilityName && cap.enabled)
}
