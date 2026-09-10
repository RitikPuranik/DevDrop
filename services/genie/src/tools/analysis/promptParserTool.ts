/**
 * Prompt Parser Tool
 * Extract intent, entities, and requirements from natural language prompts
 */

export interface ParsedPrompt {
  intent: Intent
  entities: Entity[]
  requirements: Requirement[]
  constraints: Constraint[]
  context?: string
  confidence: number
}

export interface Intent {
  action:
    | 'generate'
    | 'refactor'
    | 'review'
    | 'enhance'
    | 'test'
    | 'document'
    | 'fix'
    | 'explain'
  target:
    | 'function'
    | 'class'
    | 'component'
    | 'service'
    | 'api'
    | 'test'
    | 'file'
    | 'module'
  description: string
  confidence: number
}

export interface Entity {
  type:
    | 'file_path'
    | 'function_name'
    | 'class_name'
    | 'variable_name'
    | 'technology'
    | 'framework'
    | 'pattern'
  value: string
  context?: string
}

export interface Requirement {
  type: 'functional' | 'non-functional' | 'technical' | 'business'
  description: string
  priority: 'high' | 'medium' | 'low'
}

export interface Constraint {
  type: 'performance' | 'security' | 'compatibility' | 'style' | 'other'
  description: string
}

/**
 * Parse natural language prompt
 */
export async function parsePrompt(prompt: string): Promise<ParsedPrompt> {
  const normalized = prompt.toLowerCase().trim()

  const intent = extractIntent(normalized, prompt)
  const entities = extractEntities(normalized, prompt)
  const requirements = extractRequirements(normalized, prompt)
  const constraints = extractConstraints(normalized, prompt)
  const context = extractContext(normalized, prompt)

  // Calculate overall confidence
  const confidence = calculateConfidence(intent, entities, requirements)

  return {
    intent,
    entities,
    requirements,
    constraints,
    context,
    confidence,
  }
}

/**
 * Extract intent from prompt
 */
function extractIntent(_normalized: string, original: string): Intent {
  const normalized = _normalized
  const actionPatterns = {
    generate: [
      /\b(create|generate|make|build|implement|write)\b/,
      /\b(add|new)\b/,
    ],
    refactor: [/\b(refactor|improve|optimize|clean\s*up|reorganize)\b/],
    review: [/\b(review|check|analyze|inspect|examine)\b/],
    enhance: [/\b(enhance|upgrade|extend|add\s*feature)\b/],
    test: [/\b(test|spec|unit\s*test|integration\s*test)\b/],
    document: [/\b(document|comment|doc|tsdoc|jsdoc)\b/],
    fix: [/\b(fix|repair|debug|resolve|bug)\b/],
    explain: [/\b(explain|describe|what|how|why)\b/],
  }

  const targetPatterns = {
    function: [/\b(function|func|method)\b/],
    class: [/\b(class|object)\b/],
    component: [/\b(component|react|vue)\b/],
    service: [/\b(service|api|endpoint)\b/],
    api: [/\b(api|endpoint|route|controller)\b/],
    test: [/\b(test|spec|suite)\b/],
    file: [/\b(file|module)\b/],
    module: [/\b(module|package|library)\b/],
  }

  let action: Intent['action'] = 'generate'
  let target: Intent['target'] = 'function'
  let confidence = 0.5

  // Detect action
  for (const [key, patterns] of Object.entries(actionPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        action = key as Intent['action']
        confidence += 0.2
        break
      }
    }
  }

  // Detect target
  for (const [key, patterns] of Object.entries(targetPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        target = key as Intent['target']
        confidence += 0.2
        break
      }
    }
  }

  return {
    action,
    target,
    description: original,
    confidence: Math.min(confidence, 1.0),
  }
}

/**
 * Extract entities (technologies, frameworks, names)
 */
function extractEntities(normalized: string, original: string): Entity[] {
  const entities: Entity[] = []

  // Technology patterns
  const technologies = [
    'typescript',
    'javascript',
    'react',
    'vue',
    'angular',
    'node',
    'express',
    'nest',
    'next',
    'python',
    'java',
    'go',
    'rust',
  ]

  technologies.forEach(tech => {
    if (normalized.includes(tech)) {
      entities.push({
        type: 'technology',
        value: tech,
      })
    }
  })

  // Framework patterns
  const frameworks = [
    'jest',
    'vitest',
    'mocha',
    'chai',
    'cypress',
    'playwright',
    'tailwind',
    'bootstrap',
  ]

  frameworks.forEach(framework => {
    if (normalized.includes(framework)) {
      entities.push({
        type: 'framework',
        value: framework,
      })
    }
  })

  // File paths (basic pattern)
  const filePathPattern = /(['"`])([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|py|java))\1/g
  let match
  while ((match = filePathPattern.exec(original)) !== null) {
    entities.push({
      type: 'file_path',
      value: match[2],
    })
  }

  // Function/class names (PascalCase or camelCase in quotes)
  const namePattern = /(['"`])([A-Z][a-zA-Z0-9]+|[a-z][a-zA-Z0-9]+)\1/g
  while ((match = namePattern.exec(original)) !== null) {
    const name = match[2]
    const type = /^[A-Z]/.test(name) ? 'class_name' : 'function_name'
    entities.push({
      type,
      value: name,
    })
  }

  // Design patterns
  const patterns = [
    'singleton',
    'factory',
    'observer',
    'decorator',
    'adapter',
    'strategy',
    'repository',
    'mvc',
    'mvvm',
  ]

  patterns.forEach(pattern => {
    if (normalized.includes(pattern)) {
      entities.push({
        type: 'pattern',
        value: pattern,
      })
    }
  })

  return entities
}

/**
 * Extract requirements from prompt
 */
function extractRequirements(
  normalized: string,
  original: string
): Requirement[] {
  const requirements: Requirement[] = []

  // Functional requirements
  if (/\b(should|must|need to|has to|required to)\b/.test(normalized)) {
    const functionalPattern =
      /(should|must|need to|has to|required to)\s+([^.;,]+)/g
    let match
    while ((match = functionalPattern.exec(original)) !== null) {
      requirements.push({
        type: 'functional',
        description: match[2].trim(),
        priority: match[1] === 'must' ? 'high' : 'medium',
      })
    }
  }

  // Performance requirements
  if (/\b(fast|quick|performance|optimize|efficient)\b/.test(normalized)) {
    requirements.push({
      type: 'non-functional',
      description: 'Should be performant and efficient',
      priority: 'medium',
    })
  }

  // Security requirements
  if (/\b(secure|safe|auth|permission|validate)\b/.test(normalized)) {
    requirements.push({
      type: 'non-functional',
      description: 'Should be secure and validated',
      priority: 'high',
    })
  }

  // Testing requirements
  if (/\b(test|tested|coverage)\b/.test(normalized)) {
    requirements.push({
      type: 'technical',
      description: 'Should include tests',
      priority: 'high',
    })
  }

  // Documentation requirements
  if (/\b(document|comment|tsdoc)\b/.test(normalized)) {
    requirements.push({
      type: 'technical',
      description: 'Should be well-documented',
      priority: 'medium',
    })
  }

  return requirements
}

/**
 * Extract constraints from prompt
 */
function extractConstraints(
  normalized: string,
  original: string
): Constraint[] {
  const constraints: Constraint[] = []

  // Performance constraints
  if (/\b(within|less than|faster than|under)\s+\d+\s*(ms|seconds)\b/.test(normalized)) {
    const match = /(within|less than|faster than|under)\s+(\d+)\s*(ms|seconds)/.exec(
      original
    )
    if (match) {
      constraints.push({
        type: 'performance',
        description: `Must complete ${match[1]} ${match[2]}${match[3]}`,
      })
    }
  }

  // Compatibility constraints
  if (/\b(compatible|support|work with)\b/.test(normalized)) {
    constraints.push({
      type: 'compatibility',
      description: 'Must be compatible with existing systems',
    })
  }

  // Style constraints
  if (/\b(follow|adhere to|conform to)\s+(style|convention|pattern)\b/.test(normalized)) {
    constraints.push({
      type: 'style',
      description: 'Must follow coding style conventions',
    })
  }

  // Security constraints
  if (/\b(no|avoid|prevent)\s+(vulnerability|injection|xss)\b/.test(normalized)) {
    constraints.push({
      type: 'security',
      description: 'Must prevent security vulnerabilities',
    })
  }

  return constraints
}

/**
 * Extract context from prompt
 */
function extractContext(_normalized: string, original: string): string | undefined {
  // Look for context indicators
  const contextPatterns = [
    /(?:for|in|using|with)\s+(.+?)(?:\.|$)/i,
    /(?:context|background):\s*(.+)/i,
  ]

  for (const pattern of contextPatterns) {
    const match = pattern.exec(original)
    if (match) {
      return match[1].trim()
    }
  }

  return undefined
}

/**
 * Calculate overall confidence score
 */
function calculateConfidence(
  intent: Intent,
  entities: Entity[],
  requirements: Requirement[]
): number {
  let confidence = intent.confidence

  // More entities = higher confidence
  confidence += Math.min(entities.length * 0.1, 0.3)

  // Requirements increase confidence
  confidence += Math.min(requirements.length * 0.05, 0.2)

  return Math.min(confidence, 1.0)
}

/**
 * Generate summary of parsed prompt
 */
export function summarizeParsedPrompt(parsed: ParsedPrompt): string {
  let summary = `Intent: ${parsed.intent.action} ${parsed.intent.target}\n`
  summary += `Confidence: ${(parsed.confidence * 100).toFixed(0)}%\n\n`

  if (parsed.entities.length > 0) {
    summary += `Entities:\n`
    parsed.entities.forEach(e => {
      summary += `  - ${e.type}: ${e.value}\n`
    })
    summary += `\n`
  }

  if (parsed.requirements.length > 0) {
    summary += `Requirements:\n`
    parsed.requirements.forEach(r => {
      summary += `  - [${r.priority}] ${r.description}\n`
    })
    summary += `\n`
  }

  if (parsed.constraints.length > 0) {
    summary += `Constraints:\n`
    parsed.constraints.forEach(c => {
      summary += `  - ${c.type}: ${c.description}\n`
    })
    summary += `\n`
  }

  if (parsed.context) {
    summary += `Context: ${parsed.context}\n`
  }

  return summary
}

/**
 * Validate if prompt is clear enough
 */
export function validatePrompt(parsed: ParsedPrompt): {
  isValid: boolean
  issues: string[]
  suggestions: string[]
} {
  const issues: string[] = []
  const suggestions: string[] = []

  if (parsed.confidence < 0.5) {
    issues.push('Prompt is too vague or unclear')
    suggestions.push('Be more specific about what you want to accomplish')
  }

  if (parsed.entities.length === 0) {
    suggestions.push('Consider specifying technologies, file names, or patterns')
  }

  if (parsed.requirements.length === 0) {
    suggestions.push('Add specific requirements or expectations')
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
  }
}
