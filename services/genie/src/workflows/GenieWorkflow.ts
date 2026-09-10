import { LeadEngineerAgent } from '../agents/base/LeadEngineerAgent';
import { GenerateWorkflow } from './GenerateWorkflow';
import { ReviewWorkflow } from './ReviewWorkflow';
import { EnhanceWorkflow } from './EnhanceWorkflow';

/**
 * The main hierarchical workflow orchestrator.
 * It uses the LeadEngineerAgent to decide which specialized workflow to run.
 */
export class GenieWorkflow {
    private leadEngineer: LeadEngineerAgent;

    constructor() {
        this.leadEngineer = new LeadEngineerAgent();
    }

    /**
     * Runs the appropriate workflow based on the request.
     * @param request The user's request object.
     * @returns The result from the executed workflow.
     */
    async run(request: any): Promise<any> {
        // The LeadEngineerAgent orchestrates the process.
        // It might call other agents or workflows directly.
        // This implementation assumes it delegates to specific workflow runners.
        const agentDecision = await this.leadEngineer.run(request);

        // Based on the lead agent's plan, execute the corresponding workflow.
        switch (agentDecision.nextAction) {
            case 'generate':
                const generateWorkflow = new GenerateWorkflow();
                return await generateWorkflow.run(agentDecision.context);
            case 'review':
                const reviewWorkflow = new ReviewWorkflow();
                return await reviewWorkflow.run(agentDecision.context);
            case 'enhance':
                const enhanceWorkflow = new EnhanceWorkflow();
                return await enhanceWorkflow.run(agentDecision.context);
            default:
                // The lead agent might have completed the task itself.
                return agentDecision;
        }
    }
}
