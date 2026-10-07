const groq = require('../groq.service');

const MAX_CANDIDATES = 24;
const MAX_PATHS = 500;

const SYSTEM_PROMPT = `You are DevDrop's deployment planner. Your job is to select the best deployment root from repository candidates.

You MUST follow these rules:
- You may ONLY choose a root that appears exactly in the provided candidate list.
- Prefer a real runnable frontend/backend app over documentation, shared packages, examples, tests, stories, or tooling.
- Use framework, package scripts, entry points, config files, build output, and repository tree evidence.
- A frontend candidate should have evidence of an actual browser app (for example Vite/React/Vue/Next, an index.html, or a framework entry point).
- A backend candidate should have a real server runtime (for example Express/Nest) and a start/build entry point.
- Do not choose a shared UI library or package merely because it has React as a dependency.
- If the repository has multiple apps, choose the app that is most likely intended for production deployment.
- Never invent paths.

Return ONLY JSON:
{
  "frontend": { "root": "exact candidate root", "confidence": 0.0, "reason": "short reason" } | null,
  "backend": { "root": "exact candidate root", "confidence": 0.0, "reason": "short reason" } | null
}`;

const clampConfidence = (value) => Math.max(0, Math.min(1, Number(value) || 0));

async function planDeployment({ candidates, treePaths }) {
  const safeCandidates = {
    frontend: Array.isArray(candidates?.frontend) ? candidates.frontend.slice(0, MAX_CANDIDATES) : [],
    backend: Array.isArray(candidates?.backend) ? candidates.backend.slice(0, MAX_CANDIDATES) : [],
  };

  const result = await groq.chat({
    tier: 'fast',
    json: true,
    maxTokens: 700,
    timeoutMs: Number.parseInt(process.env.DEPLOYMENT_AI_PLAN_TIMEOUT_MS || '20000', 10),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          candidates: safeCandidates,
          treePaths: Array.isArray(treePaths) ? treePaths.slice(0, MAX_PATHS) : [],
        }),
      },
    ],
  });

  const raw = result?.json;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Deployment planner returned invalid JSON.');
  }

  const frontendRoots = new Set(safeCandidates.frontend.map((candidate) => candidate.root));
  const backendRoots = new Set(safeCandidates.backend.map((candidate) => candidate.root));

  const validate = (value, allowedRoots) => {
    if (value === null || value === undefined) return null;
    if (!value || typeof value.root !== 'string' || !allowedRoots.has(value.root)) return null;
    return {
      root: value.root,
      confidence: clampConfidence(value.confidence),
      reason: String(value.reason || '').slice(0, 300),
    };
  };

  return {
    status: 'ok',
    frontend: validate(raw.frontend, frontendRoots),
    backend: validate(raw.backend, backendRoots),
    model: result.model,
  };
}

module.exports = { planDeployment };
