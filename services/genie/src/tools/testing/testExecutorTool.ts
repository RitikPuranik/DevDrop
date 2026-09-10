import { exec } from 'child_process'
import { promisify } from 'util'


const execAsync = promisify(exec)

/**
 * Test Executor Tool
 * Run Jest tests programmatically and return results
 */

export interface TestResult {
  success: boolean
  numPassedTests: number
  numFailedTests: number
  numTotalTests: number
  testResults: TestFileResult[]
  coverageData?: CoverageData
  duration: number
  errorMessage?: string
}

export interface TestFileResult {
  filePath: string
  passed: boolean
  tests: IndividualTestResult[]
}

export interface IndividualTestResult {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  errorMessage?: string
  stackTrace?: string
}

export interface CoverageData {
  lines: { total: number; covered: number; pct: number }
  statements: { total: number; covered: number; pct: number }
  functions: { total: number; covered: number; pct: number }
  branches: { total: number; covered: number; pct: number }
}

export interface TestExecutorOptions {
  testPath?: string
  coverage?: boolean
  watch?: boolean
  verbose?: boolean
  bail?: boolean
  timeout?: number
  maxWorkers?: number
}

/**
 * Execute Jest tests
 */
export async function runTests(
  options: TestExecutorOptions = {}
): Promise<TestResult> {
  const {
    testPath,
    coverage = false,
    watch = false,
    verbose = false,
    bail = false,
    timeout = 30000,
    maxWorkers,
  } = options

  const startTime = Date.now()

  try {
    // Build Jest command
    const args: string[] = ['jest']

    if (testPath) {
      args.push(testPath)
    }

    if (coverage) {
      args.push('--coverage')
      args.push('--coverageReporters=json')
      args.push('--coverageReporters=text')
    }

    if (watch) {
      args.push('--watch')
    }

    if (verbose) {
      args.push('--verbose')
    }

    if (bail) {
      args.push('--bail')
    }

    if (maxWorkers) {
      args.push(`--maxWorkers=${maxWorkers}`)
    }

    // Always output JSON for parsing
    args.push('--json')
    args.push('--testLocationInResults')

    const command = args.join(' ')

    // Execute Jest
    const { stdout, stderr: _stderr } = await execAsync(command, {
      timeout,
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    })

    // Parse Jest JSON output
    const result = parseJestOutput(stdout)

    return {
      ...result,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const duration = Date.now() - startTime

    if (error instanceof Error && 'stdout' in error) {
      // Jest failed but produced output
      const execError = error as Error & { stdout?: string; stderr?: string }
      try {
        const result = parseJestOutput(execError.stdout || '')
        return {
          ...result,
          success: false,
          duration,
          errorMessage: execError.stderr || error.message,
        }
      } catch {
        // Failed to parse output
      }
    }

    return {
      success: false,
      numPassedTests: 0,
      numFailedTests: 0,
      numTotalTests: 0,
      testResults: [],
      duration,
      errorMessage:
        error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Parse Jest JSON output
 */
function parseJestOutput(stdout: string): Omit<TestResult, 'duration'> {
  try {
    const data = JSON.parse(stdout)

    const testResults: TestFileResult[] = (data.testResults || []).map(
      (fileResult: any) => {
        const tests: IndividualTestResult[] = (
          fileResult.assertionResults || []
        ).map((assertion: any) => ({
          name: assertion.title || assertion.fullName,
          status: assertion.status,
          duration: assertion.duration || 0,
          errorMessage: assertion.failureMessages?.join('\n'),
          stackTrace: assertion.failureMessages?.join('\n'),
        }))

        return {
          filePath: fileResult.name,
          passed: fileResult.status === 'passed',
          tests,
        }
      }
    )

    const coverageData = data.coverageMap
      ? parseCoverageData(data.coverageMap)
      : undefined

    return {
      success: data.success || false,
      numPassedTests: data.numPassedTests || 0,
      numFailedTests: data.numFailedTests || 0,
      numTotalTests: data.numTotalTests || 0,
      testResults,
      coverageData,
    }
  } catch (error) {
    throw new Error('Failed to parse Jest output')
  }
}

/**
 * Parse coverage data from Jest coverage map
 */
function parseCoverageData(coverageMap: any): CoverageData {
  let totalLines = 0,
    coveredLines = 0
  let totalStatements = 0,
    coveredStatements = 0
  let totalFunctions = 0,
    coveredFunctions = 0
  let totalBranches = 0,
    coveredBranches = 0

  Object.values(coverageMap || {}).forEach((fileCoverage: any) => {
    const lines = fileCoverage.lines || {}
    totalLines += Object.keys(lines).length
    coveredLines += Object.values(lines).filter((c: any) => c > 0).length

    const statements = fileCoverage.statements || {}
    totalStatements += Object.keys(statements).length
    coveredStatements += Object.values(statements).filter(
      (c: any) => c > 0
    ).length

    const functions = fileCoverage.functions || {}
    totalFunctions += Object.keys(functions).length
    coveredFunctions += Object.values(functions).filter((c: any) => c > 0).length

    const branches = fileCoverage.branches || {}
    totalBranches += Object.keys(branches).length
    coveredBranches += Object.values(branches).filter((c: any) => c > 0).length
  })

  return {
    lines: {
      total: totalLines,
      covered: coveredLines,
      pct: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
    },
    statements: {
      total: totalStatements,
      covered: coveredStatements,
      pct:
        totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
    },
    functions: {
      total: totalFunctions,
      covered: coveredFunctions,
      pct:
        totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0,
    },
    branches: {
      total: totalBranches,
      covered: coveredBranches,
      pct: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0,
    },
  }
}

/**
 * Run a specific test file
 */
export async function runTestFile(
  filePath: string,
  options: Omit<TestExecutorOptions, 'testPath'> = {}
): Promise<TestResult> {
  return runTests({ ...options, testPath: filePath })
}

/**
 * Run tests and get coverage report
 */
export async function runTestsWithCoverage(
  testPath?: string
): Promise<TestResult> {
  return runTests({ testPath, coverage: true })
}

/**
 * Run tests in watch mode
 */
export async function watchTests(testPath?: string): Promise<void> {
  // Note: Watch mode doesn't return, it keeps running
  await runTests({ testPath, watch: true })
}

/**
 * Validate test coverage meets threshold
 */
export function validateCoverage(
  coverage: CoverageData,
  thresholds: {
    lines?: number
    statements?: number
    functions?: number
    branches?: number
  }
): {
  passed: boolean
  failures: string[]
} {
  const failures: string[] = []

  if (thresholds.lines && coverage.lines.pct < thresholds.lines) {
    failures.push(
      `Line coverage ${coverage.lines.pct.toFixed(2)}% is below threshold ${thresholds.lines}%`
    )
  }

  if (thresholds.statements && coverage.statements.pct < thresholds.statements) {
    failures.push(
      `Statement coverage ${coverage.statements.pct.toFixed(2)}% is below threshold ${thresholds.statements}%`
    )
  }

  if (thresholds.functions && coverage.functions.pct < thresholds.functions) {
    failures.push(
      `Function coverage ${coverage.functions.pct.toFixed(2)}% is below threshold ${thresholds.functions}%`
    )
  }

  if (thresholds.branches && coverage.branches.pct < thresholds.branches) {
    failures.push(
      `Branch coverage ${coverage.branches.pct.toFixed(2)}% is below threshold ${thresholds.branches}%`
    )
  }

  return {
    passed: failures.length === 0,
    failures,
  }
}

/**
 * Format test results for display
 */
export function formatTestResults(result: TestResult): string {
  let output = `\n${'='.repeat(50)}\n`
  output += `Test Results\n`
  output += `${'='.repeat(50)}\n\n`

  output += `Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}\n`
  output += `Duration: ${result.duration}ms\n`
  output += `Tests: ${result.numPassedTests} passed, ${result.numFailedTests} failed, ${result.numTotalTests} total\n\n`

  if (result.coverageData) {
    output += `Coverage:\n`
    output += `  Lines:      ${result.coverageData.lines.pct.toFixed(2)}% (${result.coverageData.lines.covered}/${result.coverageData.lines.total})\n`
    output += `  Statements: ${result.coverageData.statements.pct.toFixed(2)}% (${result.coverageData.statements.covered}/${result.coverageData.statements.total})\n`
    output += `  Functions:  ${result.coverageData.functions.pct.toFixed(2)}% (${result.coverageData.functions.covered}/${result.coverageData.functions.total})\n`
    output += `  Branches:   ${result.coverageData.branches.pct.toFixed(2)}% (${result.coverageData.branches.covered}/${result.coverageData.branches.total})\n\n`
  }

  if (result.errorMessage) {
    output += `Error: ${result.errorMessage}\n\n`
  }

  result.testResults.forEach(fileResult => {
    output += `\nFile: ${fileResult.filePath}\n`
    fileResult.tests.forEach(test => {
      const icon = test.status === 'passed' ? '✓' : '✗'
      output += `  ${icon} ${test.name} (${test.duration}ms)\n`
      if (test.errorMessage) {
        output += `    Error: ${test.errorMessage}\n`
      }
    })
  })

  return output
}
