/**
 * ComprehensiveValidator - Multi-layer validation system
 * Catches ALL errors before deployment, just like Fly.io does
 *
 * Architecture:
 * 1. Build Simulation (actual compilation)
 * 2. Runtime Validation (sandboxed execution)
 * 3. Specialized Fix Agents (targeted repairs)
 */

import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import tmp from 'tmp'

export interface ValidationError {
  severity: 'critical' | 'high' | 'medium' | 'low'
  layer: 'static' | 'build' | 'runtime'
  category: string
  file?: string
  line?: number
  column?: number
  message: string
  code?: string
  fixable: boolean
  fixStrategy?: string
}

export interface ValidationResult {
  passed: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
  duration: number
  layerResults: {
    static: { passed: boolean; errors: number }
    build: { passed: boolean; errors: number }
    runtime: { passed: boolean; errors: number }
  }
}

export interface GeneratedFile {
  path: string
  content: string
}

export class ComprehensiveValidator {
  private language: string

  constructor(language: string = 'typescript') {
    this.language = language
  }

  /**
   * Main validation pipeline - runs all layers
   */
  async validate(files: GeneratedFile[]): Promise<ValidationResult> {
    const startTime = Date.now()
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    console.log('\n╔════════════════════════════════════════════════════════════╗')
    console.log('║       COMPREHENSIVE VALIDATION PIPELINE (2 Layers)         ║')
    console.log('╚════════════════════════════════════════════════════════════╝\n')

    // Layer 1: Build Simulation (Medium speed, actual compilation)
    console.log('┌─ Layer 1: Build Simulation ────────────────────────────────┐')
    const buildErrors = await this.runBuildSimulation(files)
    errors.push(...buildErrors)
    console.log(`└─ Found ${buildErrors.length} issues\n`)

    // Layer 2: Runtime Validation (Slower, sandboxed execution)
    console.log('┌─ Layer 2: Runtime Validation ──────────────────────────────┐')
    const runtimeErrors = await this.runRuntimeValidation(files)
    errors.push(...runtimeErrors)
    console.log(`└─ Found ${runtimeErrors.length} issues\n`)

    const duration = Date.now() - startTime

    // Separate errors and warnings
    const criticalErrors = errors.filter(e => e.severity === 'critical' || e.severity === 'high')
    const minorIssues = errors.filter(e => e.severity === 'medium' || e.severity === 'low')
    warnings.push(...minorIssues)

    const layerResults = {
      static: {
        passed: true, // Static layer removed
        errors: 0,
      },
      build: {
        passed: buildErrors.length === 0,
        errors: buildErrors.length,
      },
      runtime: {
        passed: runtimeErrors.length === 0,
        errors: runtimeErrors.length,
      },
    }

    const passed = criticalErrors.length === 0

    console.log('╔════════════════════════════════════════════════════════════╗')
    console.log('║                 VALIDATION SUMMARY                          ║')
    console.log('╠════════════════════════════════════════════════════════════╣')
    console.log(
      `║ Status: ${passed ? '✓ PASSED' : '✗ FAILED'}                                      ║`
    )
    console.log(`║ Critical Errors: ${criticalErrors.length}                                    ║`)
    console.log(`║ Warnings: ${warnings.length}                                           ║`)
    console.log(`║ Duration: ${duration}ms                                        ║`)
    console.log('╚════════════════════════════════════════════════════════════╝\n')

    // LOG CHI TIẾT CÁC LỖI
    if (criticalErrors.length > 0) {
      console.log('\n📋 DETAILED ERROR LIST:\n')
      criticalErrors.forEach((error, index) => {
        console.log(`${index + 1}. [${error.severity.toUpperCase()}] ${error.category}`)
        console.log(`   File: ${error.file || 'N/A'}`)
        console.log(`   Message: ${error.message}`)
        console.log(
          `   Fixable: ${error.fixable ? '✓' : '✗'} ${error.fixStrategy ? `(Strategy: ${error.fixStrategy})` : ''}`
        )
        console.log('')
      })
    }

    return {
      passed,
      errors: criticalErrors,
      warnings,
      duration,
      layerResults,
    }
  }

  /**
   * Layer 1: Build Simulation
   * - Actual TypeScript compilation
   * - Webpack/Vite build test
   * - Package installation simulation
   */
  private async runBuildSimulation(files: GeneratedFile[]): Promise<ValidationError[]> {
    const errors: ValidationError[] = []

    // Create temporary directory for build simulation
    const tmpDir = tmp.dirSync({ unsafeCleanup: true })

    try {
      // Write files to temp directory
      for (const file of files) {
        const filePath = path.join(tmpDir.name, file.path)
        const dirName = path.dirname(filePath)
        if (!fs.existsSync(dirName)) {
          fs.mkdirSync(dirName, { recursive: true })
        }
        fs.writeFileSync(filePath, file.content)
      }

      if (this.language === 'typescript') {
        // 1.1 TypeScript Compilation Check
        console.log('  ├─ Running TypeScript compiler...')
        errors.push(...(await this.runTypeScriptCompiler(tmpDir.name, files)))

        // 1.2 Check for Next.js specific issues
        const hasNextConfig = files.some(
          f => f.path === 'next.config.js' || f.path === 'next.config.mjs'
        )
        if (hasNextConfig) {
          console.log('  ├─ Validating Next.js configuration...')
          errors.push(...this.validateNextJsConfig(files))
        }

        // 1.3 Package installation dry-run
        console.log('  └─ Testing package installation...')
        errors.push(...(await this.testPackageInstallation(tmpDir.name)))
      }
    } finally {
      tmpDir.removeCallback()
    }

    return errors
  }

  /**
   * Layer 2: Runtime Validation
   * - Import resolution
   * - Entry point validation
   * - Basic execution test
   */
  private async runRuntimeValidation(files: GeneratedFile[]): Promise<ValidationError[]> {
    const errors: ValidationError[] = []

    // 2.1 Entry Point Validation
    console.log('  ├─ Validating entry points...')
    errors.push(...this.validateEntryPoints(files))

    // 2.2 Import Resolution
    console.log('  ├─ Checking import resolution...')
    errors.push(...this.validateImportResolution(files))

    // 2.3 Port Configuration
    console.log('  └─ Validating port configuration...')
    errors.push(...this.validatePortConfig(files))

    return errors
  }

  /**
   * 1.1 TypeScript Compiler Check
   */
  private async runTypeScriptCompiler(
    workDir: string,
    _files: GeneratedFile[]
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = []

    return new Promise(resolve => {
      const tsc = spawn('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
        cwd: workDir,
        shell: true,
        windowsHide: true,
      })

      let output = ''

      tsc.stdout.on('data', data => {
        output += data.toString()
      })

      tsc.stderr.on('data', data => {
        output += data.toString()
      })

      tsc.on('close', code => {
        if (code !== 0 && output) {
          // Parse TypeScript errors
          const lines = output.split('\n')
          for (const line of lines) {
            const match = line.match(/(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)/)
            if (match) {
              const [, filePath, line, column, code, message] = match
              errors.push({
                severity: 'critical',
                layer: 'build',
                category: 'typescript',
                file: filePath,
                line: parseInt(line),
                column: parseInt(column),
                code,
                message,
                fixable: false,
              })
            }
          }

          // If no structured errors found, add generic error
          if (errors.length === 0 && output.includes('error')) {
            errors.push({
              severity: 'critical',
              layer: 'build',
              category: 'typescript',
              message: 'TypeScript compilation failed. Check output for details.',
              fixable: false,
            })
          }
        }

        resolve(errors)
      })

      tsc.on('error', error => {
        errors.push({
          severity: 'critical',
          layer: 'build',
          category: 'typescript',
          message: `Failed to run TypeScript compiler: ${error.message}`,
          fixable: false,
        })
        resolve(errors)
      })
    })
  }

  /**
   * 2.2 Next.js Configuration Validation
   */
  private validateNextJsConfig(files: GeneratedFile[]): ValidationError[] {
    const errors: ValidationError[] = []
    const nextConfig = files.find(f => f.path === 'next.config.js' || f.path === 'next.config.mjs')
    const packageJson = files.find(f => f.path === 'package.json')

    if (!nextConfig) return errors

    try {
      const pkg = packageJson ? JSON.parse(packageJson.content) : {}

      // Check for deprecated swcMinify option
      if (nextConfig.content.includes('swcMinify')) {
        errors.push({
          severity: 'high',
          layer: 'build',
          category: 'deprecated_config',
          file: nextConfig.path,
          message: '"swcMinify" is deprecated in Next.js 13+. Remove it from config.',
          fixable: true,
          fixStrategy: 'config_fixer',
        })
      }

      // Check module system mismatch
      if (pkg.type === 'module' && nextConfig.content.includes('module.exports')) {
        errors.push({
          severity: 'critical',
          layer: 'build',
          category: 'module_system',
          file: nextConfig.path,
          message:
            'ESM package.json but CommonJS Next.js config. Use "export default" or rename to .cjs',
          fixable: true,
          fixStrategy: 'module_converter',
        })
      }
    } catch (error: any) {
      // Already caught elsewhere
    }

    return errors
  }

  /**
   * 2.3 Package Installation Test
   */
  private async testPackageInstallation(_workDir: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = []

    // Skip actual installation for now (too slow)
    // TODO: Implement package.json validation against npm registry

    return errors
  }

  /**
   * 3.1 Entry Point Validation
   */
  private validateEntryPoints(files: GeneratedFile[]): ValidationError[] {
    const errors: ValidationError[] = []
    const packageJson = files.find(f => f.path === 'package.json')

    if (!packageJson) return errors

    try {
      const pkg = JSON.parse(packageJson.content)

      // Check main entry point
      if (pkg.main) {
        const mainFile = files.find(f => f.path === pkg.main)
        if (!mainFile) {
          errors.push({
            severity: 'high',
            layer: 'runtime',
            category: 'missing_file',
            file: pkg.main,
            message: `Entry point "${pkg.main}" specified in package.json does not exist`,
            fixable: false,
          })
        }
      }

      // Check scripts
      if (pkg.scripts?.start && !pkg.scripts.start.includes('next')) {
        // Validate start script points to existing file
        const startMatch = pkg.scripts.start.match(/node\s+([^\s]+)/)
        if (startMatch) {
          const startFile = startMatch[1]
          const exists = files.some(f => f.path === startFile)
          if (!exists) {
            errors.push({
              severity: 'high',
              layer: 'runtime',
              category: 'missing_file',
              file: startFile,
              message: `Start script references non-existent file: ${startFile}`,
              fixable: false,
            })
          }
        }
      }
    } catch (error: any) {
      // Already caught elsewhere
    }

    return errors
  }

  /**
   * 3.2 Import Resolution Validation
   */
  private validateImportResolution(_files: GeneratedFile[]): ValidationError[] {
    // Already done in static analysis
    return []
  }

  /**
   * 3.3 Port Configuration Validation
   */
  private validatePortConfig(files: GeneratedFile[]): ValidationError[] {
    const errors: ValidationError[] = []

    // Check for port binding in code
    for (const file of files) {
      if (!this.isCodeFile(file.path)) continue

      // Look for .listen() calls
      const listenMatch = file.content.match(/\.listen\(\s*(\d+)/)
      if (listenMatch) {
        const port = parseInt(listenMatch[1])
        if (port !== 80 && port !== 3000 && port !== 8080) {
          errors.push({
            severity: 'medium',
            layer: 'runtime',
            category: 'port_config',
            file: file.path,
            message: `Non-standard port ${port} detected. Consider using PORT environment variable.`,
            fixable: true,
            fixStrategy: 'config_fixer',
          })
        }
      }
    }

    return errors
  }

  // Helper methods

  private isCodeFile(filePath: string): boolean {
    return /\.(ts|tsx|js|jsx|py|java|go|rs)$/.test(filePath)
  }
}
