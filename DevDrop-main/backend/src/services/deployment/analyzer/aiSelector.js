const axios = require('axios');

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_CANDIDATES = 24;
const MAX_TREE_PATHS = 500;

const baseUrl = () => {
  const url = process.env.AI_SERVICE_URL;
  return url ? url.replace(/\/+$/, '') : null;
};

const compactCandidate = (candidate) => ({
  root: candidate.root,
  kind: candidate.kind,
  framework: candidate.framework,
  buildTool: candidate.buildTool || null,
  buildCommand: candidate.buildCommand || null,
  outputDirectory: candidate.outputDirectory || null,
  installCommand: candidate.installCommand || null,
  startCommand: candidate.startCommand || null,
  signals: candidate.signals || {},
  score: candidate.deterministicScore || 0,
});

/**
 * Asks the AI to rank deployment roots. The AI is never allowed to invent a
 * path: callers validate the selected roots against the exact candidate list.
 * Failure is intentionally non-fatal because deterministic selection remains
 * available and is safer than blocking a deploy on the planning model.
 */
const selectRoots = async ({ frontendCandidates = [], backendCandidates = [], treePaths = [] }) => {
  const url = baseUrl();
  if (!url) return { status: 'unavailable', reason: 'AI_SERVICE_URL is not configured.' };

  if (frontendCandidates.length <= 1 && backendCandidates.length <= 1) {
    return { status: 'not_needed' };
  }

  const body = {
    candidates: {
      frontend: frontendCandidates.slice(0, MAX_CANDIDATES).map(compactCandidate),
      backend: backendCandidates.slice(0, MAX_CANDIDATES).map(compactCandidate),
    },
    treePaths: treePaths
      .filter((p) => typeof p === 'string')
      .slice(0, MAX_TREE_PATHS),
  };

  try {
    const response = await axios.post(`${url}/deployment/plan`, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.AI_SERVICE_TOKEN || '',
      },
      timeout: Number.parseInt(process.env.DEPLOYMENT_AI_PLAN_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10),
    });

    return response.data?.data || { status: 'unavailable', reason: 'AI service returned no deployment plan.' };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error?.response?.data?.message || error?.message || 'AI deployment planner unavailable.',
    };
  }
};

module.exports = { selectRoots, compactCandidate };
