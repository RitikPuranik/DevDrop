/**
 * AgentRouterService - Intelligent routing of user messages to specialized agents
 * Uses LeadEngineerAgent to analyze intent and select appropriate workflow
 */

import { LeadEngineerAgent } from '../agents/base/LeadEngineerAgent';
import { GenerateWorkflow } from '../workflows/GenerateWorkflow';
import { ReviewWorkflow } from '../workflows/ReviewWorkflow';
import { EnhanceWorkflow } from '../workflows/EnhanceWorkflow';

export interface AgentRouteResult {
  workflow: 'generate' | 'review' | 'enhance' | 'chat';
  selectedAgents: string[];
  reasoning: string;
  suggestions?: string[];
}

export interface RouteRequest {
  message: string;
  currentFiles?: any[];
  context?: string;
  imageUrls?: string[];
}

export class AgentRouterService {
  private leadEngineer: any; // LeadEngineerAgent instance

  constructor() {
    this.leadEngineer = null;
  }

  /**
   * Initialize the LeadEngineerAgent
   */
  private async ensureLeadEngineer() {
    if (!this.leadEngineer) {
      console.log('[AgentRouter] Initializing LeadEngineerAgent...');
      // LeadEngineerAgent is a Promise from AgentBuilder.build()
      this.leadEngineer = await LeadEngineerAgent;
    }
  }

  /**
   * Analyze user message and route to appropriate workflow
   */
  async route(request: RouteRequest): Promise<AgentRouteResult> {
    await this.ensureLeadEngineer();

    console.log('[AgentRouter] Analyzing message:', request.message);

    // Prepare context for LeadEngineer
    const context = this.buildContext(request);

    try {
      // Use LeadEngineerAgent to analyze and decide
      // LeadEngineerAgent returns an object with a runner
      const { runner } = this.leadEngineer;
      const analysis = await runner.ask({
        task: 'analyze_and_route',
        userMessage: request.message,
        context,
      });

      console.log('[AgentRouter] LeadEngineer analysis:', analysis);

      // Parse the analysis and determine workflow
      const result = this.parseAnalysis(analysis, request);

      console.log('[AgentRouter] Routing decision:', result);

      return result;
    } catch (error) {
      console.error('[AgentRouter] Routing error:', error);

      // Fallback: Use simple keyword matching
      return this.fallbackRouting(request);
    }
  }

  /**
   * Build context string for LeadEngineer
   */
  private buildContext(request: RouteRequest): string {
    const parts: string[] = [];

    if (request.currentFiles && request.currentFiles.length > 0) {
      parts.push(`Current files: ${request.currentFiles.length} files in project`);
      parts.push(`File types: ${this.getFileTypes(request.currentFiles).join(', ')}`);
    }

    if (request.context) {
      parts.push(`Additional context: ${request.context}`);
    }

    if (request.imageUrls && request.imageUrls.length > 0) {
      parts.push(`Images attached: ${request.imageUrls.length}`);
    }

    return parts.join('\n');
  }

  /**
   * Get unique file types from files
   */
  private getFileTypes(files: any[]): string[] {
    const extensions = new Set<string>();
    files.forEach(file => {
      const ext = file.path.split('.').pop();
      if (ext) extensions.add(ext);
    });
    return Array.from(extensions);
  }

  /**
   * Parse LeadEngineer analysis into routing decision
   */
  private parseAnalysis(analysis: any, _request: RouteRequest): AgentRouteResult {

    // Extract agents and workflow from analysis
    let workflow: 'generate' | 'review' | 'enhance' | 'chat' = 'chat';
    let selectedAgents: string[] = [];
    let reasoning = '';
    let suggestions: string[] = [];

    // Try to parse structured response
    if (typeof analysis === 'object') {
      workflow = analysis.workflow || workflow;
      selectedAgents = analysis.agents || [];
      reasoning = analysis.reasoning || '';
      suggestions = analysis.suggestions || [];
    } else if (typeof analysis === 'string') {
      reasoning = analysis;
      
      // Parse from text
      if (analysis.includes('generate') || analysis.includes('create')) {
        workflow = 'generate';
        selectedAgents = ['CodeGenerator', 'SpecInterpreter'];
      } else if (analysis.includes('review') || analysis.includes('analyze')) {
        workflow = 'review';
        selectedAgents = ['BugHunter', 'SecuritySentinel', 'PerformanceProfiler'];
      } else if (analysis.includes('refactor') || analysis.includes('optimize') || analysis.includes('improve')) {
        workflow = 'enhance';
        selectedAgents = ['PerformanceProfiler', 'SecuritySentinel'];
      }
    }

    // If no clear workflow determined, use fallback
    if (workflow === 'chat') {
      return this.fallbackRouting(_request);
    }

    // Add suggestions based on workflow
    if (workflow === 'generate') {
      suggestions.push('Would you like to preview the generated code?');
      suggestions.push('Deploy to Fly.io when ready?');
      suggestions.push('Generate documentation with DocWeaver?');
    } else if (workflow === 'review') {
      suggestions.push('Would you like to auto-fix the detected issues?');
      suggestions.push('Generate a detailed security report?');
    } else if (workflow === 'enhance') {
      suggestions.push('Preview the optimized code?');
      suggestions.push('Run performance benchmarks?');
    }

    return {
      workflow,
      selectedAgents,
      reasoning,
      suggestions,
    };
  }

  /**
   * Fallback routing using keyword matching
   */
  private fallbackRouting(request: RouteRequest): AgentRouteResult {
    const message = request.message.toLowerCase();
    const hasFiles = request.currentFiles && request.currentFiles.length > 0;

    // Code generation keywords
    const generateKeywords = [
      'generate', 'create', 'build', 'make', 'write', 'develop',
      'implement', 'code', 'program', 'app', 'application', 'website',
      'component', 'function', 'class', 'api', 'endpoint'
    ];

    // Review keywords
    const reviewKeywords = [
      'review', 'analyze', 'check', 'inspect', 'audit', 'examine',
      'find bugs', 'security', 'vulnerability', 'issue', 'problem',
      'error', 'bug', 'performance', 'quality'
    ];

    // Refactor/enhance keywords
    const enhanceKeywords = [
      'refactor', 'optimize', 'improve', 'enhance', 'clean',
      'restructure', 'reorganize', 'simplify', 'better', 'fix',
      'upgrade', 'modernize', 'performance'
    ];

    // Test keywords
    const testKeywords = [
      'test', 'testing', 'unit test', 'integration test', 'e2e',
      'coverage', 'assertion', 'mock', 'spec'
    ];

    // Documentation keywords
    const docKeywords = [
      'document', 'documentation', 'docs', 'readme', 'comment',
      'explain', 'describe', 'api docs', 'jsdoc'
    ];

    // Count matches
    const generateCount = generateKeywords.filter(kw => message.includes(kw)).length;
    const reviewCount = reviewKeywords.filter(kw => message.includes(kw)).length;
    const enhanceCount = enhanceKeywords.filter(kw => message.includes(kw)).length;
    const testCount = testKeywords.filter(kw => message.includes(kw)).length;
    const docCount = docKeywords.filter(kw => message.includes(kw)).length;

    console.log('[AgentRouter] Keyword analysis:', {
      generate: generateCount,
      review: reviewCount,
      enhance: enhanceCount,
      test: testCount,
      doc: docCount,
      hasFiles,
    });

    // Determine workflow based on keywords and context
    if (!hasFiles) {
      // No files = likely want to generate new code
      return {
        workflow: 'generate',
        selectedAgents: ['SpecInterpreter', 'CodeGenerator'],
        reasoning: 'User wants to generate new code (no existing files)',
        suggestions: [
          'Would you like to preview the generated code?',
          'Deploy to Fly.io when ready?',
          'Generate documentation with DocWeaver?',
        ],
      };
    }

    // With files - decide based on keywords
    if (reviewCount > generateCount && reviewCount > enhanceCount) {
      return {
        workflow: 'review',
        selectedAgents: ['BugHunter', 'SecuritySentinel', 'PerformanceProfiler'],
        reasoning: 'User wants to review/analyze existing code',
        suggestions: [
          'Would you like to auto-fix the detected issues?',
          'Generate a detailed security report?',
          'Run performance benchmarks?',
        ],
      };
    }

    if (enhanceCount > generateCount && enhanceCount > reviewCount) {
      return {
        workflow: 'enhance',
        selectedAgents: ['PerformanceProfiler', 'SecuritySentinel'],
        reasoning: 'User wants to refactor/optimize existing code',
        suggestions: [
          'Preview the optimized code?',
          'Run performance benchmarks?',
          'Generate a refactoring report?',
        ],
      };
    }

    if (testCount > 0) {
      return {
        workflow: 'enhance',
        selectedAgents: ['TestCrafter'],
        reasoning: 'User wants to generate tests',
        suggestions: [
          'Run the generated tests?',
          'Check test coverage?',
          'Generate more test cases?',
        ],
      };
    }

    if (docCount > 0) {
      return {
        workflow: 'enhance',
        selectedAgents: ['DocWeaver'],
        reasoning: 'User wants to generate documentation',
        suggestions: [
          'Preview the documentation?',
          'Generate API reference?',
          'Create README file?',
        ],
      };
    }

    // Default to chat/modification if files exist
    if (hasFiles) {
      return {
        workflow: 'enhance',
        selectedAgents: ['CodeGenerator'],
        reasoning: 'User wants to modify existing code',
        suggestions: [
          'Preview the changes?',
          'Compare before and after?',
        ],
      };
    }

    // Final fallback - generate new code
    return {
      workflow: 'generate',
      selectedAgents: ['SpecInterpreter', 'CodeGenerator'],
      reasoning: 'Default to code generation',
      suggestions: [
        'Would you like to preview the generated code?',
        'Deploy to Fly.io when ready?',
      ],
    };
  }

  /**
   * Execute the selected workflow
   */
  async executeWorkflow(
    route: AgentRouteResult,
    request: RouteRequest,
    additionalParams?: any
  ): Promise<any> {
    console.log(`[AgentRouter] Executing workflow: ${route.workflow}`);

    try {
      switch (route.workflow) {
        case 'generate':
          return await this.executeGenerateWorkflow(request, additionalParams);

        case 'review':
          return await this.executeReviewWorkflow(request, additionalParams);

        case 'enhance':
          return await this.executeEnhanceWorkflow(request, additionalParams);

        case 'chat':
        default:
          // For simple chat modifications, use CodeGenerator directly
          return await this.executeChatWorkflow(request, additionalParams);
      }
    } catch (error) {
      console.error(`[AgentRouter] Workflow execution error:`, error);
      throw error;
    }
  }

  /**
   * Execute Generate Workflow
   */
  private async executeGenerateWorkflow(request: RouteRequest, params?: any): Promise<any> {
    const workflow = new GenerateWorkflow();
    
    return await workflow.run({
      prompt: request.message,
      projectContext: request.context,
      targetLanguage: params?.targetLanguage, // Auto-detect if not provided
      complexity: params?.complexity || 'moderate',
      agents: params?.agents || ['CodeGenerator'],
      imageUrls: request.imageUrls,
    });
  }

  /**
   * Execute Review Workflow
   */
  private async executeReviewWorkflow(request: RouteRequest, params?: any): Promise<any> {
    const workflow = new ReviewWorkflow();
    
    return await workflow.run({
      code: request.currentFiles || [],
      language: params?.language, // Auto-detect from file extensions if not provided
      options: {
        checkSecurity: true,
        checkPerformance: true,
        checkStyle: true,
        checkBugs: true,
      },
    });
  }

  /**
   * Execute Enhance Workflow
   */
  private async executeEnhanceWorkflow(request: RouteRequest, params?: any): Promise<any> {
    const workflow = new EnhanceWorkflow();
    
    return await workflow.run({
      code: request.currentFiles || [],
      language: params?.language, // Auto-detect from file extensions
      improvements: request.message,
      agents: params?.agents || ['PerformanceProfiler', 'SecuritySentinel'],
    });
  }

  /**
   * Execute Chat Workflow (simple modifications)
   */
  private async executeChatWorkflow(request: RouteRequest, params?: any): Promise<any> {
    // For simple chat, use CodeGenerator to modify existing code
    const workflow = new GenerateWorkflow();
    
    return await workflow.run({
      prompt: request.message,
      projectContext: request.context,
      targetLanguage: params?.targetLanguage, // Auto-detect based on prompt
      complexity: 'simple',
      agents: ['CodeGenerator'],
      existingFiles: request.currentFiles,
      imageUrls: request.imageUrls,
    });
  }
}

// Export singleton instance
export const agentRouter = new AgentRouterService();
