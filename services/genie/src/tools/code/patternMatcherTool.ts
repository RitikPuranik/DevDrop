import { Project, Node, VariableDeclarationKind } from 'ts-morph'

/**
 * Pattern Matcher Tool
 * Find code patterns for refactoring opportunities
 */

export interface CodePattern {
  name: string
  description: string
  severity: 'info' | 'warning' | 'error'
  line: number
  column: number
  text: string
  suggestion?: string
}

/**
 * Find long functions (more than N lines)
 */
export async function findLongFunctions(
  code: string,
  maxLines: number = 50,
  filePath: string = 'temp.ts'
): Promise<CodePattern[]> {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const patterns: CodePattern[] = []

  sourceFile.getFunctions().forEach(func => {
    const lineCount = func.getEndLineNumber() - func.getStartLineNumber()
    if (lineCount > maxLines) {
      patterns.push({
        name: 'long_function',
        description: `Function '${func.getName() || '<anonymous>'}' is ${lineCount} lines long`,
        severity: 'warning',
        line: func.getStartLineNumber(),
        column: func.getStartLinePos(),
        text: func.getText().substring(0, 100) + '...',
        suggestion: `Consider breaking this function into smaller functions`,
      })
    }
  })

  sourceFile.getClasses().forEach(cls => {
    cls.getMethods().forEach(method => {
      const lineCount = method.getEndLineNumber() - method.getStartLineNumber()
      if (lineCount > maxLines) {
        patterns.push({
          name: 'long_method',
          description: `Method '${cls.getName()}.${method.getName()}' is ${lineCount} lines long`,
          severity: 'warning',
          line: method.getStartLineNumber(),
          column: method.getStartLinePos(),
          text: method.getText().substring(0, 100) + '...',
          suggestion: `Consider extracting parts of this method`,
        })
      }
    })
  })

  return patterns
}

/**
 * Find functions with too many parameters
 */
export async function findFunctionsWithManyParameters(
  code: string,
  maxParams: number = 5,
  filePath: string = 'temp.ts'
): Promise<CodePattern[]> {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const patterns: CodePattern[] = []

  sourceFile.getFunctions().forEach(func => {
    const paramCount = func.getParameters().length
    if (paramCount > maxParams) {
      patterns.push({
        name: 'too_many_parameters',
        description: `Function '${func.getName() || '<anonymous>'}' has ${paramCount} parameters`,
        severity: 'warning',
        line: func.getStartLineNumber(),
        column: func.getStartLinePos(),
        text: func.getText().substring(0, 100) + '...',
        suggestion: `Consider using an options object instead`,
      })
    }
  })

  return patterns
}

/**
 * Find deeply nested code blocks
 */
export async function findDeeplyNestedCode(
  code: string,
  maxDepth: number = 4,
  filePath: string = 'temp.ts'
): Promise<CodePattern[]> {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const patterns: CodePattern[] = []

  function checkNesting(node: Node, depth: number = 0): void {
    if (
      Node.isIfStatement(node) ||
      Node.isForStatement(node) ||
      Node.isWhileStatement(node) ||
      Node.isDoStatement(node) ||
      Node.isSwitchStatement(node)
    ) {
      if (depth > maxDepth) {
        patterns.push({
          name: 'deeply_nested',
          description: `Code is nested ${depth} levels deep`,
          severity: 'warning',
          line: node.getStartLineNumber(),
          column: node.getStartLinePos(),
          text: node.getText().substring(0, 100) + '...',
          suggestion: `Consider extracting to separate functions`,
        })
      }

      node.forEachChild(child => checkNesting(child, depth + 1))
    } else {
      node.forEachChild(child => checkNesting(child, depth))
    }
  }

  sourceFile.forEachChild(node => checkNesting(node, 0))

  return patterns
}

/**
 * Find console.log statements (should use proper logging)
 */
export async function findConsoleLogs(
  code: string,
  filePath: string = 'temp.ts'
): Promise<CodePattern[]> {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const patterns: CodePattern[] = []

  sourceFile.forEachDescendant(node => {
    if (Node.isCallExpression(node)) {
      const expression = node.getExpression()
      if (Node.isPropertyAccessExpression(expression)) {
        const obj = expression.getExpression().getText()
        const method = expression.getName()

        if (obj === 'console') {
          patterns.push({
            name: 'console_log',
            description: `Found console.${method} statement`,
            severity: 'info',
            line: node.getStartLineNumber(),
            column: node.getStartLinePos(),
            text: node.getText(),
            suggestion: `Use a proper logging library instead`,
          })
        }
      }
    }
  })

  return patterns
}

/**
 * Find any type usage
 */
export async function findAnyTypes(
  code: string,
  filePath: string = 'temp.ts'
): Promise<CodePattern[]> {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const patterns: CodePattern[] = []

  sourceFile.forEachDescendant(node => {
    if (Node.isTypeReference(node)) {
      const typeName = node.getTypeName().getText()
      if (typeName === 'any') {
        patterns.push({
          name: 'any_type',
          description: 'Found usage of "any" type',
          severity: 'warning',
          line: node.getStartLineNumber(),
          column: node.getStartLinePos(),
          text: node.getText(),
          suggestion: 'Use a more specific type instead of "any"',
        })
      }
    }
  })

  return patterns
}

/**
 * Find empty catch blocks
 */
export async function findEmptyCatchBlocks(
  code: string,
  filePath: string = 'temp.ts'
): Promise<CodePattern[]> {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const patterns: CodePattern[] = []

  sourceFile.forEachDescendant(node => {
    if (Node.isCatchClause(node)) {
      const block = node.getBlock()
      const statements = block.getStatements()

      if (statements.length === 0) {
        patterns.push({
          name: 'empty_catch',
          description: 'Empty catch block found',
          severity: 'error',
          line: node.getStartLineNumber(),
          column: node.getStartLinePos(),
          text: node.getText(),
          suggestion: 'Handle errors properly or at least log them',
        })
      }
    }
  })

  return patterns
}

/**
 * Find duplicate code blocks
 */
export async function findDuplicateCode(
  code: string,
  minLines: number = 5,
  filePath: string = 'temp.ts'
): Promise<CodePattern[]> {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const patterns: CodePattern[] = []
  const codeBlocks = new Map<string, Array<{ line: number; text: string }>>()

  // Extract all block statements
  sourceFile.forEachDescendant(node => {
    if (Node.isBlock(node)) {
      const text = node.getText()
      const lineCount = text.split('\n').length

      if (lineCount >= minLines) {
        if (!codeBlocks.has(text)) {
          codeBlocks.set(text, [])
        }
        codeBlocks.get(text)!.push({
          line: node.getStartLineNumber(),
          text,
        })
      }
    }
  })

  // Find duplicates
    codeBlocks.forEach(blocks => {
    if (blocks.length > 1) {
      blocks.forEach(block => {
        patterns.push({
          name: 'duplicate_code',
          description: `Duplicate code block found (${blocks.length} occurrences)`,
          severity: 'warning',
          line: block.line,
          column: 0,
          text: block.text.substring(0, 100) + '...',
          suggestion: 'Extract duplicated code into a shared function',
        })
      })
    }
  })

  return patterns
}

/**
 * Find magic numbers (hardcoded numbers that should be constants)
 */
export async function findMagicNumbers(
  code: string,
  filePath: string = 'temp.ts'
): Promise<CodePattern[]> {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const patterns: CodePattern[] = []
  const ignoredNumbers = [0, 1, -1, 2, 10, 100, 1000]

  sourceFile.forEachDescendant(node => {
    if (Node.isNumericLiteral(node)) {
      const value = parseFloat(node.getText())

      // Skip common numbers and numbers in enum/const declarations
      if (
        !ignoredNumbers.includes(value) &&
        !Node.isEnumMember(node.getParent()) &&
        !isInConstDeclaration(node)
      ) {
        patterns.push({
          name: 'magic_number',
          description: `Magic number ${value} found`,
          severity: 'info',
          line: node.getStartLineNumber(),
          column: node.getStartLinePos(),
          text: node.getText(),
          suggestion: 'Consider extracting to a named constant',
        })
      }
    }
  })

  return patterns
}

function isInConstDeclaration(node: Node): boolean {
  let parent = node.getParent()
  while (parent) {
    if (Node.isVariableDeclaration(parent)) {
      const varStmt = parent.getParent()?.getParent()
      if (
        varStmt &&
        Node.isVariableStatement(varStmt) &&
                varStmt.getDeclarationKind() === VariableDeclarationKind.Const
      ) {
        // VariableDeclarationKind.Const = 2
        return true
      }
    }
    parent = parent.getParent()
  }
  return false
}

/**
 * Find functions without return type annotations
 */
export async function findMissingReturnTypes(
  code: string,
  filePath: string = 'temp.ts'
): Promise<CodePattern[]> {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const patterns: CodePattern[] = []

  sourceFile.getFunctions().forEach(func => {
    if (!func.getReturnTypeNode()) {
      patterns.push({
        name: 'missing_return_type',
        description: `Function '${func.getName() || '<anonymous>'}' has no return type`,
        severity: 'info',
        line: func.getStartLineNumber(),
        column: func.getStartLinePos(),
        text: func.getText().substring(0, 100) + '...',
        suggestion: 'Add explicit return type annotation',
      })
    }
  })

  return patterns
}

/**
 * Run all pattern checks
 */
export async function findAllPatterns(
  code: string,
  filePath: string = 'temp.ts'
): Promise<CodePattern[]> {
  const results = await Promise.all([
    findLongFunctions(code, 50, filePath),
    findFunctionsWithManyParameters(code, 5, filePath),
    findDeeplyNestedCode(code, 4, filePath),
    findConsoleLogs(code, filePath),
    findAnyTypes(code, filePath),
    findEmptyCatchBlocks(code, filePath),
    findDuplicateCode(code, 5, filePath),
    findMagicNumbers(code, filePath),
    findMissingReturnTypes(code, filePath),
  ])

  return results.flat()
}

// Export the tool for ADK integration
import { createTool } from '@iqai/adk'
import { z } from 'zod'

export const patternMatcherTool = createTool({
  name: 'patternMatcherTool',
  description: 'Find code patterns and refactoring opportunities',
  schema: z.object({
    code: z.string(),
    filePath: z.string().optional()
  }),
  fn: async (args) => {
    return findAllPatterns(args.code, args.filePath || 'temp.ts')
  }
})
