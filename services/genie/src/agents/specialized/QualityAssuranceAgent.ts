/**
 * QualityAssuranceAgent - Comprehensive code validation system
 *
 * Architecture (like Fly.io):
 * 1. Static Analysis - Fast rule-based checks
 * 2. Build Simulation - Actual compilation tests
 * 3. Runtime Validation - Sandboxed execution checks
 * 4. Specialized Fixers - Targeted repairs (NO LLM unless absolutely necessary)
 *
 * Performance: < 5 seconds for full validation + auto-fix
 */

import { AgentBuilder } from '@iqai/adk'
import { FastValidatorService } from '../../services/FastValidatorService'
import { ComprehensiveValidator } from '../../services/validation/ComprehensiveValidator'
import { SpecializedFixerRouter } from '../../services/validation/SpecializedFixers'
import type { GeneratedFile } from '../../services/FastValidatorService'

export interface QARequest {
  files: GeneratedFile[]
  language: string
  autoFix?: boolean
  maxAttempts?: number
}

export interface QAResult {
  isValid: boolean
  files: GeneratedFile[]
  errors: any[]
  warnings: any[]
  confidence: number
  fixedCount: number
  appliedFixes: string[]
  duration: number
  attempts: number
}

/**
 * QualityAssuranceAgent - Comprehensive validation with specialized fixers
 */
export class QualityAssuranceAgent {
  private validator = new FastValidatorService()
  private comprehensiveValidator = new ComprehensiveValidator()
  private specializedFixer = new SpecializedFixerRouter()

  /**
   * Run comprehensive quality assurance on generated code
   * Now with multi-layer validation like Fly.io
   */
  async run(request: QARequest): Promise<QAResult> {
    const startTime = Date.now()
    const maxAttempts = request.maxAttempts || 2

    console.log('\n🔍 QualityAssuranceAgent: Starting comprehensive validation...')
    console.log(`   Files: ${request.files.length}, Language: ${request.language}`)

    let currentFiles = request.files
    let totalFixedCount = 0
    let allAppliedFixes: string[] = []
    let attempt = 0

    // Validation loop with auto-fixing
    while (attempt < maxAttempts) {
      attempt++

      console.log(`\n   Attempt ${attempt}/${maxAttempts}`)

      // Run COMPREHENSIVE validation (3 layers: static, build, runtime)
      const validation = await this.comprehensiveValidator.validate(currentFiles)

      console.log(
        `   ✓ Validation: ${validation.errors.length} errors, ${validation.warnings.length} warnings`
      )
      console.log(
        `   ✓ Layers: Static(${validation.layerResults.static.errors}), Build(${validation.layerResults.build.errors}), Runtime(${validation.layerResults.runtime.errors})`
      )

      // Log fixable vs non-fixable errors
      const fixableErrors = validation.errors.filter(e => e.fixable)
      const nonFixableErrors = validation.errors.filter(e => !e.fixable)
      if (validation.errors.length > 0) {
        console.log(
          `   📊 Fixable: ${fixableErrors.length}, Non-fixable: ${nonFixableErrors.length}`
        )
      }

      // If valid or auto-fix disabled, return result
      if (validation.passed || !request.autoFix) {
        const duration = Date.now() - startTime

        console.log(`✅ QualityAssuranceAgent: Complete in ${duration}ms`)

        return {
          isValid: validation.passed,
          files: currentFiles,
          errors: validation.errors,
          warnings: validation.warnings,
          confidence: validation.passed ? 1.0 : 0.0,
          fixedCount: totalFixedCount,
          appliedFixes: allAppliedFixes,
          duration,
          attempts: attempt,
        }
      }

      // If last attempt, return with errors
      if (attempt >= maxAttempts) {
        console.log(
          `   ⚠ Max attempts reached. Returning with ${validation.errors.length} unresolved errors.`
        )
        break
      }

      // Auto-fix issues using SPECIALIZED FIXERS (no LLM!)
      console.log(`   🔧 Auto-fixing ${validation.errors.length} issues with specialized agents...`)
      const fixResult = await this.specializedFixer.fix(currentFiles, validation.errors)

      if (fixResult.fixed) {
        currentFiles = fixResult.files
        totalFixedCount += fixResult.appliedFixes.length
        allAppliedFixes.push(...fixResult.appliedFixes)

        console.log(`   ✓ Fixed: ${fixResult.appliedFixes.length}/${validation.errors.length}`)
        console.log(
          `   ✓ Applied: ${fixResult.appliedFixes.slice(0, 3).join(', ')}${fixResult.appliedFixes.length > 3 ? '...' : ''}`
        )
      } else {
        console.log(`   ✗ Could not apply fixes. Stopping.`)
        break
      }
    }

    // Final validation
    const finalValidation = await this.comprehensiveValidator.validate(currentFiles)
    const duration = Date.now() - startTime

    console.log(
      `\n${finalValidation.passed ? '✅' : '⚠'} QualityAssuranceAgent: Complete in ${duration}ms`
    )
    console.log(`   Fixed: ${totalFixedCount} issues across ${attempt} attempts`)
    console.log(
      `   Remaining: ${finalValidation.errors.length} errors, ${finalValidation.warnings.length} warnings`
    )

    return {
      isValid: finalValidation.passed,
      files: currentFiles,
      errors: finalValidation.errors,
      warnings: finalValidation.warnings,
      confidence: finalValidation.passed ? 1.0 : 0.0,
      fixedCount: totalFixedCount,
      appliedFixes: allAppliedFixes,
      duration,
      attempts: attempt,
    }
  }

  /**
   * Quick validation without auto-fix (< 1s)
   */
  async validateOnly(
    files: GeneratedFile[],
    language: string
  ): Promise<{
    isValid: boolean
    errors: any[]
    warnings: any[]
    confidence: number
    duration: number
  }> {
    const startTime = Date.now()

    const validation = await this.validator.validate(files, language)
    const duration = Date.now() - startTime

    return {
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings,
      confidence: validation.confidence,
      duration,
    }
  }
}

/**
 * Factory function to create QualityAssuranceAgent
 */
export const createQualityAssuranceAgent = (): QualityAssuranceAgent => {
  return new QualityAssuranceAgent()
}

/**
 * Lightweight ADK-compatible wrapper for orchestration
 */
const systemPrompt = `You are a Quality Assurance Agent specializing in fast code validation.

Your responsibilities:
1. Run comprehensive static analysis (syntax, dependencies, patterns)
2. Auto-fix common issues using proven rules
3. Report validation results with detailed diagnostics
4. Provide confidence scores for code quality

You operate in < 2 seconds to maintain fast feedback loops.

Performance characteristics:
- Syntax validation: 100-200ms
- Dependency check: 200-300ms  
- Pattern matching: 300-500ms
- Auto-fixing: 100-500ms
- Total: < 2 seconds

You prioritize:
1. Critical errors (syntax, missing files) - MUST be fixed
2. High severity (missing deps, logic bugs) - SHOULD be fixed
3. Warnings (style, best practices) - NICE to fix

Output format:
{
  "isValid": boolean,
  "confidence": 0.0-1.0,
  "errors": [...],
  "warnings": [...],
  "fixedIssues": [...],
  "duration": milliseconds
}`

export const QualityAssuranceAgentADK = AgentBuilder.create('QualityAssuranceAgent')
  .withModel('gemini-2.5-flash') // Fast model for validation
  .withInstruction(systemPrompt)
  .build()

/**
 * Wrapper function to initialize QualityAssuranceAgent with options
 */
export const QualityAssuranceAgentRunner = async (options?: { githubContext?: any }) => {
  const agent = await QualityAssuranceAgentADK;
  
  // Log initialization
  if (options?.githubContext) {
    console.log('[QualityAssuranceAgent] Initialized with GitHub context:', options.githubContext.username);
  } else {
    console.log('[QualityAssuranceAgent] Initialized without GitHub context');
  }
  
  return agent;
}
