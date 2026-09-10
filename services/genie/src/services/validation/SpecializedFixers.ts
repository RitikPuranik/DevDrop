/**
 * Specialized Fix Agents - Targeted repairs for specific error types
 *
 * Each fixer is highly specialized and uses rule-based fixes (NO LLM)
 * Only falls back to CodeFixerAgent (LLM) as last resort
 */

import * as ts from 'typescript'
import type { ValidationError, GeneratedFile } from './ComprehensiveValidator'

export interface FixResult {
  fixed: boolean
  files: GeneratedFile[]
  appliedFixes: string[]
}

/**
 * Master fixer that routes to specialized fixers
 */
export class SpecializedFixerRouter {
  private dependencyFixer: DependencyFixerAgent
  private syntaxFixer: SyntaxFixerAgent
  private configFixer: ConfigFixerAgent
  private moduleConverter: ModuleConverterAgent

  constructor() {
    this.dependencyFixer = new DependencyFixerAgent()
    this.syntaxFixer = new SyntaxFixerAgent()
    this.configFixer = new ConfigFixerAgent()
    this.moduleConverter = new ModuleConverterAgent()
  }

  /**
   * Route errors to appropriate fixers
   */
  async fix(files: GeneratedFile[], errors: ValidationError[]): Promise<FixResult> {
    let currentFiles = [...files]
    const appliedFixes: string[] = []

    console.log('\n╔════════════════════════════════════════════════════════════╗')
    console.log('║           SPECIALIZED FIX AGENTS                            ║')
    console.log('╚════════════════════════════════════════════════════════════╝\n')

    // Group errors by fix strategy
    const errorsByStrategy = this.groupErrorsByStrategy(errors)

    // Fix in priority order
    const strategies = [
      'dependency_fixer',
      'module_converter',
      'config_fixer',
      'syntax_fixer',
      'code_cleaner',
      'ai_fixer', // Last resort - requires AI
    ]

    for (const strategy of strategies) {
      const strategyErrors = errorsByStrategy.get(strategy) || []
      if (strategyErrors.length === 0) continue

      console.log(`┌─ Running ${strategy} for ${strategyErrors.length} errors ──────`)

      let result: FixResult | null = null

      switch (strategy) {
        case 'dependency_fixer':
          result = this.dependencyFixer.fix(currentFiles, strategyErrors)
          break
        case 'module_converter':
          result = this.moduleConverter.fix(currentFiles, strategyErrors)
          break
        case 'config_fixer':
          result = this.configFixer.fix(currentFiles, strategyErrors)
          break
        case 'syntax_fixer':
          result = this.syntaxFixer.fix(currentFiles, strategyErrors)
          break
        case 'ai_fixer':
          // Skip AI fixer - will be handled by CodeModificationAgent
          console.log(
            `└─ Skipped (requires AI - ${strategyErrors.length} errors will be fixed by CodeModificationAgent)\n`
          )
          continue
      }

      if (result && result.fixed) {
        currentFiles = result.files
        appliedFixes.push(...result.appliedFixes)
        console.log(`└─ Fixed ${result.appliedFixes.length} issues\n`)
      } else {
        console.log(`└─ No fixes applied\n`)
      }
    }

    console.log('╔════════════════════════════════════════════════════════════╗')
    console.log(`║ Total fixes applied: ${appliedFixes.length}                              ║`)
    console.log('╚════════════════════════════════════════════════════════════╝\n')

    return {
      fixed: appliedFixes.length > 0,
      files: currentFiles,
      appliedFixes,
    }
  }

  private groupErrorsByStrategy(errors: ValidationError[]): Map<string, ValidationError[]> {
    const grouped = new Map<string, ValidationError[]>()

    for (const error of errors) {
      if (!error.fixable || !error.fixStrategy) continue

      if (!grouped.has(error.fixStrategy)) {
        grouped.set(error.fixStrategy, [])
      }
      grouped.get(error.fixStrategy)!.push(error)
    }

    return grouped
  }
}

/**
 * Agent 1: Dependency Fixer
 * - Adds missing dependencies
 * - Fixes invalid versions
 * - Adds missing @types packages
 */
class DependencyFixerAgent {
  private versionMap: Record<string, string> = {
    // React ecosystem
    react: '^18.3.1',
    'react-dom': '^18.3.1',
    '@types/react': '^18.3.12',
    '@types/react-dom': '^18.3.1',

    // Next.js
    next: '^13.4.12',

    // Build tools
    typescript: '^5.6.3',
    '@types/node': '^22.10.2',
    vite: '^5.4.11',
    '@vitejs/plugin-react': '^4.3.4',

    // Backend
    express: '^4.21.2',
    '@types/express': '^4.17.21',
    cors: '^2.8.5',
    '@types/cors': '^2.8.17',

    // Testing
    jest: '^29.7.0',
    '@types/jest': '^29.5.14',
    'ts-jest': '^29.2.5',
    vitest: '3.2.4',
    '@vitest/ui': '3.2.4',

    // Utilities
    axios: '^1.7.9',
    eslint: '^8.56.0',
    swr: '^2.2.5',
  }

  /**
   * Auto-detect missing dependencies from error messages
   */
  private extractMissingPackage(errorMessage: string): string | null {
    // Pattern: "Cannot find module 'package-name'"
    const moduleMatch = errorMessage.match(/Cannot find module ['"]([^'"]+)['"]/)
    if (moduleMatch) return moduleMatch[1]

    // Pattern: "Missing @types/package"
    const typesMatch = errorMessage.match(/Missing (@types\/[\w-]+)/)
    if (typesMatch) return typesMatch[1]

    return null
  }

  fix(files: GeneratedFile[], errors: ValidationError[]): FixResult {
    const appliedFixes: string[] = []
    const packageJsonFile = files.find(f => f.path === 'package.json')

    if (!packageJsonFile) {
      // Create package.json if missing
      const newPackageJson: GeneratedFile = {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: 'generated-app',
            version: '1.0.0',
            type: 'module',
            scripts: {
              dev: 'next dev',
              build: 'next build',
              start: 'next start',
            },
            dependencies: {},
            devDependencies: {},
          },
          null,
          2
        ),
      }
      appliedFixes.push('Created missing package.json')
      return {
        fixed: true,
        files: [...files, newPackageJson],
        appliedFixes,
      }
    }

    try {
      const pkg = JSON.parse(packageJsonFile.content)

      for (const error of errors) {
        // Auto-detect and add missing packages
        const missingPkg = this.extractMissingPackage(error.message)
        if (missingPkg) {
          const version = this.versionMap[missingPkg] || 'latest'

          // Decide if it goes to dependencies or devDependencies
          const isTypesPackage = missingPkg.startsWith('@types/')
          const isDevTool = ['eslint', 'jest', 'typescript', 'vite'].some(tool =>
            missingPkg.includes(tool)
          )

          if (isTypesPackage || isDevTool) {
            pkg.devDependencies = pkg.devDependencies || {}
            pkg.devDependencies[missingPkg] = version
          } else {
            pkg.dependencies = pkg.dependencies || {}
            pkg.dependencies[missingPkg] = version
          }

          appliedFixes.push(`Added ${missingPkg}@${version}`)
          continue
        }

        if (error.category === 'missing_types') {
          // Extract package name from message: "Missing @types/react for react"
          const match = error.message.match(/Missing (@types\/[\w-]+)/)
          if (match) {
            const typePkg = match[1]
            const version = this.versionMap[typePkg] || 'latest'

            pkg.devDependencies = pkg.devDependencies || {}
            pkg.devDependencies[typePkg] = version
            appliedFixes.push(`Added ${typePkg}@${version}`)
          }
        }

        if (error.category === 'missing_dependency') {
          // Extract package name from message: 'missing "@vitejs/plugin-react" in devDependencies'
          const match = error.message.match(/missing "([^"]+)"/)
          if (match) {
            const pkgName = match[1]
            const version = this.versionMap[pkgName] || 'latest'

            // Determine if it's a dev dependency or runtime dependency
            const isDevDep =
              pkgName.startsWith('@vitejs/') ||
              pkgName.startsWith('@types/') ||
              ['typescript', 'vite', 'eslint', 'jest'].some(tool => pkgName.includes(tool))

            if (isDevDep) {
              pkg.devDependencies = pkg.devDependencies || {}
              pkg.devDependencies[pkgName] = version
            } else {
              pkg.dependencies = pkg.dependencies || {}
              pkg.dependencies[pkgName] = version
            }
            appliedFixes.push(
              `Added ${pkgName}@${version} to ${isDevDep ? 'devDependencies' : 'dependencies'}`
            )
          }
        }

        if (error.category === 'dependency_version') {
          // Fix invalid versions
          const match = error.message.match(/package "([^"]+)"/)
          if (match) {
            const pkgName = match[1]
            const newVersion = this.versionMap[pkgName] || '^1.0.0'

            // Find which section has this package
            const sections = ['dependencies', 'devDependencies', 'peerDependencies']
            for (const section of sections) {
              if (pkg[section]?.[pkgName]) {
                pkg[section][pkgName] = newVersion
                appliedFixes.push(`Fixed ${pkgName} version to ${newVersion}`)
                break
              }
            }
          }
        }

        if (error.category === 'package_json' && error.message.includes('Missing "name"')) {
          pkg.name = 'generated-app'
          appliedFixes.push('Added package name')
        }
      }

      if (appliedFixes.length > 0) {
        const updatedFiles = files.map(f =>
          f.path === 'package.json' ? { ...f, content: JSON.stringify(pkg, null, 2) } : f
        )

        return {
          fixed: true,
          files: updatedFiles,
          appliedFixes,
        }
      }
    } catch (error) {
      console.error('Failed to fix dependencies:', error)
    }

    return {
      fixed: false,
      files,
      appliedFixes: [],
    }
  }
}

/**
 * Agent 2: Module Converter
 * - Converts CommonJS to ESM
 * - Fixes module.exports issues
 */
class ModuleConverterAgent {
  fix(files: GeneratedFile[], errors: ValidationError[]): FixResult {
    const appliedFixes: string[] = []
    let updatedFiles = [...files]

    for (const error of errors) {
      if (error.category !== 'module_system' && error.category !== 'config_mismatch') continue
      if (!error.file) continue

      const fileIndex = updatedFiles.findIndex(f => f.path === error.file)
      if (fileIndex === -1) continue

      const file = updatedFiles[fileIndex]
      let newContent = file.content

      // Convert module.exports to export default
      if (newContent.includes('module.exports')) {
        // Handle: module.exports = { ... }
        newContent = newContent.replace(/module\.exports\s*=\s*(\{[^}]+\})/, 'export default $1')

        // Handle: module.exports = function() { ... }
        newContent = newContent.replace(/module\.exports\s*=\s*([\w]+)/, 'export default $1')

        appliedFixes.push(`Converted ${file.path} from CommonJS to ESM`)
        updatedFiles[fileIndex] = { ...file, content: newContent }
      }

      // Special case: next.config.js with ESM package.json
      if (file.path === 'next.config.js' && error.message.includes('rename to .cjs')) {
        // Rename to .cjs instead of converting
        updatedFiles[fileIndex] = { ...file, path: 'next.config.cjs' }
        appliedFixes.push('Renamed next.config.js to next.config.cjs')
      }
    }

    return {
      fixed: appliedFixes.length > 0,
      files: updatedFiles,
      appliedFixes,
    }
  }
}

/**
 * Agent 3: Config Fixer
 * - Fixes tsconfig.json issues
 * - Fixes Next.js config
 * - Ensures jsx configuration
 */
class ConfigFixerAgent {
  fix(files: GeneratedFile[], errors: ValidationError[]): FixResult {
    const appliedFixes: string[] = []
    let updatedFiles = [...files]

    // Fix tsconfig.json
    const tsconfigIndex = updatedFiles.findIndex(f => f.path === 'tsconfig.json')
    if (tsconfigIndex !== -1) {
      try {
        const tsconfig = JSON.parse(updatedFiles[tsconfigIndex].content)

        for (const error of errors) {
          if (error.file !== 'tsconfig.json') continue

          // Fix missing jsx
          if (error.category === 'missing_config' && error.message.includes('jsx')) {
            tsconfig.compilerOptions = tsconfig.compilerOptions || {}
            tsconfig.compilerOptions.jsx = 'react-jsx'
            appliedFixes.push('Added jsx: "react-jsx" to tsconfig.json')
          }

          // Fix module for ESM
          if (error.category === 'config_mismatch' && error.message.includes('module')) {
            tsconfig.compilerOptions = tsconfig.compilerOptions || {}
            tsconfig.compilerOptions.module = 'ESNext'
            appliedFixes.push('Updated module to "ESNext" in tsconfig.json')
          }
        }

        if (appliedFixes.length > 0) {
          updatedFiles[tsconfigIndex] = {
            ...updatedFiles[tsconfigIndex],
            content: JSON.stringify(tsconfig, null, 2),
          }
        }
      } catch (error) {
        console.error('Failed to fix tsconfig.json:', error)
      }
    }

    // Fix next.config.js
    const nextConfigIndex = updatedFiles.findIndex(
      f => f.path === 'next.config.js' || f.path === 'next.config.mjs'
    )
    if (nextConfigIndex !== -1) {
      let nextConfig = updatedFiles[nextConfigIndex].content

      for (const error of errors) {
        if (!error.file?.startsWith('next.config')) continue

        // Remove deprecated swcMinify
        if (error.category === 'deprecated_config' && error.message.includes('swcMinify')) {
          nextConfig = nextConfig.replace(/,?\s*swcMinify:\s*true,?/g, '')
          appliedFixes.push('Removed deprecated swcMinify from Next.js config')
        }
      }

      if (appliedFixes.some(f => f.includes('Next.js config'))) {
        updatedFiles[nextConfigIndex] = {
          ...updatedFiles[nextConfigIndex],
          content: nextConfig,
        }
      }
    }

    // Fix port configuration
    for (const error of errors) {
      if (error.category !== 'port_config') continue
      if (!error.file) continue

      const fileIndex = updatedFiles.findIndex(f => f.path === error.file)
      if (fileIndex === -1) continue

      const file = updatedFiles[fileIndex]
      let newContent = file.content

      // Replace hardcoded port with environment variable
      newContent = newContent.replace(/\.listen\(\s*(\d+)/g, '.listen(process.env.PORT || $1')

      if (newContent !== file.content) {
        updatedFiles[fileIndex] = { ...file, content: newContent }
        appliedFixes.push(`Fixed port configuration in ${file.path}`)
      }
    }

    return {
      fixed: appliedFixes.length > 0,
      files: updatedFiles,
      appliedFixes,
    }
  }
}

/**
 * Agent 4: Syntax Fixer
 * - Fixes common syntax mistakes
 * - Fixes template string issues
 * - Fixes import/hook usage problems
 * - Uses AST transformations
 */
class SyntaxFixerAgent {
  fix(files: GeneratedFile[], errors: ValidationError[]): FixResult {
    const appliedFixes: string[] = []
    let updatedFiles = [...files]

    for (const error of errors) {
      if (error.category !== 'syntax') continue
      if (!error.file) continue

      const fileIndex = updatedFiles.findIndex(f => f.path === error.file)
      if (fileIndex === -1) continue

      const file = updatedFiles[fileIndex]
      let newContent = file.content
      let modified = false

      // Fix 1: Unterminated string literal
      if (
        error.message.includes('Unterminated string literal') ||
        error.message.includes('unterminated')
      ) {
        // Common issues:
        // 1. Nested template strings without proper escaping
        // 2. Actual newlines in JSON strings (should be \n)
        // 3. Missing closing quotes

        // Fix sitemap.xml.ts specific issue
        if (file.path.includes('sitemap.xml')) {
          newContent = this.fixSitemapTemplateString(newContent)
          if (newContent !== file.content) {
            modified = true
            appliedFixes.push(`Fixed template string in ${file.path}`)
          }
        }

        // Fix general unterminated strings by escaping actual newlines
        if (error.line) {
          const lines = newContent.split('\n')
          const errorLine = lines[error.line - 1]

          if (errorLine) {
            // Check if line has unmatched quotes
            const doubleQuoteCount = (errorLine.match(/(?<!\\)"/g) || []).length
            const singleQuoteCount = (errorLine.match(/(?<!\\)'/g) || []).length

            // If odd number of quotes, try to fix
            if (doubleQuoteCount % 2 !== 0 || singleQuoteCount % 2 !== 0) {
              // Look for multiline string that should be single line
              // Pattern: "something\n  continuation" -> "something\\n  continuation"
              let fixedLine = errorLine

              // If next line exists and looks like continuation
              if (error.line < lines.length) {
                const nextLine = lines[error.line]

                // If current line has opening quote but no closing, and next line exists
                if (doubleQuoteCount % 2 !== 0) {
                  // Merge lines with \n escape
                  fixedLine = errorLine + '\\n' + nextLine.trim()
                  lines[error.line - 1] = fixedLine
                  lines.splice(error.line, 1) // Remove next line
                  newContent = lines.join('\n')
                  modified = true
                  appliedFixes.push(
                    `Fixed unterminated string at line ${error.line} in ${file.path}`
                  )
                }
              }
            }
          }
        }
      }

      // Fix 2: Router.useRouter() -> useRouter() (Next.js hook usage)
      if (error.message.includes("Property 'useRouter' does not exist")) {
        // Pattern: const Router = require('next/router') as typeof useRouter
        //          const router = Router.useRouter()
        // Fix: Import useRouter directly and use it

        if (newContent.includes('Router.useRouter()')) {
          // Replace require pattern with proper import
          newContent = newContent.replace(
            /const\s+Router\s*=\s*require\(['"]next\/router['"]\)\s*as\s*typeof\s+useRouter/g,
            '// Router import handled by useRouter hook'
          )

          // Replace Router.useRouter() with useRouter()
          newContent = newContent.replace(/Router\.useRouter\(\)/g, 'useRouter()')

          // Ensure useRouter is imported at the top
          if (!newContent.match(/^import.*useRouter.*from ['"]next\/router['"]/m)) {
            const firstImportMatch = newContent.match(/^import .+$/m)
            if (firstImportMatch) {
              const insertPos = newContent.indexOf(firstImportMatch[0]) + firstImportMatch[0].length
              newContent =
                newContent.slice(0, insertPos) +
                "\nimport { useRouter } from 'next/router'" +
                newContent.slice(insertPos)
            }
          }

          modified = true
          appliedFixes.push(`Fixed useRouter hook usage in ${file.path}`)
        }
      }

      // Fix 3: className{...} -> className={...}
      if (error.message.includes('className')) {
        const fixed = newContent.replace(/className\{/g, 'className={')
        if (fixed !== newContent) {
          newContent = fixed
          modified = true
          appliedFixes.push(`Fixed JSX attribute syntax in ${file.path}`)
        }
      }

      // Fix 4: Missing semicolons
      if (error.message.includes('semicolon')) {
        try {
          const sourceFile = ts.createSourceFile(
            file.path,
            newContent,
            ts.ScriptTarget.Latest,
            true
          )

          const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
          const formatted = printer.printFile(sourceFile)

          if (formatted !== newContent) {
            newContent = formatted
            modified = true
            appliedFixes.push(`Fixed syntax errors in ${file.path}`)
          }
        } catch (e) {
          // If AST transformation fails, skip
        }
      }

      if (modified) {
        updatedFiles[fileIndex] = { ...file, content: newContent }
      }
    }

    return {
      fixed: appliedFixes.length > 0,
      files: updatedFiles,
      appliedFixes,
    }
  }

  /**
   * Fix template string issues in sitemap.xml.ts
   */
  private fixSitemapTemplateString(content: string): string {
    // Common pattern that breaks:
    // ${urls.map(u => `<url><loc>${baseUrl}${u}</loc></url>`).join('\n')}

    // Solution: Use proper escaping or string concatenation
    const sitemapPattern =
      /\$\{urls\.map\(([^)]+)\s*=>\s*`([^`]*\$\{[^}]+\}[^`]*)`\)\.join\(['"]([^'"]*)['"]\)\}/g

    return content.replace(sitemapPattern, (_match, param, template, separator) => {
      // Convert template to string concatenation
      const fixedTemplate = template.replace(/\$\{([^}]+)\}/g, '${$1}')
      return `\${urls.map(${param} => \`${fixedTemplate}\`).join('${separator}')}`
    })
  }
}
