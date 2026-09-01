/**
 * Contract every deployment provider module implements. This file has no
 * runtime behavior — it's the JSDoc equivalent of the TypeScript interface
 * the feature spec asked for, kept as documentation since the rest of this
 * backend is plain JS. provider.factory.js is what actually wires a
 * provider name to its implementation.
 *
 * @typedef {Object} DeploymentProvider
 *
 * @property {(credential: string, metadata: object) => Promise<{ok: boolean, accountLabel?: string}>} validateConnection
 *   Confirms a stored credential still works (called right after connect,
 *   and defensively before a deployment run).
 *
 * @property {(credential: string, metadata: object, config: object) => Promise<object>} ensureProject
 *   Creates the provider-side project/service if one isn't already tracked
 *   on the Deployment doc, otherwise looks up and returns the existing one.
 *   Idempotent by design — retries and redeploys must never create a second
 *   Vercel project or Render service for the same Deployment (spec §39).
 *
 * @property {(credential: string, metadata: object, resourceId: string, variables: {key: string, value: string}[]) => Promise<void>} configureEnvironment
 *   Upserts environment variables on the provider-side project/service.
 *
 * @property {(credential: string, metadata: object, resourceId: string, options: object) => Promise<{deployId: string}>} deploy
 *   Triggers a new deployment/build from the linked GitHub repo.
 *
 * @property {(credential: string, metadata: object, deployId: string) => Promise<{state: string, isTerminal: boolean, isSuccess: boolean, url?: string}>} getDeploymentStatus
 *   Polled by the orchestrator until isTerminal is true.
 */

module.exports = {};
