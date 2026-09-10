import { AgentBuilder, Agent } from '@iqai/adk'
import { createHighThinkingPlanner } from './thinking'
import {
  parseCode,
  scaffoldCode,
  findFunctionCalls,
  findLongFunctions,
  addFunctionComment,
  generateFunctionTest,
  runTests,
  calculateCyclomaticComplexity,
  parsePrompt,
  GitHubMcpTool,
  SonarQubeMcpTool,
  getToolsByCategory,
  TOOL_CATEGORIES,
} from '../../tools'

/**
 * Agent configuration options
 */
export interface AgentConfig {
  name: string
  model?: string
  systemPrompt: string
  tools?: string[]
  temperature?: number
  maxTokens?: number
  topP?: number
  presencePenalty?: number
  frequencyPenalty?: number
  metadata?: Record<string, any>
}

/**
 * Agent role types for quick configuration
 */
export enum AgentRole {
  LEAD_ENGINEER = 'LEAD_ENGINEER',
  SPEC_INTERPRETER = 'SPEC_INTERPRETER',
  CODE_GENERATOR = 'CODE_GENERATOR',
  BUG_HUNTER = 'BUG_HUNTER',
  SECURITY_SENTINEL = 'SECURITY_SENTINEL',
  PERFORMANCE_PROFILER = 'PERFORMANCE_PROFILER',
  TEST_CRAFTER = 'TEST_CRAFTER',
  DOC_WEAVER = 'DOC_WEAVER',
}

/**
 * Default models for different agent types
 * Coding agents use gemini-2.5-flash for fast, quality code generation
 * All agents use Google Gemini 2.5 Flash
 */
const DEFAULT_MODELS = {
  // Coding agents - use gemini-2.5-flash for fast, quality code generation
  [AgentRole.LEAD_ENGINEER]: 'gemini-2.5-flash',
  [AgentRole.SPEC_INTERPRETER]: 'gemini-2.5-flash',
  [AgentRole.CODE_GENERATOR]: 'gemini-2.5-flash',
  [AgentRole.TEST_CRAFTER]: 'gemini-2.5-flash',
  // All agents - use Google Gemini 2.5 Flash
  [AgentRole.BUG_HUNTER]: 'gemini-2.5-flash',
  [AgentRole.SECURITY_SENTINEL]: 'gemini-2.5-flash',
  [AgentRole.PERFORMANCE_PROFILER]: 'gemini-2.5-flash',
  [AgentRole.DOC_WEAVER]: 'gemini-2.5-flash',
}

/**
 * Tool registry mapping tool names to actual tool instances
 */
const TOOL_REGISTRY = {
  codeParseTool: parseCode,
  codeScaffoldTool: scaffoldCode,
  astQueryTool: findFunctionCalls,
  patternMatcherTool: findLongFunctions,
  commentInserterTool: addFunctionComment,
  testGenTool: generateFunctionTest,
  testExecutorTool: runTests,
  complexityCalculator: calculateCyclomaticComplexity,
  promptParserTool: parsePrompt,
  githubMcpTool: GitHubMcpTool,
  sonarqubeMcpTool: SonarQubeMcpTool,
} as const

/**
 * AgentFactory - responsible for creating and configuring agents
 * Provides a centralized way to instantiate agents with proper tool registration
 */
export class AgentFactory {
  private static instance: AgentFactory

  /**
   * Get singleton instance
   */
  static getInstance(): AgentFactory {
    if (!AgentFactory.instance) {
      AgentFactory.instance = new AgentFactory()
    }
    return AgentFactory.instance
  }

  /**
   * Create a custom agent with specified configuration
   */
  async createAgent(config: AgentConfig): Promise<Agent> {
    const builder = AgentBuilder.create(config.name)
      .withModel(config.model || 'gemini-2.5-flash')
      .withPlanner(createHighThinkingPlanner())
      .withInstruction(config.systemPrompt)

    // Register tools if specified
    if (config.tools && config.tools.length > 0) {
      const toolInstances = this.resolveTools(config.tools)
      if (toolInstances.length > 0) {
        // For now, we'll skip tools since the AgentBuilder API needs proper BaseTool instances
        // TODO: Implement proper tool conversion to BaseTool interface
        // builder.withTools(toolInstances)
      }
    }

    // Note: AgentBuilder doesn't have withTemperature, withMaxTokens, etc. methods
    // These parameters would need to be set on the model configuration instead
    // TODO: Implement model parameter configuration

    const { agent } = await builder.build()
    return agent as Agent
  }

  /**
   * Create an agent based on predefined role
   */
  async createAgentByRole(role: AgentRole, customConfig?: Partial<AgentConfig>): Promise<Agent> {
    const baseConfig = this.getRoleConfig(role)
    const mergedConfig = {
      ...baseConfig,
      ...customConfig,
      name: customConfig?.name || baseConfig.name,
      systemPrompt: customConfig?.systemPrompt || baseConfig.systemPrompt,
    }

    return this.createAgent(mergedConfig)
  }

  /**
   * Create the Lead Engineer Agent
   */
  async createLeadEngineerAgent(customConfig?: Partial<AgentConfig>): Promise<Agent> {
    return this.createAgentByRole(AgentRole.LEAD_ENGINEER, customConfig)
  }

  /**
   * Create the Spec Interpreter Agent
   */
  async createSpecInterpreterAgent(customConfig?: Partial<AgentConfig>): Promise<Agent> {
    return this.createAgentByRole(AgentRole.SPEC_INTERPRETER, customConfig)
  }

  /**
   * Create the Code Generator Agent
   */
  async createCodeGeneratorAgent(customConfig?: Partial<AgentConfig>): Promise<Agent> {
    return this.createAgentByRole(AgentRole.CODE_GENERATOR, customConfig)
  }

  /**
   * Create the Bug Hunter Agent
   */
  async createBugHunterAgent(customConfig?: Partial<AgentConfig>): Promise<Agent> {
    return this.createAgentByRole(AgentRole.BUG_HUNTER, customConfig)
  }

  /**
   * Create the Security Sentinel Agent
   */
  async createSecuritySentinelAgent(customConfig?: Partial<AgentConfig>): Promise<Agent> {
    return this.createAgentByRole(AgentRole.SECURITY_SENTINEL, customConfig)
  }

  /**
   * Create the Performance Profiler Agent
   */
  async createPerformanceProfilerAgent(customConfig?: Partial<AgentConfig>): Promise<Agent> {
    return this.createAgentByRole(AgentRole.PERFORMANCE_PROFILER, customConfig)
  }

  /**
   * Create the Test Crafter Agent
   */
  async createTestCrafterAgent(customConfig?: Partial<AgentConfig>): Promise<Agent> {
    return this.createAgentByRole(AgentRole.TEST_CRAFTER, customConfig)
  }

  /**
   * Create the Doc Weaver Agent
   */
  async createDocWeaverAgent(customConfig?: Partial<AgentConfig>): Promise<Agent> {
    return this.createAgentByRole(AgentRole.DOC_WEAVER, customConfig)
  }

  /**
   * Create multiple agents at once
   */
  async createAgentTeam(roles: AgentRole[]): Promise<Map<AgentRole, Agent>> {
    const team = new Map<AgentRole, Agent>()

    for (const role of roles) {
      const agent = await this.createAgentByRole(role)
      team.set(role, agent)
    }

    return team
  }

  /**
   * Create a complete development workflow team
   */
  async createDevelopmentTeam(): Promise<Map<AgentRole, Agent>> {
    return this.createAgentTeam([
      AgentRole.LEAD_ENGINEER,
      AgentRole.SPEC_INTERPRETER,
      AgentRole.CODE_GENERATOR,
      AgentRole.TEST_CRAFTER,
      AgentRole.DOC_WEAVER,
    ])
  }

  /**
   * Create a review/quality assurance team
   */
  async createReviewTeam(): Promise<Map<AgentRole, Agent>> {
    return this.createAgentTeam([
      AgentRole.BUG_HUNTER,
      AgentRole.SECURITY_SENTINEL,
      AgentRole.PERFORMANCE_PROFILER,
    ])
  }

  /**
   * Get configuration for a specific role
   */
  private getRoleConfig(role: AgentRole): AgentConfig {
    const configs: Record<AgentRole, AgentConfig> = {
      [AgentRole.LEAD_ENGINEER]: {
        name: 'LeadEngineerAgent',
        model: DEFAULT_MODELS[AgentRole.LEAD_ENGINEER],
        systemPrompt: `As the Lead Engineer, your primary responsibility is to orchestrate a team of specialized AI agents to successfully complete complex software development tasks. You will receive a high-level user request, analyze it, and break it down into a sequence of actionable steps. For each step, you will delegate the work to the most appropriate specialized agent (e.g., CodeGeneratorAgent, TestCrafterAgent, etc.). You must monitor the progress of the workflow, ensure the quality of the output from each agent, and make the final decision on the generated solution.`,
        tools: [],
      },
      [AgentRole.SPEC_INTERPRETER]: {
        name: 'SpecInterpreterAgent',
        model: DEFAULT_MODELS[AgentRole.SPEC_INTERPRETER],
        systemPrompt: `You are a Spec Interpreter Agent. You parse user requirements and technical specifications to create detailed, actionable instructions for code generation. You must use the promptParserTool to extract structured information from natural language.`,
        tools: ['promptParserTool'],
      },
      [AgentRole.CODE_GENERATOR]: {
        name: 'CodeGeneratorAgent',
        model: DEFAULT_MODELS[AgentRole.CODE_GENERATOR],
        systemPrompt: `You are a Code Generator Agent. You write high-quality, production-ready code based on provided requirements. You must use the codeParseTool to analyze existing code and ensure your generated code integrates correctly. You also use codeScaffoldTool to generate boilerplate code.`,
        tools: ['codeParseTool', 'codeScaffoldTool', 'astQueryTool'],
      },
      [AgentRole.BUG_HUNTER]: {
        name: 'BugHunterAgent',
        model: DEFAULT_MODELS[AgentRole.BUG_HUNTER],
        systemPrompt: `You are a Bug Hunter Agent. Your mission is to find bugs and security vulnerabilities in code. You will be given a piece of code and must analyze it for potential issues using pattern matching and AST analysis.`,
        tools: ['codeParseTool', 'astQueryTool', 'patternMatcherTool'],
      },
      [AgentRole.SECURITY_SENTINEL]: {
        name: 'SecuritySentinelAgent',
        model: DEFAULT_MODELS[AgentRole.SECURITY_SENTINEL],
        systemPrompt: `You are a Security Sentinel Agent. You analyze code for security vulnerabilities, including SQL injection, XSS, authentication issues, and more. You use AST analysis and pattern matching to identify security risks.`,
        tools: ['astQueryTool', 'patternMatcherTool', 'codeParseTool'],
      },
      [AgentRole.PERFORMANCE_PROFILER]: {
        name: 'PerformanceProfilerAgent',
        model: DEFAULT_MODELS[AgentRole.PERFORMANCE_PROFILER],
        systemPrompt: `You are a Performance Profiler Agent. You analyze code for performance issues such as inefficient algorithms, memory leaks, and optimization opportunities. You use complexity analysis to identify bottlenecks.`,
        tools: ['complexityCalculator', 'patternMatcherTool', 'astQueryTool'],
      },
      [AgentRole.TEST_CRAFTER]: {
        name: 'TestCrafterAgent',
        model: DEFAULT_MODELS[AgentRole.TEST_CRAFTER],
        systemPrompt: `You are a Test Crafter Agent. You write comprehensive unit, integration, and end-to-end tests. You must use the testGenTool to generate test skeletons and testExecutorTool to run tests.`,
        tools: ['testGenTool', 'testExecutorTool', 'codeParseTool'],
      },
      [AgentRole.DOC_WEAVER]: {
        name: 'DocWeaverAgent',
        model: DEFAULT_MODELS[AgentRole.DOC_WEAVER],
        systemPrompt: `You are a Doc Weaver Agent. You write clear, comprehensive documentation for code, including TSDoc comments, README files, and API documentation. You use commentInserterTool to add documentation to code.`,
        tools: ['commentInserterTool', 'codeParseTool', 'astQueryTool'],
      },
    }

    return configs[role]
  }

  /**
   * Resolve tool names to actual tool instances
   */
  private resolveTools(toolNames: string[]): any[] {
    const resolvedTools: any[] = []

    for (const toolName of toolNames) {
      // Check if it's a category (e.g., "CODE_MANIPULATION")
      if (toolName in TOOL_CATEGORIES) {
        const categoryTools = getToolsByCategory(
          toolName as keyof typeof TOOL_CATEGORIES
        )
        for (const categoryTool of categoryTools) {
          const tool = TOOL_REGISTRY[categoryTool as keyof typeof TOOL_REGISTRY]
          if (tool) {
            resolvedTools.push(tool)
          }
        }
      } else {
        // It's a specific tool name
        const tool = TOOL_REGISTRY[toolName as keyof typeof TOOL_REGISTRY]
        if (tool) {
          resolvedTools.push(tool)
        } else {
          console.warn(`Tool "${toolName}" not found in registry`)
        }
      }
    }

    return resolvedTools
  }

  /**
   * List all available agent roles
   */
  listAvailableRoles(): AgentRole[] {
    return Object.values(AgentRole)
  }

  /**
   * Get metadata about a specific role
   */
  getRoleMetadata(role: AgentRole): {
    name: string
    model: string
    description: string
    tools: string[]
  } {
    const config = this.getRoleConfig(role)
    return {
      name: config.name,
      model: config.model || 'gemini-2.5-flash',
      description: config.systemPrompt,
      tools: config.tools || [],
    }
  }

  /**
   * Clone an agent with modified configuration
   */
  async cloneAgent(agent: Agent, overrides: Partial<AgentConfig>): Promise<Agent> {
    // Note: This requires the agent to expose its config
    // For now, create a new agent with merged config
    // TODO: Extract actual config from the agent parameter when available
    void agent // Suppress unused parameter warning - will be used when agent config extraction is implemented
    
    const newConfig: AgentConfig = {
      name: overrides.name || 'ClonedAgent',
      systemPrompt: overrides.systemPrompt || '',
      model: overrides.model,
      tools: overrides.tools,
      temperature: overrides.temperature,
      maxTokens: overrides.maxTokens,
      topP: overrides.topP,
      presencePenalty: overrides.presencePenalty,
      frequencyPenalty: overrides.frequencyPenalty,
      metadata: overrides.metadata,
    }

    return this.createAgent(newConfig)
  }

  /**
   * Validate agent configuration
   */
  validateConfig(config: AgentConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!config.name || config.name.trim().length === 0) {
      errors.push('Agent name is required')
    }

    if (!config.systemPrompt || config.systemPrompt.trim().length === 0) {
      errors.push('System prompt is required')
    }

    if (config.temperature !== undefined) {
      if (config.temperature < 0 || config.temperature > 2) {
        errors.push('Temperature must be between 0 and 2')
      }
    }

    if (config.maxTokens !== undefined) {
      if (config.maxTokens < 1 || config.maxTokens > 100000) {
        errors.push('Max tokens must be between 1 and 100000')
      }
    }

    if (config.topP !== undefined) {
      if (config.topP < 0 || config.topP > 1) {
        errors.push('Top P must be between 0 and 1')
      }
    }

    if (config.tools) {
      for (const tool of config.tools) {
        if (
          !(tool in TOOL_REGISTRY) &&
          !(tool in TOOL_CATEGORIES)
        ) {
          errors.push(`Unknown tool or category: ${tool}`)
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}

// Export singleton instance for convenience
export const agentFactory = AgentFactory.getInstance()