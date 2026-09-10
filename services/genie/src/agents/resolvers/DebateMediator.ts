import { Agent } from '@iqai/adk'

/**
 * Agent opinion/proposal for debate resolution
 */
export interface AgentProposal {
  agentId: string
  agentName: string
  proposal: string
  code?: string
  rationale: string
  confidence: number // 0-1
  pros: string[]
  cons: string[]
  metadata?: Record<string, any>
}

/**
 * Debate context with all agent inputs
 */
export interface DebateContext {
  topic: string
  description: string
  proposals: AgentProposal[]
  constraints?: string[]
  criteria?: string[] // Evaluation criteria
  metadata?: Record<string, any>
}

/**
 * Resolved consensus from debate
 */
export interface DebateResolution {
  winner: AgentProposal
  votes: Map<string, number> // agentId -> vote count
  reasoning: string
  consensus: number // 0-1, how strong the consensus is
  alternatives: AgentProposal[] // Other proposals ranked by votes
  timestamp: Date
}

/**
 * Voting strategy for debate resolution
 */
export enum VotingStrategy {
  WEIGHTED = 'weighted', // Votes weighted by agent confidence
  MAJORITY = 'majority', // Simple majority wins
  CONSENSUS = 'consensus', // Requires >75% agreement
  LEAD_DECISION = 'lead_decision', // Lead agent makes final call
  SCORE_BASED = 'score_based', // Evaluated by scoring criteria
}

/**
 * DebateMediator - Mediates debates between agents to reach consensus
 * Uses voting mechanisms and LLM-powered decision making to resolve disagreements
 */
export class DebateMediator {
  private leadAgent?: Agent
  private votingStrategy: VotingStrategy

  constructor(config?: {
    leadAgent?: Agent
    votingStrategy?: VotingStrategy
  }) {
    this.leadAgent = config?.leadAgent
    this.votingStrategy = config?.votingStrategy || VotingStrategy.WEIGHTED
  }

  /**
   * Resolve a debate between multiple agent proposals
   */
  async resolveDebate(context: DebateContext): Promise<DebateResolution> {
    if (context.proposals.length === 0) {
      throw new Error('Cannot resolve debate with no proposals')
    }

    // Single proposal - automatic consensus
    if (context.proposals.length === 1) {
      return {
        winner: context.proposals[0],
        votes: new Map([[context.proposals[0].agentId, 1]]),
        reasoning: 'Single proposal - automatic acceptance',
        consensus: 1.0,
        alternatives: [],
        timestamp: new Date(),
      }
    }

    // Apply voting strategy
    switch (this.votingStrategy) {
      case VotingStrategy.WEIGHTED:
        return this.resolveByWeightedVoting(context)
      case VotingStrategy.MAJORITY:
        return this.resolveByMajority(context)
      case VotingStrategy.CONSENSUS:
        return this.resolveByConsensus(context)
      case VotingStrategy.LEAD_DECISION:
        return this.resolveByLeadDecision(context)
      case VotingStrategy.SCORE_BASED:
        return this.resolveByScoring(context)
      default:
        return this.resolveByWeightedVoting(context)
    }
  }

  /**
   * Weighted voting - votes weighted by agent confidence scores
   */
  private async resolveByWeightedVoting(
    context: DebateContext
  ): Promise<DebateResolution> {
    const votes = new Map<string, number>()

    // Calculate weighted scores
    for (const proposal of context.proposals) {
      const weight = proposal.confidence
      votes.set(proposal.agentId, weight)
    }

    // Find winner
    let maxScore = 0
    let winnerProposal: AgentProposal | null = null

    for (const proposal of context.proposals) {
      const score = votes.get(proposal.agentId) || 0
      if (score > maxScore) {
        maxScore = score
        winnerProposal = proposal
      }
    }

    if (!winnerProposal) {
      winnerProposal = context.proposals[0]
    }

    // Calculate consensus strength
    const totalWeight = Array.from(votes.values()).reduce((a, b) => a + b, 0)
    const consensus = totalWeight > 0 ? maxScore / totalWeight : 0

    // Rank alternatives
    const alternatives = context.proposals
      .filter(p => p.agentId !== winnerProposal!.agentId)
      .sort((a, b) => {
        const scoreA = votes.get(a.agentId) || 0
        const scoreB = votes.get(b.agentId) || 0
        return scoreB - scoreA
      })

    return {
      winner: winnerProposal,
      votes,
      reasoning: `Selected proposal with highest confidence-weighted score: ${maxScore.toFixed(2)}`,
      consensus,
      alternatives,
      timestamp: new Date(),
    }
  }

  /**
   * Simple majority voting
   */
  private async resolveByMajority(
    context: DebateContext
  ): Promise<DebateResolution> {
    // Each proposal gets equal vote
    const votes = new Map<string, number>()

    for (const proposal of context.proposals) {
      votes.set(proposal.agentId, 1)
    }

    // In case of tie, use confidence as tiebreaker
    const winner = context.proposals.reduce((best, current) => {
      if (current.confidence > best.confidence) {
        return current
      }
      return best
    })

    const alternatives = context.proposals
      .filter(p => p.agentId !== winner.agentId)
      .sort((a, b) => b.confidence - a.confidence)

    return {
      winner,
      votes,
      reasoning: 'Selected by majority vote (confidence used as tiebreaker)',
      consensus: 1.0 / context.proposals.length,
      alternatives,
      timestamp: new Date(),
    }
  }

  /**
   * Consensus voting - requires high agreement threshold
   */
  private async resolveByConsensus(
    context: DebateContext
  ): Promise<DebateResolution> {
    const CONSENSUS_THRESHOLD = 0.75

    // Similar to weighted voting but check threshold
    const result = await this.resolveByWeightedVoting(context)

    if (result.consensus < CONSENSUS_THRESHOLD) {
      // No strong consensus - need to combine or escalate
      result.reasoning = `Weak consensus (${(result.consensus * 100).toFixed(1)}% < ${CONSENSUS_THRESHOLD * 100}%). May need manual review or agent collaboration.`
    } else {
      result.reasoning = `Strong consensus achieved (${(result.consensus * 100).toFixed(1)}% ≥ ${CONSENSUS_THRESHOLD * 100}%)`
    }

    return result
  }

  /**
   * Lead agent makes final decision using LLM
   */
  private async resolveByLeadDecision(
    context: DebateContext
  ): Promise<DebateResolution> {
    if (!this.leadAgent) {
      console.warn('No lead agent provided, falling back to weighted voting')
      return this.resolveByWeightedVoting(context)
    }

    // Prepare debate summary for lead agent
    const debatePrompt = this.formatDebateForLeadAgent(context)

    try {
      // Get lead agent's decision
      const response = await this.leadAgent.run(debatePrompt)

      // Parse response to determine winner
      const winnerId = this.parseLeadDecision(response, context)
      const winner = context.proposals.find(p => p.agentId === winnerId) || context.proposals[0]

      const votes = new Map<string, number>()
      votes.set(winner.agentId, 1)

      const alternatives = context.proposals
        .filter(p => p.agentId !== winner.agentId)

      return {
        winner,
        votes,
        reasoning: `Lead agent decision: ${response}`,
        consensus: 1.0,
        alternatives,
        timestamp: new Date(),
      }
    } catch (error) {
      console.error('Lead agent decision failed:', error)
      return this.resolveByWeightedVoting(context)
    }
  }

  /**
   * Score-based evaluation using criteria
   */
  private async resolveByScoring(
    context: DebateContext
  ): Promise<DebateResolution> {
    const criteria = context.criteria || [
      'correctness',
      'maintainability',
      'performance',
      'security',
      'simplicity',
    ]

    const scores = new Map<string, number>()

    for (const proposal of context.proposals) {
      let totalScore = 0

      // Score each proposal based on criteria
      // In a real implementation, this would use LLM or static analysis
      totalScore += proposal.confidence * 0.3 // Base confidence
      totalScore += (proposal.pros.length - proposal.cons.length * 0.5) * 0.2
      totalScore += Math.min(proposal.rationale.length / 500, 1) * 0.1 // Reasoning depth

      // Consider code quality if provided
      if (proposal.code) {
        totalScore += this.evaluateCodeQuality(proposal.code) * 0.4
      }

      scores.set(proposal.agentId, totalScore)
    }

    // Find winner
    let maxScore = 0
    let winner = context.proposals[0]

    for (const proposal of context.proposals) {
      const score = scores.get(proposal.agentId) || 0
      if (score > maxScore) {
        maxScore = score
        winner = proposal
      }
    }

    const totalScores = Array.from(scores.values()).reduce((a, b) => a + b, 0)
    const consensus = totalScores > 0 ? maxScore / totalScores : 0

    const alternatives = context.proposals
      .filter(p => p.agentId !== winner.agentId)
      .sort((a, b) => {
        const scoreA = scores.get(a.agentId) || 0
        const scoreB = scores.get(b.agentId) || 0
        return scoreB - scoreA
      })

    return {
      winner,
      votes: scores,
      reasoning: `Selected by multi-criteria scoring. Winner score: ${maxScore.toFixed(2)}. Criteria: ${criteria.join(', ')}`,
      consensus,
      alternatives,
      timestamp: new Date(),
    }
  }

  /**
   * Format debate context for lead agent evaluation
   */
  private formatDebateForLeadAgent(context: DebateContext): string {
    let prompt = `# Debate Resolution Required\n\n`
    prompt += `**Topic**: ${context.topic}\n`
    prompt += `**Description**: ${context.description}\n\n`

    if (context.constraints && context.constraints.length > 0) {
      prompt += `**Constraints**:\n${context.constraints.map(c => `- ${c}`).join('\n')}\n\n`
    }

    prompt += `## Agent Proposals\n\n`

    for (let i = 0; i < context.proposals.length; i++) {
      const p = context.proposals[i]
      prompt += `### Proposal ${i + 1}: ${p.agentName} (Confidence: ${(p.confidence * 100).toFixed(0)}%)\n\n`
      prompt += `**Rationale**: ${p.rationale}\n\n`
      prompt += `**Pros**:\n${p.pros.map(pro => `- ${pro}`).join('\n')}\n\n`
      prompt += `**Cons**:\n${p.cons.map(con => `- ${con}`).join('\n')}\n\n`

      if (p.code) {
        prompt += `**Code Sample**:\n\`\`\`\n${p.code.substring(0, 500)}${p.code.length > 500 ? '...' : ''}\n\`\`\`\n\n`
      }
    }

    prompt += `\n## Your Task\n\n`
    prompt += `As the Lead Engineer, evaluate all proposals and select the best approach. `
    prompt += `Consider correctness, maintainability, performance, and alignment with project constraints. `
    prompt += `Respond with the proposal number (1-${context.proposals.length}) and your reasoning.\n`

    return prompt
  }

  /**
   * Parse lead agent's decision from response
   */
  private parseLeadDecision(response: string, context: DebateContext): string {
    // Look for proposal number in response
    const match = response.match(/proposal\s+(\d+)/i)

    if (match) {
      const proposalNum = parseInt(match[1], 10) - 1
      if (proposalNum >= 0 && proposalNum < context.proposals.length) {
        return context.proposals[proposalNum].agentId
      }
    }

    // Fallback: look for agent names
    for (const proposal of context.proposals) {
      if (response.toLowerCase().includes(proposal.agentName.toLowerCase())) {
        return proposal.agentId
      }
    }

    // Default to first proposal
    return context.proposals[0].agentId
  }

  /**
   * Simple code quality heuristic
   */
  private evaluateCodeQuality(code: string): number {
    let score = 0.5 // Base score

    // Positive indicators
    if (code.includes('//') || code.includes('/*')) score += 0.1 // Has comments
    if (code.includes('try') && code.includes('catch')) score += 0.1 // Error handling
    if (code.includes('async') || code.includes('Promise')) score += 0.05 // Async handling
    if (/\btest\b|\bexpect\b|\bassert\b/i.test(code)) score += 0.1 // Testable

    // Negative indicators
    if (code.includes('any') && code.includes('typescript')) score -= 0.05 // TypeScript any
    if (code.includes('console.log')) score -= 0.05 // Debug statements
    if (code.length > 1000 && !code.includes('\n\n')) score -= 0.1 // No spacing

    return Math.max(0, Math.min(1, score))
  }

  /**
   * Get statistics about debate patterns
   */
  getDebateStats(resolutions: DebateResolution[]): {
    averageConsensus: number
    totalDebates: number
    strongConsensusCount: number
    weakConsensusCount: number
  } {
    const totalDebates = resolutions.length
    const averageConsensus =
      resolutions.reduce((sum, r) => sum + r.consensus, 0) / totalDebates || 0

    const strongConsensusCount = resolutions.filter(r => r.consensus >= 0.75).length
    const weakConsensusCount = resolutions.filter(r => r.consensus < 0.5).length

    return {
      averageConsensus,
      totalDebates,
      strongConsensusCount,
      weakConsensusCount,
    }
  }

  /**
   * Set the lead agent for decision making
   */
  setLeadAgent(agent: Agent): void {
    this.leadAgent = agent
  }

  /**
   * Set the voting strategy
   */
  setVotingStrategy(strategy: VotingStrategy): void {
    this.votingStrategy = strategy
  }

  /**
   * Get current voting strategy
   */
  getVotingStrategy(): VotingStrategy {
    return this.votingStrategy
  }
}
