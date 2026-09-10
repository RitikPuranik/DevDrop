import { z } from 'zod'

/**
 * ToolIntegration Model
 * Represents external tool integrations (GitHub, SonarQube, etc.)
 */

// Integration type enum
export enum IntegrationType {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  SONARQUBE = 'sonarqube',
  JIRA = 'jira',
  SLACK = 'slack',
  DISCORD = 'discord',
  WEBHOOK = 'webhook',
}

// Authentication type enum
export enum AuthType {
  TOKEN = 'token',
  OAUTH = 'oauth',
  API_KEY = 'api_key',
  BASIC = 'basic',
  NONE = 'none',
}

// Authentication config schema
export const AuthConfigSchema = z.object({
  type: z.nativeEnum(AuthType),
  token: z.string().optional(),
  apiKey: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.date().optional(),
})

export type AuthConfig = z.infer<typeof AuthConfigSchema>

// GitHub integration config schema
export const GitHubConfigSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  branch: z.string().default('main'),
  enablePRComments: z.boolean().default(true),
  enableIssueCreation: z.boolean().default(false),
  autoCommit: z.boolean().default(false),
})

export type GitHubConfig = z.infer<typeof GitHubConfigSchema>

// SonarQube integration config schema
export const SonarQubeConfigSchema = z.object({
  serverUrl: z.string().url(),
  projectKey: z.string(),
  organization: z.string().optional(),
  qualityGateStatus: z.boolean().default(true),
  enableAutoAnalysis: z.boolean().default(false),
})

export type SonarQubeConfig = z.infer<typeof SonarQubeConfigSchema>

// Webhook config schema
export const WebhookConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('POST'),
  headers: z.record(z.string(), z.string()).optional(),
  events: z.array(z.string()),
  secret: z.string().optional(),
})

export type WebhookConfig = z.infer<typeof WebhookConfigSchema>

// Integration-specific config
export const IntegrationSpecificConfigSchema = z.union([
  GitHubConfigSchema,
  SonarQubeConfigSchema,
  WebhookConfigSchema,
  z.record(z.string(), z.any()),
])

export type IntegrationSpecificConfig = z.infer<typeof IntegrationSpecificConfigSchema>

// Integration status schema
export const IntegrationStatusSchema = z.object({
  connected: z.boolean(),
  lastChecked: z.date(),
  lastError: z.string().optional(),
  requestCount: z.number().nonnegative().default(0),
  errorCount: z.number().nonnegative().default(0),
})

export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>

// Main ToolIntegration schema
export const ToolIntegrationSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(IntegrationType),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  auth: AuthConfigSchema,
  config: IntegrationSpecificConfigSchema,
  status: IntegrationStatusSchema,
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type ToolIntegration = z.infer<typeof ToolIntegrationSchema>

// Factory function to create a new ToolIntegration
export function createToolIntegration(
  data: Omit<ToolIntegration, 'id' | 'createdAt' | 'updatedAt'>
): ToolIntegration {
  return ToolIntegrationSchema.parse({
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

// Validation helper
export function validateToolIntegration(data: unknown): ToolIntegration {
  return ToolIntegrationSchema.parse(data)
}

// Update helper
export function updateToolIntegration(
  existing: ToolIntegration,
  updates: Partial<Omit<ToolIntegration, 'id' | 'createdAt'>>
): ToolIntegration {
  return ToolIntegrationSchema.parse({
    ...existing,
    ...updates,
    updatedAt: new Date(),
  })
}

// Helper to update status
export function updateIntegrationStatus(
  integration: ToolIntegration,
  status: Partial<IntegrationStatus>
): ToolIntegration {
  return updateToolIntegration(integration, {
    status: {
      ...integration.status,
      ...status,
      lastChecked: new Date(),
    },
  })
}

// Helper to check if integration is healthy
export function isIntegrationHealthy(integration: ToolIntegration): boolean {
  const errorRate =
    integration.status.requestCount > 0
      ? integration.status.errorCount / integration.status.requestCount
      : 0
  return integration.status.connected && errorRate < 0.1 // < 10% error rate
}

// Helper to increment request count
export function incrementRequestCount(
  integration: ToolIntegration,
  isError = false
): ToolIntegration {
  return updateIntegrationStatus(integration, {
    requestCount: integration.status.requestCount + 1,
    errorCount: isError ? integration.status.errorCount + 1 : integration.status.errorCount,
  })
}

// Helper to create GitHub integration
export function createGitHubIntegration(
  name: string,
  auth: AuthConfig,
  config: GitHubConfig
): ToolIntegration {
  return createToolIntegration({
    type: IntegrationType.GITHUB,
    name,
    auth,
    config,
    enabled: true,
    status: {
      connected: false,
      lastChecked: new Date(),
      requestCount: 0,
      errorCount: 0,
    },
  })
}

// Helper to create SonarQube integration
export function createSonarQubeIntegration(
  name: string,
  auth: AuthConfig,
  config: SonarQubeConfig
): ToolIntegration {
  return createToolIntegration({
    type: IntegrationType.SONARQUBE,
    name,
    auth,
    config,
    enabled: true,
    status: {
      connected: false,
      lastChecked: new Date(),
      requestCount: 0,
      errorCount: 0,
    },
  })
}
