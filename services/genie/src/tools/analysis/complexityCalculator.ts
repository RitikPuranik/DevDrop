import { Project, Node, SyntaxKind } from 'ts-morph'

/**
 * Complexity Calculator Tool
 * Calculate cyclomatic complexity and other code metrics via ts-morph
 */

export interface ComplexityMetrics {
  cyclomaticComplexity: number
  cognitiveComplexity: number
  linesOfCode: number
  maintainabilityIndex: number
  halsteadMetrics?: HalsteadMetrics
}

export interface HalsteadMetrics {
  operators: number
  operands: number
  distinctOperators: number
  distinctOperands: number
  volume: number
  difficulty: number
  effort: number
}

export interface FunctionComplexity {
  name: string
  line: number
  complexity: ComplexityMetrics
  rating: 'A' | 'B' | 'C' | 'D' | 'F'
}

export interface FileComplexity {
  filePath: string
  overallComplexity: number
  functions: FunctionComplexity[]
  classes: ClassComplexity[]
  maintainabilityIndex: number
  linesOfCode: number
}

export interface ClassComplexity {
  name: string
  line: number
  methods: FunctionComplexity[]
  averageComplexity: number
}

/**
 * Calculate cyclomatic complexity for a function/method
 */
export function calculateCyclomaticComplexity(node: Node): number {
  let complexity = 1 // Base complexity

  node.forEachDescendant(descendant => {
    // Add 1 for each decision point
    switch (descendant.getKind()) {
      case SyntaxKind.IfStatement:
      case SyntaxKind.ConditionalExpression:
      case SyntaxKind.CaseClause:
      case SyntaxKind.ForStatement:
      case SyntaxKind.ForInStatement:
      case SyntaxKind.ForOfStatement:
      case SyntaxKind.WhileStatement:
      case SyntaxKind.DoStatement:
      case SyntaxKind.CatchClause:
        complexity++
        break

      case SyntaxKind.BinaryExpression: {
        const binExpr = descendant.asKind(SyntaxKind.BinaryExpression)
        if (binExpr) {
          const operator = binExpr.getOperatorToken().getKind()
          if (
            operator === SyntaxKind.AmpersandAmpersandToken ||
            operator === SyntaxKind.BarBarToken ||
            operator === SyntaxKind.QuestionQuestionToken
          ) {
            complexity++
          }
        }
        break
      }
    }
  })

  return complexity
}

function isRecursiveCall(node: Node): boolean {
  if (Node.isCallExpression(node)) {
    const expression = node.getExpression()
    if (Node.isIdentifier(expression)) {
      const functionNode = node.getFirstAncestorByKind(
        SyntaxKind.FunctionDeclaration
      )
      if (functionNode && expression.getText() === functionNode.getName()) {
        return true
      }
    }
  }
  return false
}

function isLogicalBinaryExpression(node: Node): boolean {
  if (Node.isBinaryExpression(node)) {
    const operator = node.getOperatorToken().getKind()
    return (
      operator === SyntaxKind.AmpersandAmpersandToken ||
      operator === SyntaxKind.BarBarToken
    )
  }
  return false
}

function isControlFlowStructure(kind: SyntaxKind): boolean {
  return (
    kind === SyntaxKind.IfStatement ||
    kind === SyntaxKind.ForStatement ||
    kind === SyntaxKind.ForInStatement ||
    kind === SyntaxKind.ForOfStatement ||
    kind === SyntaxKind.WhileStatement ||
    kind === SyntaxKind.DoStatement ||
    kind === SyntaxKind.CatchClause ||
    kind === SyntaxKind.ConditionalExpression ||
    kind === SyntaxKind.SwitchStatement
  )
}

/**
 * Calculate cognitive complexity (more human-centric than cyclomatic)
 */
export function calculateCognitiveComplexity(node: Node): number {
  let complexity = 0
  const nestingLevel = 0

  function traverse(currentNode: Node, currentNesting: number): void {
    const kind = currentNode.getKind()

    if (isControlFlowStructure(kind)) {
      complexity += 1 + currentNesting
      currentNesting++
    }

    if (isLogicalBinaryExpression(currentNode)) {
      complexity++
    }

    if (isRecursiveCall(currentNode)) {
      complexity++
    }

    currentNode.forEachChild(child => traverse(child, currentNesting))
  }

  traverse(node, nestingLevel)
  return complexity
}

/**
 * Count lines of code (excluding comments and blank lines)
 */
export function countLinesOfCode(code: string): number {
  const lines = code.split('\n')
  let count = 0

  let inMultiLineComment = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip blank lines
    if (trimmed === '') continue

    // Handle multi-line comments
    if (trimmed.startsWith('/*')) {
      inMultiLineComment = true
    }
    if (trimmed.endsWith('*/')) {
      inMultiLineComment = false
      continue
    }
    if (inMultiLineComment) continue

    // Skip single-line comments
    if (trimmed.startsWith('//')) continue

    count++
  }

  return count
}

/**
 * Calculate maintainability index
 * Formula: 171 - 5.2 * ln(Halstead Volume) - 0.23 * (Cyclomatic Complexity) - 16.2 * ln(Lines of Code)
 * Normalized to 0-100 scale
 */
export function calculateMaintainabilityIndex(
  halsteadVolume: number,
  cyclomaticComplexity: number,
  linesOfCode: number
): number {
  if (linesOfCode === 0) return 100

  const rawIndex =
    171 -
    5.2 * Math.log(halsteadVolume || 1) -
    0.23 * cyclomaticComplexity -
    16.2 * Math.log(linesOfCode)

  // Normalize to 0-100
  const normalized = Math.max(0, (rawIndex / 171) * 100)

  return Math.round(normalized * 100) / 100
}

function isOperand(kind: SyntaxKind): boolean {
  return (
    kind === SyntaxKind.Identifier ||
    kind === SyntaxKind.NumericLiteral ||
    kind === SyntaxKind.StringLiteral
  )
}

function isOperator(kind: SyntaxKind): boolean {
  return (
    kind === SyntaxKind.PlusToken ||
    kind === SyntaxKind.MinusToken ||
    kind === SyntaxKind.AsteriskToken ||
    kind === SyntaxKind.SlashToken ||
    kind === SyntaxKind.PercentToken ||
    kind === SyntaxKind.AmpersandAmpersandToken ||
    kind === SyntaxKind.BarBarToken ||
    kind === SyntaxKind.EqualsEqualsToken ||
    kind === SyntaxKind.ExclamationEqualsToken ||
    kind === SyntaxKind.LessThanToken ||
    kind === SyntaxKind.GreaterThanToken ||
    kind === SyntaxKind.EqualsToken
  )
}

/**
 * Calculate Halstead metrics
 */
export function calculateHalsteadMetrics(node: Node): HalsteadMetrics {
  const operators = new Set<string>()
  const operands = new Set<string>()
  let totalOperators = 0
  let totalOperands = 0

  node.forEachDescendant(descendant => {
    const kind = descendant.getKind()

    if (isOperator(kind)) {
      const text = descendant.getText()
      operators.add(text)
      totalOperators++
    }

    if (isOperand(kind)) {
      const text = descendant.getText()
      operands.add(text)
      totalOperands++
    }
  })

  const n1 = operators.size // distinct operators
  const n2 = operands.size // distinct operands
  const N1 = totalOperators // total operators
  const N2 = totalOperands // total operands

  const vocabulary = n1 + n2
  const length = N1 + N2
  const volume = length * Math.log2(vocabulary || 1)
  const difficulty = (n1 / 2) * (N2 / (n2 || 1))
  const effort = volume * difficulty

  return {
    operators: N1,
    operands: N2,
    distinctOperators: n1,
    distinctOperands: n2,
    volume: Math.round(volume * 100) / 100,
    difficulty: Math.round(difficulty * 100) / 100,
    effort: Math.round(effort * 100) / 100,
  }
}

/**
 * Calculate complexity for a function
 */
export function analyzeFunctionComplexity(
  code: string,
  functionName: string,
  filePath: string = 'temp.ts'
): FunctionComplexity {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const func = sourceFile.getFunction(functionName)
  if (!func) {
    throw new Error(`Function '${functionName}' not found`)
  }

  const cyclomatic = calculateCyclomaticComplexity(func)
  const cognitive = calculateCognitiveComplexity(func)
  const loc = countLinesOfCode(func.getText())
  const halstead = calculateHalsteadMetrics(func)
  const maintainability = calculateMaintainabilityIndex(
    halstead.volume,
    cyclomatic,
    loc
  )

  return {
    name: functionName,
    line: func.getStartLineNumber(),
    complexity: {
      cyclomaticComplexity: cyclomatic,
      cognitiveComplexity: cognitive,
      linesOfCode: loc,
      maintainabilityIndex: maintainability,
      halsteadMetrics: halstead,
    },
    rating: getRating(cyclomatic),
  }
}

/**
 * Calculate complexity for entire file
 */
export function analyzeFileComplexity(
  code: string,
  filePath: string = 'temp.ts'
): FileComplexity {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const functions: FunctionComplexity[] = []
  const classes: ClassComplexity[] = []

  // Analyze standalone functions
  sourceFile.getFunctions().forEach(func => {
    const cyclomatic = calculateCyclomaticComplexity(func)
    const cognitive = calculateCognitiveComplexity(func)
    const loc = countLinesOfCode(func.getText())
    const halstead = calculateHalsteadMetrics(func)
    const maintainability = calculateMaintainabilityIndex(
      halstead.volume,
      cyclomatic,
      loc
    )

    functions.push({
      name: func.getName() || '<anonymous>',
      line: func.getStartLineNumber(),
      complexity: {
        cyclomaticComplexity: cyclomatic,
        cognitiveComplexity: cognitive,
        linesOfCode: loc,
        maintainabilityIndex: maintainability,
        halsteadMetrics: halstead,
      },
      rating: getRating(cyclomatic),
    })
  })

  // Analyze classes
  sourceFile.getClasses().forEach(cls => {
    const methods: FunctionComplexity[] = []

    cls.getMethods().forEach(method => {
      const cyclomatic = calculateCyclomaticComplexity(method)
      const cognitive = calculateCognitiveComplexity(method)
      const loc = countLinesOfCode(method.getText())
      const halstead = calculateHalsteadMetrics(method)
      const maintainability = calculateMaintainabilityIndex(
        halstead.volume,
        cyclomatic,
        loc
      )

      methods.push({
        name: method.getName(),
        line: method.getStartLineNumber(),
        complexity: {
          cyclomaticComplexity: cyclomatic,
          cognitiveComplexity: cognitive,
          linesOfCode: loc,
          maintainabilityIndex: maintainability,
          halsteadMetrics: halstead,
        },
        rating: getRating(cyclomatic),
      })
    })

    const avgComplexity =
      methods.reduce((sum, m) => sum + m.complexity.cyclomaticComplexity, 0) /
      (methods.length || 1)

    classes.push({
      name: cls.getName() || '<anonymous>',
      line: cls.getStartLineNumber(),
      methods,
      averageComplexity: Math.round(avgComplexity * 100) / 100,
    })
  })

  const allComplexities = [
    ...functions.map(f => f.complexity.cyclomaticComplexity),
    ...classes.flatMap(c =>
      c.methods.map(m => m.complexity.cyclomaticComplexity)
    ),
  ]

  const overallComplexity =
    allComplexities.reduce((sum, c) => sum + c, 0) /
    (allComplexities.length || 1)

  const loc = countLinesOfCode(code)
  const halstead = calculateHalsteadMetrics(sourceFile)
  const maintainability = calculateMaintainabilityIndex(
    halstead.volume,
    overallComplexity,
    loc
  )

  return {
    filePath,
    overallComplexity: Math.round(overallComplexity * 100) / 100,
    functions,
    classes,
    maintainabilityIndex: maintainability,
    linesOfCode: loc,
  }
}

/**
 * Get complexity rating based on cyclomatic complexity
 */
function getRating(complexity: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (complexity <= 5) return 'A'
  if (complexity <= 10) return 'B'
  if (complexity <= 20) return 'C'
  if (complexity <= 30) return 'D'
  return 'F'
}

/**
 * Format complexity report
 */
export function formatComplexityReport(fileComplexity: FileComplexity): string {
  let report = `\n${'='.repeat(60)}\n`
  report += `Complexity Report: ${fileComplexity.filePath}\n`
  report += `${'='.repeat(60)}\n\n`

  report += `Overall Metrics:\n`
  report += `  Cyclomatic Complexity: ${fileComplexity.overallComplexity}\n`
  report += `  Maintainability Index: ${fileComplexity.maintainabilityIndex}\n`
  report += `  Lines of Code: ${fileComplexity.linesOfCode}\n\n`

  if (fileComplexity.functions.length > 0) {
    report += `Functions:\n`
    fileComplexity.functions.forEach(func => {
      report += `  ${func.name} (line ${func.line}) [${func.rating}]\n`
      report += `    Cyclomatic: ${func.complexity.cyclomaticComplexity}\n`
      report += `    Cognitive: ${func.complexity.cognitiveComplexity}\n`
      report += `    LOC: ${func.complexity.linesOfCode}\n\n`
    })
  }

  if (fileComplexity.classes.length > 0) {
    report += `Classes:\n`
    fileComplexity.classes.forEach(cls => {
      report += `  ${cls.name} (avg complexity: ${cls.averageComplexity})\n`
      cls.methods.forEach(method => {
        report += `    ${method.name} [${method.rating}] - Cyclomatic: ${method.complexity.cyclomaticComplexity}\n`
      })
      report += `\n`
    })
  }

  return report
}
