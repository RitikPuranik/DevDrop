import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import type { Server } from 'http'

/**
 * Contract Test: POST /api/generate
 *
 * Purpose: Verify that the generate endpoint adheres to its contract specification.
 * These tests MUST FAIL initially (TDD approach).
 *
 * Contract: specs/001-genie-ai-multi-agent/contracts/generate.md
 */

describe('POST /api/generate - Contract Tests', () => {
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
    it('T017.1 - should return 200 with generated code', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'Create a simple TypeScript function to add two numbers',
          type: 'function',
          language: 'typescript',
          options: {
            generateTests: true,
            autoReview: true,
          },
        })
        .expect('Content-Type', /json/)
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        data: {
          outputId: expect.any(String),
          code: expect.any(String),
          language: 'typescript',
          validation: {
            syntaxValid: expect.any(Boolean),
            testsGenerated: expect.any(Boolean),
            testsPass: expect.any(Boolean),
            reviewScore: expect.any(Number),
          },
          confidence: {
            overall: expect.any(Number),
            breakdown: {
              correctness: expect.any(Number),
              completeness: expect.any(Number),
              efficiency: expect.any(Number),
              style: expect.any(Number),
            },
          },
          rationale: expect.any(String),
          metadata: {
            generationTime: expect.any(Number),
            tokensUsed: expect.any(Number),
            iteration: expect.any(Number),
            agentsInvolved: expect.any(Array),
          },
        },
      })

      // Verify outputId is a UUID
      expect(response.body.data.outputId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )

      // Verify code is non-empty
      expect(response.body.data.code.length).toBeGreaterThan(0)

      // Verify confidence is in range 0-1
      expect(response.body.data.confidence.overall).toBeGreaterThanOrEqual(0)
      expect(response.body.data.confidence.overall).toBeLessThanOrEqual(1)

      // Verify review score is in range 0-100
      expect(response.body.data.validation.reviewScore).toBeGreaterThanOrEqual(0)
      expect(response.body.data.validation.reviewScore).toBeLessThanOrEqual(100)
    })

    it('T017.2 - should generate tests when generateTests=true', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'Create a function to calculate factorial',
          type: 'function',
          options: { generateTests: true },
        })
        .expect(200)

      expect(response.body.data.tests).toBeDefined()
      expect(response.body.data.tests.length).toBeGreaterThan(0)
      expect(response.body.data.testFilePath).toBeDefined()
      expect(response.body.data.validation.testsGenerated).toBe(true)
    })

    it('T017.3 - should include review report when autoReview=true', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'Create a function to validate email',
          type: 'function',
          options: { autoReview: true },
        })
        .expect(200)

      expect(response.body.data.review).toBeDefined()
      expect(response.body.data.review).toMatchObject({
        findings: expect.any(Array),
        summary: expect.objectContaining({
          totalIssues: expect.any(Number),
        }),
      })
    })

    it('T017.4 - should handle context-aware generation with projectId', async () => {
      // First onboard a project (mocked in real test)
      const mockProjectId = '550e8400-e29b-41d4-a716-446655440000'

      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'Create a user authentication component',
          type: 'component',
          projectId: mockProjectId,
        })
        .expect(200)

      expect(response.body.data.code).toBeDefined()
      // Context-aware generation should include relevant imports
    })
  })

  describe('Validation Errors (400)', () => {
    it('T017.5 - should return 400 for missing prompt', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          type: 'function',
        })
        .expect(400)

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.stringContaining('prompt'),
        },
      })
    })

    it('T017.6 - should return 400 for prompt too long', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'x'.repeat(10001), // Exceeds 10000 char limit
          type: 'function',
        })
        .expect(400)

      expect(response.body.error.message).toMatch(/prompt.*length|too long/i)
    })

    it('T017.7 - should return 400 for invalid type', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'Create a function',
          type: 'invalid-type',
        })
        .expect(400)

      expect(response.body.error.message).toMatch(/type/i)
    })

    it('T017.8 - should return 400 for invalid projectId', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'Create a function',
          type: 'function',
          projectId: 'non-existent-id',
        })
        .expect(400)

      expect(response.body.error.message).toMatch(/projectId|not found/i)
    })

    it('T017.9 - should return 400 for iterationLimit out of range', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'Create a function',
          type: 'function',
          options: { iterationLimit: 15 }, // Exceeds limit of 10
        })
        .expect(400)

      expect(response.body.error.message).toMatch(/iterationLimit/i)
    })
  })

  describe('Response Schema Validation', () => {
    it('T017.10 - should include all required response fields', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'Create a simple utility function',
          type: 'function',
        })
        .expect(200)

      const { data } = response.body

      // Required top-level fields
      expect(data).toHaveProperty('outputId')
      expect(data).toHaveProperty('code')
      expect(data).toHaveProperty('language')
      expect(data).toHaveProperty('validation')
      expect(data).toHaveProperty('confidence')
      expect(data).toHaveProperty('rationale')
      expect(data).toHaveProperty('metadata')

      // Required validation fields
      expect(data.validation).toHaveProperty('syntaxValid')
      expect(data.validation).toHaveProperty('testsGenerated')
      expect(data.validation).toHaveProperty('testsPass')
      expect(data.validation).toHaveProperty('reviewScore')

      // Required confidence fields
      expect(data.confidence).toHaveProperty('overall')
      expect(data.confidence.breakdown).toHaveProperty('correctness')
      expect(data.confidence.breakdown).toHaveProperty('completeness')
      expect(data.confidence.breakdown).toHaveProperty('efficiency')
      expect(data.confidence.breakdown).toHaveProperty('style')

      // Required metadata fields
      expect(data.metadata).toHaveProperty('generationTime')
      expect(data.metadata).toHaveProperty('tokensUsed')
      expect(data.metadata).toHaveProperty('iteration')
      expect(data.metadata).toHaveProperty('agentsInvolved')
    })

    it('T017.11 - should return agentsInvolved as non-empty array', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'Create a function',
          type: 'function',
        })
        .expect(200)

      const agents = response.body.data.metadata.agentsInvolved
      expect(Array.isArray(agents)).toBe(true)
      expect(agents.length).toBeGreaterThan(0)
      expect(typeof agents[0]).toBe('string')
    })
  })

  describe('Streaming Mode', () => {
    it('T017.12 - should support streaming with proper headers', async () => {
      // Note: Streaming tests will be more comprehensive in integration tests
      // This just verifies the endpoint accepts streaming parameter
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'Create a function',
          type: 'function',
          options: { streaming: true },
        })

      // With streaming, we should get either:
      // - SSE response (text/event-stream)
      // - Or acknowledgment with WebSocket URL
      expect([200, 202]).toContain(response.status)
    })
  })
})
