import { parseCode, ParsedFunction, ParsedClass } from '../code/codeParseTool'

/**
 * Test Generation Tool
 * Generate Jest tests from function and class signatures
 */

export interface TestOptions {
  framework?: 'jest' | 'vitest'
  includeSetup?: boolean
  includeMocks?: boolean
  includeEdgeCases?: boolean
}

/**
 * Generate test for a function
 */
export function generateFunctionTest(
  func: ParsedFunction,
  options: TestOptions = {}
): string {
  const { framework: _framework = 'jest', includeSetup = true, includeEdgeCases = true } = options

  const { name, parameters, returnType, isAsync } = func

  let test = `describe('${name}', () => {\n`

  if (includeSetup) {
    test += `  beforeEach(() => {\n`
    test += `    // Setup before each test\n`
    test += `  })\n\n`

    test += `  afterEach(() => {\n`
    test += `    // Cleanup after each test\n`
    test += `  })\n\n`
  }

  // Basic test
  const awaitKeyword = isAsync ? 'await ' : ''
  const testParams = parameters.map(p => `/* ${p.name}: ${p.type} */`).join(', ')

  test += `  it('should be defined', () => {\n`
  test += `    expect(${name}).toBeDefined()\n`
  test += `  })\n\n`

  // Happy path test
  test += `  it('should return expected result with valid input', ${isAsync ? 'async ' : ''}() => {\n`
  test += `    const result = ${awaitKeyword}${name}(${testParams})\n`
  test += `    expect(result).toBeDefined()\n`
  test += generateSpecificAssertions(returnType, 'result')
  test += `  })\n\n`

  // Edge cases
  if (includeEdgeCases) {
    if (parameters.length > 0) {
      test += `  it('should handle null/undefined parameters', ${isAsync ? 'async ' : ''}() => {\n`
      test += generateNullUndefinedTests(name, parameters, isAsync)
      test += `  })\n\n`
    }

    if (returnType !== 'void' && !returnType.includes('never')) {
      test += `  it('should return correct type', ${isAsync ? 'async ' : ''}() => {\n`
      test += `    const result = ${awaitKeyword}${name}(${testParams})\n`
      test += `    expect(typeof result).toBe('${inferJSType(returnType)}')\n`
      test += `  })\n\n`
    }

    if (isAsync || returnType.includes('Promise')) {
      test += `  it('should handle errors gracefully', async () => {\n`
      test += generateErrorHandlingTests(name, parameters)
      test += `  })\n\n`
    }
  }

  test += `})\n`

  return test
}

/**
 * Generate test for a class
 */
export function generateClassTest(
  cls: ParsedClass,
  options: TestOptions = {}
): string {
  const { framework: _framework = 'jest', includeSetup = true, includeMocks: _includeMocks = true } = options

  const { name, methods, properties } = cls

  let test = `describe('${name}', () => {\n`
  test += `  let instance: ${name}\n\n`

  if (includeSetup) {
    test += `  beforeEach(() => {\n`
    const constructorParams = properties
      .map(p => `/* ${p.name}: ${p.type} */`)
      .join(', ')
    test += `    instance = new ${name}(${constructorParams})\n`
    test += `  })\n\n`

    test += `  afterEach(() => {\n`
    test += `    // Cleanup\n`
    test += `  })\n\n`
  }

  // Constructor test
  test += `  it('should create instance', () => {\n`
  test += `    expect(instance).toBeDefined()\n`
  test += `    expect(instance).toBeInstanceOf(${name})\n`
  test += `  })\n\n`

  // Property tests
  if (properties.length > 0) {
    test += `  describe('properties', () => {\n`
    properties.forEach(prop => {
      test += `    it('should have ${prop.name} property', () => {\n`
      test += `      expect(instance['${prop.name}']).toBeDefined()\n`
      test += `    })\n\n`
    })
    test += `  })\n\n`
  }

  // Method tests
  if (methods.length > 0) {
    test += `  describe('methods', () => {\n`
    methods.forEach(method => {
      const awaitKeyword = method.isAsync ? 'await ' : ''
      const testParams = method.parameters
        .map(p => `/* ${p.name}: ${p.type} */`)
        .join(', ')

      test += `    it('should have ${method.name} method', () => {\n`
      test += `      expect(instance.${method.name}).toBeDefined()\n`
      test += `      expect(typeof instance.${method.name}).toBe('function')\n`
      test += `    })\n\n`

      test += `    it('${method.name} should work correctly', ${method.isAsync ? 'async ' : ''}() => {\n`
      test += `      const result = ${awaitKeyword}instance.${method.name}(${testParams})\n`
      test += generateSpecificAssertions(method.returnType, 'result', '      ')
      test += `    })\n\n`
    })
    test += `  })\n\n`
  }

  test += `})\n`

  return test
}

/**
 * Generate tests from source code
 */
export async function generateTests(
  code: string,
  options: TestOptions = {},
  filePath: string = 'temp.ts'
): Promise<string> {
  const parseResult = await parseCode(code, filePath)

  let allTests = `/**\n * Generated tests\n */\n\n`

  // Generate function tests
  for (const func of parseResult.functions) {
    if (func.isExported) {
      const test = await generateFunctionTest(func, options)
      allTests += test + '\n\n'
    }
  }

  // Generate class tests
  for (const cls of parseResult.classes) {
    if (cls.isExported) {
      const test = await generateClassTest(cls, options)
      allTests += test + '\n\n'
    }
  }

  return allTests
}

/**
 * Generate test file with imports
 */
export async function generateTestFile(
  sourceFilePath: string,
  code: string,
  options: TestOptions = {}
): Promise<string> {
  const parseResult = await parseCode(code, sourceFilePath)

  // Generate imports
  const baseName = sourceFilePath.replace(/\.(ts|tsx|js|jsx)$/, '')
  let testFile = `import {\n`

  const exports = [
    ...parseResult.functions.filter(f => f.isExported).map(f => f.name),
    ...parseResult.classes.filter(c => c.isExported).map(c => c.name),
  ]

  testFile += exports.map(e => `  ${e}`).join(',\n')
  testFile += `\n} from './${baseName}'\n\n`

  // Generate tests
  const tests = await generateTests(code, options, sourceFilePath)
  testFile += tests

  return testFile
}

/**
 * Integration test configuration
 */
export interface IntegrationTestConfig {
  testName: string
  description?: string
  setupSteps?: string[]
  teardownSteps?: string[]
  workflows?: Array<{
    name: string
    steps: string[]
  }>
  errorScenarios?: Array<{
    name: string
    scenario: string
  }>
}

/**
 * Generate integration test template with detailed steps
 */
export function generateIntegrationTest(
  config: string | IntegrationTestConfig,
  description?: string
): string {
  // Support legacy signature (string, string)
  if (typeof config === 'string') {
    config = {
      testName: config,
      description,
      workflows: [
        {
          name: 'end-to-end workflow',
          steps: [
            'Initialize system components',
            'Execute primary operation',
            'Verify results',
            'Check side effects',
          ],
        },
      ],
      errorScenarios: [
        {
          name: 'invalid input handling',
          scenario: 'System should gracefully handle invalid inputs',
        },
        {
          name: 'service unavailability',
          scenario: 'System should handle service failures',
        },
      ],
    }
  }

  const { testName, setupSteps = [], teardownSteps = [], workflows = [], errorScenarios = [] } = config

  let test = `/**\n * ${config.description || `Integration test for ${testName}`}\n */\n\n`
  test += `describe('${testName} Integration', () => {\n`

  // Setup
  test += `  beforeAll(async () => {\n`
  if (setupSteps.length > 0) {
    setupSteps.forEach(step => {
      test += `    // ${step}\n`
    })
  } else {
    test += `    // Setup database connections\n`
    test += `    // Initialize required services\n`
    test += `    // Load test fixtures\n`
  }
  test += `  })\n\n`

  // Teardown
  test += `  afterAll(async () => {\n`
  if (teardownSteps.length > 0) {
    teardownSteps.forEach(step => {
      test += `    // ${step}\n`
    })
  } else {
    test += `    // Close database connections\n`
    test += `    // Cleanup test data\n`
    test += `    // Reset service states\n`
  }
  test += `  })\n\n`

  test += `  beforeEach(async () => {\n`
  test += `    // Reset state before each test\n`
  test += `  })\n\n`

  test += `  afterEach(async () => {\n`
  test += `    // Cleanup after each test\n`
  test += `  })\n\n`

  // Workflow tests
  if (workflows.length > 0) {
    workflows.forEach(workflow => {
      test += `  it('should complete ${workflow.name}', async () => {\n`
      workflow.steps.forEach((step, idx) => {
        test += `    // Step ${idx + 1}: ${step}\n`
      })
      test += `\n`
      test += `    // Verify final state\n`
      test += `    expect(true).toBe(true) // Replace with actual assertions\n`
      test += `  })\n\n`
    })
  }

  // Error scenario tests
  if (errorScenarios.length > 0) {
    errorScenarios.forEach(scenario => {
      test += `  it('should handle ${scenario.name}', async () => {\n`
      test += `    // ${scenario.scenario}\n`
      test += `    await expect(async () => {\n`
      test += `      // Execute operation that should fail\n`
      test += `    }).rejects.toThrow()\n`
      test += `  })\n\n`
    })
  }

  test += `})\n`
  return test
}

/**
 * Performance test configuration
 */
export interface PerformanceTestConfig {
  testName: string
  maxDurationMs?: number
  loadTestIterations?: number
  concurrentRequests?: number
  memoryThresholdMB?: number
}

/**
 * Generate performance test template with benchmarks
 */
export function generatePerformanceTest(
  config: string | PerformanceTestConfig,
  maxDurationMs: number = 1000
): string {
  // Support legacy signature (string, number)
  if (typeof config === 'string') {
    config = {
      testName: config,
      maxDurationMs,
      loadTestIterations: 100,
      concurrentRequests: 10,
      memoryThresholdMB: 100,
    }
  }

  const {
    testName,
    maxDurationMs: maxDuration = 1000,
    loadTestIterations = 100,
    concurrentRequests = 10,
    memoryThresholdMB = 100,
  } = config

  let test = `/**\n * Performance test for ${testName}\n */\n\n`
  test += `describe('${testName} Performance', () => {\n`

  // Single operation timing
  test += `  it('should complete within ${maxDuration}ms', async () => {\n`
  test += `    const startTime = Date.now()\n\n`
  test += `    // Execute operation\n`
  test += `    // await yourOperation()\n\n`
  test += `    const endTime = Date.now()\n`
  test += `    const duration = endTime - startTime\n\n`
  test += `    console.log(\`Operation completed in \${duration}ms\`)\n`
  test += `    expect(duration).toBeLessThan(${maxDuration})\n`
  test += `  })\n\n`

  // Load test
  test += `  it('should handle load (${loadTestIterations} iterations)', async () => {\n`
  test += `    const iterations = ${loadTestIterations}\n`
  test += `    const timings: number[] = []\n`
  test += `    const startTime = Date.now()\n\n`
  test += `    for (let i = 0; i < iterations; i++) {\n`
  test += `      const iterStart = Date.now()\n`
  test += `      // Execute operation\n`
  test += `      // await yourOperation()\n`
  test += `      timings.push(Date.now() - iterStart)\n`
  test += `    }\n\n`
  test += `    const endTime = Date.now()\n`
  test += `    const totalTime = endTime - startTime\n`
  test += `    const avgTime = totalTime / iterations\n`
  test += `    const minTime = Math.min(...timings)\n`
  test += `    const maxTime = Math.max(...timings)\n`
  test += `    const p95Time = timings.sort((a, b) => a - b)[Math.floor(iterations * 0.95)]\n\n`
  test += `    console.log(\`Performance metrics:\`)\n`
  test += `    console.log(\`  Total time: \${totalTime}ms\`)\n`
  test += `    console.log(\`  Average: \${avgTime.toFixed(2)}ms\`)\n`
  test += `    console.log(\`  Min: \${minTime}ms\`)\n`
  test += `    console.log(\`  Max: \${maxTime}ms\`)\n`
  test += `    console.log(\`  P95: \${p95Time}ms\`)\n\n`
  test += `    expect(avgTime).toBeLessThan(${maxDuration})\n`
  test += `    expect(p95Time).toBeLessThan(${maxDuration * 2})\n`
  test += `  })\n\n`

  // Concurrent load test
  test += `  it('should handle concurrent requests (${concurrentRequests} concurrent)', async () => {\n`
  test += `    const concurrent = ${concurrentRequests}\n`
  test += `    const startTime = Date.now()\n\n`
  test += `    const promises = Array.from({ length: concurrent }, async (_, i) => {\n`
  test += `      const iterStart = Date.now()\n`
  test += `      // Execute operation\n`
  test += `      // await yourOperation()\n`
  test += `      return Date.now() - iterStart\n`
  test += `    })\n\n`
  test += `    const timings = await Promise.all(promises)\n`
  test += `    const totalTime = Date.now() - startTime\n`
  test += `    const avgTime = timings.reduce((a, b) => a + b, 0) / concurrent\n\n`
  test += `    console.log(\`Concurrent execution:\`)\n`
  test += `    console.log(\`  Total wall time: \${totalTime}ms\`)\n`
  test += `    console.log(\`  Average request time: \${avgTime.toFixed(2)}ms\`)\n`
  test += `    console.log(\`  Throughput: \${(concurrent / (totalTime / 1000)).toFixed(2)} req/s\`)\n\n`
  test += `    expect(totalTime).toBeLessThan(${maxDuration * 3})\n`
  test += `  })\n\n`

  // Memory usage test
  test += `  it('should not exceed memory threshold (${memoryThresholdMB}MB)', async () => {\n`
  test += `    const iterations = 50\n`
  test += `    const memoryUsages: number[] = []\n\n`
  test += `    if (global.gc) {\n`
  test += `      global.gc() // Force garbage collection if available\n`
  test += `    }\n\n`
  test += `    const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024\n\n`
  test += `    for (let i = 0; i < iterations; i++) {\n`
  test += `      // Execute operation\n`
  test += `      // await yourOperation()\n`
  test += `      const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024\n`
  test += `      memoryUsages.push(currentMemory)\n`
  test += `    }\n\n`
  test += `    const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024\n`
  test += `    const memoryIncrease = finalMemory - initialMemory\n`
  test += `    const maxMemory = Math.max(...memoryUsages)\n\n`
  test += `    console.log(\`Memory usage:\`)\n`
  test += `    console.log(\`  Initial: \${initialMemory.toFixed(2)}MB\`)\n`
  test += `    console.log(\`  Final: \${finalMemory.toFixed(2)}MB\`)\n`
  test += `    console.log(\`  Increase: \${memoryIncrease.toFixed(2)}MB\`)\n`
  test += `    console.log(\`  Peak: \${maxMemory.toFixed(2)}MB\`)\n\n`
  test += `    expect(memoryIncrease).toBeLessThan(${memoryThresholdMB})\n`
  test += `  })\n`

  test += `})\n`
  return test
}

/**
 * Generate mock for a class or interface
 */
export async function generateMock(
  code: string,
  symbolName: string,
  filePath: string = 'temp.ts'
): Promise<string> {
  const parseResult = await parseCode(code, filePath)

  // Find class
  const cls = parseResult.classes.find(c => c.name === symbolName)
  if (cls) {
    let mock = `/**\n * Mock for ${symbolName}\n */\n`
    mock += `const mock${symbolName} = {\n`

    // Add methods
    cls.methods.forEach((method, idx) => {
      const asyncPrefix = method.isAsync ? 'async ' : ''
      const params = method.parameters.map(p => p.name).join(', ')

      mock += `  ${method.name}: jest.fn(${asyncPrefix}(${params}) => {\n`

      // Generate return based on type
      if (method.returnType && method.returnType !== 'void') {
        const mockReturn = generateMockValue(method.returnType)
        mock += `    return ${mockReturn}\n`
      }

      mock += `  })`
      if (idx < cls.methods.length - 1) mock += `,`
      mock += `\n`
    })

    mock += `} as jest.Mocked<${symbolName}>\n\n`

    // Add reset helper
    mock += `/**\n * Reset all mocks for ${symbolName}\n */\n`
    mock += `export function resetMock${symbolName}() {\n`
    cls.methods.forEach(method => {
      mock += `  mock${symbolName}.${method.name}.mockClear()\n`
    })
    mock += `}\n`

    return mock
  }

  // Find interface
  const iface = parseResult.interfaces.find(i => i.name === symbolName)
  if (iface) {
    let mock = `/**\n * Mock implementation of ${symbolName}\n */\n`
    mock += `const mock${symbolName}: ${symbolName} = {\n`

    iface.properties.forEach((prop, idx) => {
      const mockValue = generateMockValue(prop.type)
      mock += `  ${prop.name}: ${mockValue}`
      if (idx < iface.properties.length - 1) mock += `,`
      mock += `\n`
    })

    mock += `}\n`
    return mock
  }

  throw new Error(`Symbol '${symbolName}' not found`)
}

/**
 * Generate mock value based on TypeScript type
 */
function generateMockValue(type: string): string {
  // Remove optional/null modifiers
  const cleanType = type.replace(/\s*\|\s*null|\s*\|\s*undefined|\?/g, '').trim()

  // Primitives
  if (cleanType === 'string') return `'mock-string'`
  if (cleanType === 'number') return `42`
  if (cleanType === 'boolean') return `true`
  if (cleanType === 'Date') return `new Date()`

  // Arrays
  if (cleanType.endsWith('[]')) return `[]`
  if (cleanType.startsWith('Array<')) return `[]`

  // Promises
  if (cleanType.startsWith('Promise<')) {
    const innerType = cleanType.match(/Promise<(.+)>/)?.[1] || 'any'
    return `Promise.resolve(${generateMockValue(innerType)})`
  }

  // Objects
  if (cleanType.startsWith('{')) return `{}`

  // Specific known types
  if (cleanType === 'void') return `undefined`
  if (cleanType === 'any' || cleanType === 'unknown') return `{}`

  // Default for complex types
  return `{} as ${cleanType}`
}

/**
 * E2E test configuration
 */
export interface E2ETestConfig {
  testName: string
  description?: string
  baseUrl?: string
  userFlows?: Array<{
    name: string
    steps: Array<{
      action: string
      description: string
    }>
  }>
  teardown?: string[]
}

/**
 * Generate E2E test with Playwright/Puppeteer patterns
 */
export function generateE2ETest(config: E2ETestConfig): string {
  const { testName, description, baseUrl = 'http://localhost:3000', userFlows = [], teardown = [] } = config

  let test = `/**\n * ${description || `E2E test for ${testName}`}\n */\n\n`
  test += `import { test, expect } from '@playwright/test'\n\n`
  test += `describe('${testName} E2E', () => {\n`

  // Setup
  test += `  test.beforeEach(async ({ page }) => {\n`
  test += `    // Navigate to base URL\n`
  test += `    await page.goto('${baseUrl}')\n`
  test += `  })\n\n`

  // Teardown
  if (teardown.length > 0) {
    test += `  test.afterEach(async ({ page }) => {\n`
    teardown.forEach(step => {
      test += `    // ${step}\n`
    })
    test += `  })\n\n`
  }

  // User flow tests
  if (userFlows.length > 0) {
    userFlows.forEach(flow => {
      test += `  test('${flow.name}', async ({ page }) => {\n`

      flow.steps.forEach((step, idx) => {
        test += `    // Step ${idx + 1}: ${step.description}\n`
        test += `    // ${step.action}\n`
      })

      test += `\n    // Verify final state\n`
      test += `    // await expect(page.locator('...')).toBeVisible()\n`
      test += `  })\n\n`
    })
  } else {
    // Default flow
    test += `  test('user can complete primary workflow', async ({ page }) => {\n`
    test += `    // Step 1: User performs initial action\n`
    test += `    // await page.click('button')\n\n`
    test += `    // Step 2: System responds\n`
    test += `    // await expect(page.locator('.result')).toBeVisible()\n\n`
    test += `    // Step 3: User completes workflow\n`
    test += `    // await page.click('.submit')\n\n`
    test += `    // Verify success\n`
    test += `    // await expect(page.locator('.success')).toBeVisible()\n`
    test += `  })\n\n`
  }

  test += `})\n`
  return test
}

/**
 * Generate snapshot test
 */
export function generateSnapshotTest(
  componentName: string,
  props?: Record<string, any>
): string {
  const propsStr = props
    ? Object.entries(props).map(([key, val]) => `${key}={${JSON.stringify(val)}}`).join(' ')
    : ''

  return `/**
 * Snapshot test for ${componentName}
 */

import { render } from '@testing-library/react'
import { ${componentName} } from './${componentName}'

describe('${componentName} Snapshot', () => {
  it('should match snapshot with default props', () => {
    const { container } = render(<${componentName} ${propsStr} />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('should match snapshot with different states', () => {
    // Test loading state
    const { container: loadingContainer } = render(
      <${componentName} loading={true} />
    )
    expect(loadingContainer.firstChild).toMatchSnapshot()

    // Test error state
    const { container: errorContainer } = render(
      <${componentName} error="Test error" />
    )
    expect(errorContainer.firstChild).toMatchSnapshot()
  })
})
`
}

/**
 * Generate test suite with multiple test types
 */
export interface TestSuiteConfig {
  moduleName: string
  includeUnit?: boolean
  includeIntegration?: boolean
  includeE2E?: boolean
  includePerformance?: boolean
  includeSnapshot?: boolean
}

/**
 * Generate comprehensive test suite
 */
export async function generateTestSuite(
  code: string,
  config: TestSuiteConfig,
  filePath: string = 'temp.ts'
): Promise<Map<string, string>> {
  const tests = new Map<string, string>()
  const { moduleName, includeUnit = true, includeIntegration = false, includeE2E = false, includePerformance = false } = config

  // Unit tests
  if (includeUnit) {
    const unitTests = await generateTests(code, {}, filePath)
    tests.set(`${moduleName}.test.ts`, unitTests)
  }

  // Integration tests
  if (includeIntegration) {
    const integrationTest = generateIntegrationTest({
      testName: moduleName,
      description: `Integration tests for ${moduleName}`,
    })
    tests.set(`${moduleName}.integration.test.ts`, integrationTest)
  }

  // E2E tests
  if (includeE2E) {
    const e2eTest = generateE2ETest({
      testName: moduleName,
      description: `E2E tests for ${moduleName}`,
    })
    tests.set(`${moduleName}.e2e.test.ts`, e2eTest)
  }

  // Performance tests
  if (includePerformance) {
    const perfTest = generatePerformanceTest({
      testName: moduleName,
    })
    tests.set(`${moduleName}.perf.test.ts`, perfTest)
  }

  return tests
}

/**
 * Infer JavaScript type from TypeScript type
 */
function inferJSType(tsType: string): string {
  if (tsType.includes('string')) return 'string'
  if (tsType.includes('number')) return 'number'
  if (tsType.includes('boolean')) return 'boolean'
  if (tsType.includes('[]') || tsType.includes('Array')) return 'object'
  if (tsType.includes('Promise')) return 'object'
  return 'object'
}

/**
 * Generate specific assertions based on return type
 */
function generateSpecificAssertions(returnType: string, variableName: string, indent: string = '    '): string {
  let assertions = ''
  
  if (returnType === 'void' || returnType.includes('undefined')) {
    assertions += `${indent}expect(${variableName}).toBeUndefined()\n`
  } else if (returnType.includes('string')) {
    assertions += `${indent}expect(typeof ${variableName}).toBe('string')\n`
    assertions += `${indent}expect(${variableName}).toHaveLength(expect.any(Number))\n`
  } else if (returnType.includes('number')) {
    assertions += `${indent}expect(typeof ${variableName}).toBe('number')\n`
    assertions += `${indent}expect(${variableName}).not.toBeNaN()\n`
  } else if (returnType.includes('boolean')) {
    assertions += `${indent}expect(typeof ${variableName}).toBe('boolean')\n`
  } else if (returnType.includes('[]') || returnType.includes('Array')) {
    assertions += `${indent}expect(Array.isArray(${variableName})).toBe(true)\n`
    assertions += `${indent}expect(${variableName}).toHaveLength(expect.any(Number))\n`
  } else if (returnType.includes('Promise')) {
    assertions += `${indent}expect(${variableName}).toBeInstanceOf(Promise)\n`
  } else if (returnType.includes('object') || returnType.includes('{')) {
    assertions += `${indent}expect(typeof ${variableName}).toBe('object')\n`
    assertions += `${indent}expect(${variableName}).not.toBeNull()\n`
  } else {
    // Default fallback
    assertions += `${indent}expect(${variableName}).toBeDefined()\n`
    assertions += `${indent}// Add more specific assertions based on expected behavior\n`
  }
  
  return assertions
}

/**
 * Generate null/undefined parameter tests
 */
function generateNullUndefinedTests(functionName: string, parameters: any[], isAsync: boolean): string {
  let tests = ''
  const awaitKeyword = isAsync ? 'await ' : ''
  
  tests += `    // Test with null parameters\n`
  tests += `    expect(() => {\n`
  tests += `      ${awaitKeyword}${functionName}(null as any)\n`
  tests += `    }).not.toThrow() // or .toThrow() if validation is expected\n\n`
  
  tests += `    // Test with undefined parameters\n`
  tests += `    expect(() => {\n`
  tests += `      ${awaitKeyword}${functionName}(undefined as any)\n`
  tests += `    }).not.toThrow() // or .toThrow() if validation is expected\n\n`
  
  // Test each parameter individually if there are multiple
  if (parameters.length > 1) {
    parameters.forEach((param, index) => {
      tests += `    // Test with ${param.name} as null\n`
      const nullParams = parameters.map((p, i) => 
        i === index ? 'null' : `/* ${p.name}: ${p.type} */`
      ).join(', ')
      tests += `    expect(() => {\n`
      tests += `      ${awaitKeyword}${functionName}(${nullParams})\n`
      tests += `    }).not.toThrow() // Adjust expectation based on validation requirements\n\n`
    })
  }
  
  return tests
}

/**
 * Generate error handling tests
 */
function generateErrorHandlingTests(functionName: string, parameters: any[]): string {
  let tests = ''
  
  tests += `    // Test with invalid parameters that should cause errors\n`
  const invalidParams = parameters.map(p => {
    if (p.type.includes('string')) return `"invalid"`
    if (p.type.includes('number')) return `-1`
    if (p.type.includes('boolean')) return `false`
    if (p.type.includes('[]') || p.type.includes('Array')) return `[]`
    return `null`
  }).join(', ')
  
  tests += `    await expect(${functionName}(${invalidParams})).rejects.toThrow()\n\n`
  
  tests += `    // Test with completely invalid input\n`
  tests += `    await expect(${functionName}(undefined as any)).rejects.toThrow()\n\n`
  
  tests += `    // Test network/async operation failures (if applicable)\n`
  tests += `    // Mock any dependencies to simulate failures\n`
  tests += `    // jest.spyOn(dependency, 'method').mockRejectedValue(new Error('Test error'))\n`
  tests += `    // await expect(${functionName}(validParams)).rejects.toThrow('Test error')\n`
  
  return tests
}

// Export the tool for ADK integration  
import { createTool } from '@iqai/adk'
import { z } from 'zod'

export const testGenTool = createTool({
  name: 'testGenTool',
  description: 'Generate Jest/Vitest tests from TypeScript/JavaScript code. Call this tool once for each test file you want to create. The code should be complete and ready to write to the specified file path.',
  schema: z.object({
    code: z.string().describe('The complete test code to write to the file'),
    filePath: z.string().describe('The file path where the test should be created (e.g., "test/unit/component.test.tsx", "vitest.config.ts")'),
    description: z.string().optional().describe('A brief description of what this test file contains')
  }),
  fn: async (args) => {
    // Return structured data that can be used to create files
    return {
      filePath: args.filePath,
      content: args.code,
      description: args.description || `Test file: ${args.filePath}`,
      type: 'test'
    }
  }
})
