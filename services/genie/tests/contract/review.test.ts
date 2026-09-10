import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import type { Server } from 'http'

/**
 * Contract Test: POST /api/review
 *
 * Purpose: Verify that the review endpoint adheres to its contract specification.
 * These tests MUST FAIL initially (TDD approach).
 *
 * Contract: specs/001-genie-ai-multi-agent/contracts/review.md
 */

describe('POST /api/review - Contract Tests', () => {
  let server: Server | undefined
  let app: any

  beforeAll(async () => {
    // TODO: Import and initialize Express app
    // const { createApp } = await import('../../src/api/server')
    // app = createApp()
    // server = app.listen(0)
    throw new Error('App not implemented yet - this is expected (TDD)')
  })

  afterAll(async () => {
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  describe('Success Cases', () => {
    it('T018.1 - should return 200 with review findings', async () => {
      const codeToReview = `
function add(a, b) {
  return a + b
}
      `.trim()

      const response = await request(app)
        .post('/api/review')
        .send({
          code: codeToReview,
          language: 'javascript',
          options: {
            includeSecurityCheck: true,
            includePerformanceCheck: true,
          },
        })
        .expect('Content-Type', /json/)
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        data: {
          reportId: expect.any(String),
          findings: expect.any(Array),
          summary: {
            totalIssues: expect.any(Number),
            critical: expect.any(Number),
            high: expect.any(Number),
            medium: expect.any(Number),
            low: expect.any(Number),
            info: expect.any(Number),
          },
          metrics: {
            complexity: expect.any(Number),
            maintainability: expect.any(Number),
            testCoverage: expect.any(Number),
          },
          overallScore: expect.any(Number),
          metadata: {
            reviewTime: expect.any(Number),
            agentsInvolved: expect.any(Array),
            timestamp: expect.any(String),
          },
        },
      })

      // Verify reportId is a UUID
      expect(response.body.data.reportId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )

      // Verify overall score is in range 0-100
      expect(response.body.data.overallScore).toBeGreaterThanOrEqual(0)
      expect(response.body.data.overallScore).toBeLessThanOrEqual(100)
    })

    it('T018.2 - should return findings with required properties', async () => {
      const response = await request(app)
        .post('/api/review')
        .send({
          code: 'const x = 1; eval(x);', // Security issue
          language: 'javascript',
        })
        .expect(200)

      const findings = response.body.data.findings
      expect(findings.length).toBeGreaterThan(0)

      findings.forEach((finding: any) => {
        expect(finding).toHaveProperty('id')
        expect(finding).toHaveProperty('type')
        expect(finding).toHaveProperty('severity')
        expect(finding).toHaveProperty('message')
        expect(finding).toHaveProperty('line')
        expect(finding).toHaveProperty('suggestion')
        expect(['critical', 'high', 'medium', 'low', 'info']).toContain(finding.severity)
      })
    })

    it('T018.3 - should handle file path for context-aware review', async () => {
      const response = await request(app)
        .post('/api/review')
        .send({
          code: 'function test() { return 42; }',
          filePath: 'src/utils/test.ts',
          language: 'typescript',
          projectId: '550e8400-e29b-41d4-a716-446655440000', // Mock
        })
        .expect(200)

      expect(response.body.data.findings).toBeDefined()
    })

    it('T018.4 - should include security findings when enabled', async () => {
      const unsafeCode = `
const userInput = req.body.data;
eval(userInput); // Dangerous!
      `.trim()

      const response = await request(app)
        .post('/api/review')
        .send({
          code: unsafeCode,
          language: 'javascript',
          options: { includeSecurityCheck: true },
        })
        .expect(200)

      const securityFindings = response.body.data.findings.filter((f: any) => f.type === 'security')
      expect(securityFindings.length).toBeGreaterThan(0)
    })

    it('T018.5 - should include performance findings when enabled', async () => {
      const inefficientCode = `
for (let i = 0; i < array.length; i++) {
  for (let j = 0; j < array.length; j++) {
    // O(n²) complexity
  }
}
      `.trim()

      const response = await request(app)
        .post('/api/review')
        .send({
          code: inefficientCode,
          language: 'javascript',
          options: { includePerformanceCheck: true },
        })
        .expect(200)

      const performanceFindings = response.body.data.findings.filter(
        (f: any) => f.type === 'performance'
      )
      // May or may not find issues, but should not error (verify no crash)
      expect(Array.isArray(performanceFindings)).toBe(true)
      expect(response.body.data.metrics.complexity).toBeDefined()
    })
  })

  describe('Validation Errors (400)', () => {
    it('T018.6 - should return 400 for missing code', async () => {
      const response = await request(app)
        .post('/api/review')
        .send({
          language: 'javascript',
        })
        .expect(400)

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.stringContaining('code'),
        },
      })
    })

    it('T018.7 - should return 400 for code too long', async () => {
      const response = await request(app)
        .post('/api/review')
        .send({
          code: 'x'.repeat(1000001), // Exceeds 1MB limit
          language: 'javascript',
        })
        .expect(400)

      expect(response.body.error.message).toMatch(/code.*length|too large/i)
    })

    it('T018.8 - should return 400 for unsupported language', async () => {
      const response = await request(app)
        .post('/api/review')
        .send({
          code: 'print("hello")',
          language: 'brainfuck',
        })
        .expect(400)

      expect(response.body.error.message).toMatch(/language.*not supported/i)
    })

    it('T018.9 - should return 400 for invalid projectId', async () => {
      const response = await request(app)
        .post('/api/review')
        .send({
          code: 'const x = 1;',
          language: 'javascript',
          projectId: 'invalid-uuid',
        })
        .expect(400)

      expect(response.body.error.message).toMatch(/projectId/i)
    })
  })

  describe('Response Schema Validation', () => {
    it('T018.10 - should include all required response fields', async () => {
      const response = await request(app)
        .post('/api/review')
        .send({
          code: 'function test() {}',
          language: 'javascript',
        })
        .expect(200)

      const { data } = response.body

      // Required top-level fields
      expect(data).toHaveProperty('reportId')
      expect(data).toHaveProperty('findings')
      expect(data).toHaveProperty('summary')
      expect(data).toHaveProperty('metrics')
      expect(data).toHaveProperty('overallScore')
      expect(data).toHaveProperty('metadata')

      // Required summary fields
      expect(data.summary).toHaveProperty('totalIssues')
      expect(data.summary).toHaveProperty('critical')
      expect(data.summary).toHaveProperty('high')
      expect(data.summary).toHaveProperty('medium')
      expect(data.summary).toHaveProperty('low')
      expect(data.summary).toHaveProperty('info')

      // Required metrics fields
      expect(data.metrics).toHaveProperty('complexity')
      expect(data.metrics).toHaveProperty('maintainability')
      expect(data.metrics).toHaveProperty('testCoverage')

      // Required metadata fields
      expect(data.metadata).toHaveProperty('reviewTime')
      expect(data.metadata).toHaveProperty('agentsInvolved')
      expect(data.metadata).toHaveProperty('timestamp')
    })

    it('T018.11 - should return valid severity counts', async () => {
      const response = await request(app)
        .post('/api/review')
        .send({
          code: 'const x = 1;',
          language: 'javascript',
        })
        .expect(200)

      const { summary } = response.body.data
      const total = summary.critical + summary.high + summary.medium + summary.low + summary.info

      expect(total).toBe(summary.totalIssues)
      expect(summary.totalIssues).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Multi-Agent Analysis', () => {
    it('T018.12 - should invoke multiple specialized agents', async () => {
      const response = await request(app)
        .post('/api/review')
        .send({
          code: 'function complex() { /* ... */ }',
          language: 'javascript',
          options: {
            includeSecurityCheck: true,
            includePerformanceCheck: true,
          },
        })
        .expect(200)

      const agents = response.body.data.metadata.agentsInvolved
      expect(agents.length).toBeGreaterThan(1) // Should involve multiple agents

      // Should include specialized agents
      const expectedAgents = ['BugHunter', 'SecuritySentinel', 'PerformanceProfiler']
      const hasSpecializedAgent = expectedAgents.some(agent =>
        agents.some((a: string) => a.includes(agent))
      )
      expect(hasSpecializedAgent).toBe(true)
    })
  })
})
