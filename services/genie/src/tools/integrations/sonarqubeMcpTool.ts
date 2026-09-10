import axios, { AxiosInstance } from 'axios'

/**
 * SonarQube MCP Tool
 * SonarQube API wrapper for code quality metrics
 */

export interface SonarQubeConfig {
  url: string
  token: string
}

export interface SonarQubeProject {
  key: string
  name: string
  qualifier: string
  visibility: string
  lastAnalysisDate?: string
}

export interface SonarQubeMeasure {
  metric: string
  value: string
  bestValue: boolean
}

export interface SonarQubeIssue {
  key: string
  rule: string
  severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO'
  component: string
  line?: number
  message: string
  type: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT'
  status: string
  creationDate: string
}

export interface QualityGateStatus {
  status: 'OK' | 'WARN' | 'ERROR'
  conditions: Array<{
    metric: string
    operator: string
    value: string
    errorThreshold: string
    actualValue: string
    status: 'OK' | 'WARN' | 'ERROR'
  }>
}

export class SonarQubeMcpTool {
  private client: AxiosInstance
  private baseUrl: string

  constructor(config: SonarQubeConfig) {
    this.baseUrl = config.url.replace(/\/$/, '')

    this.client = axios.create({
      baseURL: `${this.baseUrl}/api`,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * Get list of projects
   */
  async getProjects(): Promise<SonarQubeProject[]> {
    const response = await this.client.get('/projects/search')
    return response.data.components || []
  }

  /**
   * Get project details
   */
  async getProject(projectKey: string): Promise<SonarQubeProject> {
    const projects = await this.getProjects()
    const project = projects.find(p => p.key === projectKey)

    if (!project) {
      throw new Error(`Project ${projectKey} not found`)
    }

    return project
  }

  /**
   * Get quality metrics for a project
   */
  async getMetrics(
    projectKey: string,
    metricKeys?: string[]
  ): Promise<SonarQubeMeasure[]> {
    const metrics =
      metricKeys ||
      [
        'bugs',
        'vulnerabilities',
        'code_smells',
        'security_hotspots',
        'coverage',
        'duplicated_lines_density',
        'ncloc',
        'complexity',
        'cognitive_complexity',
        'sqale_rating',
        'reliability_rating',
        'security_rating',
      ]

    const response = await this.client.get('/measures/component', {
      params: {
        component: projectKey,
        metricKeys: metrics.join(','),
      },
    })

    return response.data.component?.measures || []
  }

  /**
   * Get quality gate status
   */
  async getQualityGateStatus(
    projectKey: string
  ): Promise<QualityGateStatus> {
    const response = await this.client.get(
      '/qualitygates/project_status',
      {
        params: {
          projectKey,
        },
      }
    )

    const projectStatus = response.data.projectStatus

    return {
      status: projectStatus.status,
      conditions: projectStatus.conditions || [],
    }
  }

  /**
   * Get issues for a project
   */
  async getIssues(
    projectKey: string,
    options: {
      severities?: string[]
      types?: string[]
      statuses?: string[]
      resolved?: boolean
      pageSize?: number
    } = {}
  ): Promise<SonarQubeIssue[]> {
    const params: Record<string, string> = {
      componentKeys: projectKey,
      ps: (options.pageSize || 100).toString(),
    }

    if (options.severities) {
      params.severities = options.severities.join(',')
    }

    if (options.types) {
      params.types = options.types.join(',')
    }

    if (options.statuses) {
      params.statuses = options.statuses.join(',')
    }

    if (options.resolved !== undefined) {
      params.resolved = options.resolved.toString()
    }

    const response = await this.client.get('/issues/search', { params })

    return response.data.issues || []
  }

  /**
   * Get code coverage
   */
  async getCoverage(projectKey: string): Promise<{
    coverage: number
    lineCoverage: number
    branchCoverage?: number
    linesToCover: number
    uncoveredLines: number
  }> {
    const measures = await this.getMetrics(projectKey, [
      'coverage',
      'line_coverage',
      'branch_coverage',
      'lines_to_cover',
      'uncovered_lines',
    ])

    const getValue = (metric: string): number => {
      const measure = measures.find(m => m.metric === metric)
      return measure ? parseFloat(measure.value) : 0
    }

    return {
      coverage: getValue('coverage'),
      lineCoverage: getValue('line_coverage'),
      branchCoverage: getValue('branch_coverage'),
      linesToCover: getValue('lines_to_cover'),
      uncoveredLines: getValue('uncovered_lines'),
    }
  }

  /**
   * Get code duplication
   */
  async getDuplication(projectKey: string): Promise<{
    duplicatedLinesDensity: number
    duplicatedBlocks: number
    duplicatedFiles: number
    duplicatedLines: number
  }> {
    const measures = await this.getMetrics(projectKey, [
      'duplicated_lines_density',
      'duplicated_blocks',
      'duplicated_files',
      'duplicated_lines',
    ])

    const getValue = (metric: string): number => {
      const measure = measures.find(m => m.metric === metric)
      return measure ? parseFloat(measure.value) : 0
    }

    return {
      duplicatedLinesDensity: getValue('duplicated_lines_density'),
      duplicatedBlocks: getValue('duplicated_blocks'),
      duplicatedFiles: getValue('duplicated_files'),
      duplicatedLines: getValue('duplicated_lines'),
    }
  }

  /**
   * Get complexity metrics
   */
  async getComplexity(projectKey: string): Promise<{
    complexity: number
    cognitiveComplexity: number
    complexityPerFunction?: number
  }> {
    const measures = await this.getMetrics(projectKey, [
      'complexity',
      'cognitive_complexity',
      'function_complexity',
    ])

    const getValue = (metric: string): number => {
      const measure = measures.find(m => m.metric === metric)
      return measure ? parseFloat(measure.value) : 0
    }

    return {
      complexity: getValue('complexity'),
      cognitiveComplexity: getValue('cognitive_complexity'),
      complexityPerFunction: getValue('function_complexity'),
    }
  }

  /**
   * Get maintainability rating
   */
  async getMaintainabilityRating(
    projectKey: string
  ): Promise<{
    rating: string
    technicalDebt: string
    technicalDebtRatio: number
    codeSmells: number
  }> {
    const measures = await this.getMetrics(projectKey, [
      'sqale_rating',
      'sqale_index',
      'sqale_debt_ratio',
      'code_smells',
    ])

    const getValue = (metric: string): string => {
      const measure = measures.find(m => m.metric === metric)
      return measure ? measure.value : '0'
    }

    return {
      rating: getValue('sqale_rating'),
      technicalDebt: getValue('sqale_index'),
      technicalDebtRatio: parseFloat(getValue('sqale_debt_ratio')),
      codeSmells: parseInt(getValue('code_smells')),
    }
  }

  /**
   * Get reliability rating
   */
  async getReliabilityRating(
    projectKey: string
  ): Promise<{
    rating: string
    bugs: number
  }> {
    const measures = await this.getMetrics(projectKey, [
      'reliability_rating',
      'bugs',
    ])

    const getValue = (metric: string): string => {
      const measure = measures.find(m => m.metric === metric)
      return measure ? measure.value : '0'
    }

    return {
      rating: getValue('reliability_rating'),
      bugs: parseInt(getValue('bugs')),
    }
  }

  /**
   * Get security rating
   */
  async getSecurityRating(
    projectKey: string
  ): Promise<{
    rating: string
    vulnerabilities: number
    securityHotspots: number
  }> {
    const measures = await this.getMetrics(projectKey, [
      'security_rating',
      'vulnerabilities',
      'security_hotspots',
    ])

    const getValue = (metric: string): string => {
      const measure = measures.find(m => m.metric === metric)
      return measure ? measure.value : '0'
    }

    return {
      rating: getValue('security_rating'),
      vulnerabilities: parseInt(getValue('vulnerabilities')),
      securityHotspots: parseInt(getValue('security_hotspots')),
    }
  }

  /**
   * Get comprehensive quality report
   */
  async getQualityReport(projectKey: string): Promise<{
    project: SonarQubeProject
    qualityGate: QualityGateStatus
    coverage: Awaited<ReturnType<typeof this.getCoverage>>
    duplication: Awaited<ReturnType<typeof this.getDuplication>>
    complexity: Awaited<ReturnType<typeof this.getComplexity>>
    maintainability: Awaited<ReturnType<typeof this.getMaintainabilityRating>>
    reliability: Awaited<ReturnType<typeof this.getReliabilityRating>>
    security: Awaited<ReturnType<typeof this.getSecurityRating>>
  }> {
    const [
      project,
      qualityGate,
      coverage,
      duplication,
      complexity,
      maintainability,
      reliability,
      security,
    ] = await Promise.all([
      this.getProject(projectKey),
      this.getQualityGateStatus(projectKey),
      this.getCoverage(projectKey),
      this.getDuplication(projectKey),
      this.getComplexity(projectKey),
      this.getMaintainabilityRating(projectKey),
      this.getReliabilityRating(projectKey),
      this.getSecurityRating(projectKey),
    ])

    return {
      project,
      qualityGate,
      coverage,
      duplication,
      complexity,
      maintainability,
      reliability,
      security,
    }
  }

  /**
   * Format quality report as text
   */
  formatQualityReport(
    report: Awaited<ReturnType<typeof this.getQualityReport>>
  ): string {
    let output = `\n${'='.repeat(60)}\n`
    output += `SonarQube Quality Report: ${report.project.name}\n`
    output += `${'='.repeat(60)}\n\n`

    output += `Quality Gate: ${report.qualityGate.status}\n\n`

    output += `Coverage:\n`
    output += `  Overall: ${report.coverage.coverage.toFixed(2)}%\n`
    output += `  Line Coverage: ${report.coverage.lineCoverage.toFixed(2)}%\n`
    if (report.coverage.branchCoverage) {
      output += `  Branch Coverage: ${report.coverage.branchCoverage.toFixed(2)}%\n`
    }
    output += `\n`

    output += `Duplication:\n`
    output += `  Duplicated Lines: ${report.duplication.duplicatedLinesDensity.toFixed(2)}%\n`
    output += `  Duplicated Blocks: ${report.duplication.duplicatedBlocks}\n`
    output += `\n`

    output += `Complexity:\n`
    output += `  Cyclomatic Complexity: ${report.complexity.complexity}\n`
    output += `  Cognitive Complexity: ${report.complexity.cognitiveComplexity}\n`
    output += `\n`

    output += `Maintainability:\n`
    output += `  Rating: ${report.maintainability.rating}\n`
    output += `  Code Smells: ${report.maintainability.codeSmells}\n`
    output += `  Technical Debt Ratio: ${report.maintainability.technicalDebtRatio.toFixed(2)}%\n`
    output += `\n`

    output += `Reliability:\n`
    output += `  Rating: ${report.reliability.rating}\n`
    output += `  Bugs: ${report.reliability.bugs}\n`
    output += `\n`

    output += `Security:\n`
    output += `  Rating: ${report.security.rating}\n`
    output += `  Vulnerabilities: ${report.security.vulnerabilities}\n`
    output += `  Security Hotspots: ${report.security.securityHotspots}\n`

    return output
  }
}

/**
 * Create SonarQube tool instance
 */
export function createSonarQubeTool(
  config: SonarQubeConfig
): SonarQubeMcpTool {
  return new SonarQubeMcpTool(config)
}
