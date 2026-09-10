/**
 * Tool Registry
 * Central export point for all tools
 */

// Code Manipulation Tools
export * from './code/codeParseTool'
export * from './code/codeScaffoldTool'
export * from './code/astQueryTool'
export * from './code/patternMatcherTool'
export * from './code/commentInserterTool'

// Testing Tools
export * from './testing/testGenTool'
export * from './testing/testExecutorTool'

// Analysis Tools
export * from './analysis/complexityCalculator'
export * from './analysis/promptParserTool'

// Integration Tools
export * from './integrations/githubMcpTool'
export * from './integrations/sonarqubeMcpTool'

// Generation Tools
export * from './generation/imageGenerationTool'

/**
 * Tool categories for discovery
 */
export const TOOL_CATEGORIES = {
  CODE_MANIPULATION: [
    'codeParseTool',
    'codeScaffoldTool',
    'astQueryTool',
    'patternMatcherTool',
    'commentInserterTool',
  ],
  TESTING: ['testGenTool', 'testExecutorTool'],
  ANALYSIS: ['complexityCalculator', 'promptParserTool'],
  INTEGRATIONS: ['githubMcpTool', 'sonarqubeMcpTool'],
  GENERATION: ['imageGenerationTool'],
} as const

/**
 * Tool metadata for agents
 */
export const TOOL_METADATA = {
  // Code tools
  codeParseTool: {
    name: 'Code Parser',
    description: 'Parse TypeScript/JavaScript code and extract AST information',
    category: 'CODE_MANIPULATION',
    capabilities: [
      'Extract functions, classes, interfaces',
      'Parse imports and exports',
      'Find symbols by name',
    ],
  },
  codeScaffoldTool: {
    name: 'Code Scaffolder',
    description: 'Generate boilerplate code from templates',
    category: 'CODE_MANIPULATION',
    capabilities: [
      'Generate functions, classes, interfaces',
      'Create React components',
      'Scaffold services and repositories',
    ],
  },
  astQueryTool: {
    name: 'AST Query',
    description: 'Query TypeScript AST for specific symbols and patterns',
    category: 'CODE_MANIPULATION',
    capabilities: [
      'Find function calls',
      'Locate imports',
      'Search for type references',
      'Detect unused imports',
    ],
  },
  patternMatcherTool: {
    name: 'Pattern Matcher',
    description: 'Find code patterns and refactoring opportunities',
    category: 'CODE_MANIPULATION',
    capabilities: [
      'Detect long functions',
      'Find deeply nested code',
      'Identify magic numbers',
      'Locate console.log statements',
    ],
  },
  commentInserterTool: {
    name: 'Comment Inserter',
    description: 'Add TSDoc comments to code',
    category: 'CODE_MANIPULATION',
    capabilities: [
      'Generate function comments',
      'Add class documentation',
      'Create file headers',
      'Update existing JSDoc',
    ],
  },

  // Testing tools
  testGenTool: {
    name: 'Test Generator',
    description: 'Generate Jest/Vitest tests from code',
    category: 'TESTING',
    capabilities: [
      'Generate function tests',
      'Create class test suites',
      'Generate integration tests',
      'Create test mocks',
    ],
  },
  testExecutorTool: {
    name: 'Test Executor',
    description: 'Run Jest tests programmatically',
    category: 'TESTING',
    capabilities: [
      'Execute test suites',
      'Generate coverage reports',
      'Validate coverage thresholds',
      'Format test results',
    ],
  },

  // Analysis tools
  complexityCalculator: {
    name: 'Complexity Calculator',
    description: 'Calculate code complexity metrics',
    category: 'ANALYSIS',
    capabilities: [
      'Cyclomatic complexity',
      'Cognitive complexity',
      'Halstead metrics',
      'Maintainability index',
    ],
  },
  promptParserTool: {
    name: 'Prompt Parser',
    description: 'Parse natural language prompts and extract intent',
    category: 'ANALYSIS',
    capabilities: [
      'Extract action and target',
      'Identify entities',
      'Parse requirements',
      'Detect constraints',
    ],
  },

  // Integration tools
  githubMcpTool: {
    name: 'GitHub Integration',
    description: 'Interact with GitHub via Octokit',
    category: 'INTEGRATIONS',
    capabilities: [
      'Get repository info',
      'Create pull requests',
      'Manage issues',
      'Read/write files',
    ],
  },
  sonarqubeMcpTool: {
    name: 'SonarQube Integration',
    description: 'Get code quality metrics from SonarQube',
    category: 'INTEGRATIONS',
    capabilities: [
      'Get quality metrics',
      'Check quality gates',
      'List issues',
      'Generate quality reports',
    ],
  },

  // Generation tools
  imageGenerationTool: {
    name: 'Image Generator (Runware)',
    description: 'Generate AI images for websites using Runware\'s high-performance API (model: runware:101@1)',
    category: 'GENERATION',
    capabilities: [
      'Generate product photos',
      'Create hero images',
      'Generate backgrounds',
      'Create visual content',
      'Multiple image generation',
      'Automatic cloud upload',
      'Real-time WebSocket processing',
      'Fast generation with Runware',
    ],
  },
} as const

/**
 * Get all tools in a category
 */
export function getToolsByCategory(
  category: keyof typeof TOOL_CATEGORIES
): string[] {
  return TOOL_CATEGORIES[category] as unknown as string[]
}

/**
 * Get tool metadata
 */
export function getToolMetadata(toolName: string) {
  return TOOL_METADATA[toolName as keyof typeof TOOL_METADATA]
}

/**
 * List all available tools
 */
export function listAllTools(): Array<{
  name: string
  description: string
  category: string
  capabilities: string[]
}> {
  return Object.entries(TOOL_METADATA).map(([_key, metadata]) => ({
    name: metadata.name,
    description: metadata.description,
    category: metadata.category,
    capabilities: [...metadata.capabilities], // Convert readonly array to mutable array
  }))
}

/**
 * Tool discovery - find tools by capability
 */
export function findToolsByCapability(searchTerm: string): string[] {
  const normalizedSearch = searchTerm.toLowerCase()

  return Object.entries(TOOL_METADATA)
    .filter(([_, metadata]) => {
      const inDescription = metadata.description
        .toLowerCase()
        .includes(normalizedSearch)
      const inCapabilities = metadata.capabilities.some(cap =>
        cap.toLowerCase().includes(normalizedSearch)
      )
      return inDescription || inCapabilities
    })
    .map(([key]) => key)
}
