const AI_SCORE_GAP_TOLERANCE = 3;
const MIN_AI_CONFIDENCE = 0.55;

const scoreCandidate = (candidate) => {
  const s = candidate.signals || {};
  let score = 0;

  if (candidate.kind === 'frontend') {
    if (s.frameworkEvidence) score += 5;
    if (s.hasBuildScript) score += 3;
    if (s.hasEntryPoint) score += 3;
    if (s.hasFrameworkConfig) score += 2;
    if (s.hasIndexHtml) score += 2;
    if (s.hasAppOrPagesDir) score += 1;
  } else {
    if (s.frameworkEvidence) score += 5;
    if (s.hasStartScript) score += 3;
    if (s.hasServerEntryPoint) score += 3;
    if (s.hasBuildScript) score += 2;
    if (s.hasSourceDir) score += 1;
    if (s.hasTypeScriptEntry) score += 1;
  }

  return score;
};

const sortCandidates = (candidates) => [...candidates]
  .map((candidate) => ({ ...candidate, deterministicScore: scoreCandidate(candidate) }))
  .sort((a, b) => {
    if (b.deterministicScore !== a.deterministicScore) return b.deterministicScore - a.deterministicScore;
    return a.root.localeCompare(b.root);
  });

const resolveSelection = (candidates, aiRoot, aiConfidence, aiReason) => {
  if (!candidates.length) return null;
  const ranked = sortCandidates(candidates);
  const best = ranked[0];

  if (ranked.length === 1) {
    return {
      candidate: best,
      method: 'deterministic-single',
      confidence: 1,
      rationale: 'Only one deployable candidate was detected.',
    };
  }

  const aiCandidate = aiRoot ? ranked.find((candidate) => candidate.root === aiRoot) : null;
  const confidence = Number.isFinite(Number(aiConfidence)) ? Number(aiConfidence) : 0;
  if (aiCandidate && confidence >= MIN_AI_CONFIDENCE) {
    const scoreGap = best.deterministicScore - aiCandidate.deterministicScore;
    if (scoreGap <= AI_SCORE_GAP_TOLERANCE) {
      return {
        candidate: aiCandidate,
        method: 'ai-assisted',
        confidence,
        rationale: aiReason || `AI selected ${aiCandidate.root} and deterministic validation accepted it.`,
      };
    }
  }

  return {
    candidate: best,
    method: 'deterministic-override',
    confidence: Math.max(0.7, Math.min(1, 0.75 + best.deterministicScore / 20)),
    rationale: aiCandidate
      ? `AI suggested ${aiCandidate.root}, but deterministic evidence favored ${best.root}; the safer candidate was selected.`
      : 'The AI planner was unavailable or did not return a valid candidate, so deterministic evidence selected the safest root.',
  };
};

const rankAndSelect = ({ frontendCandidates, backendCandidates, aiPlan }) => {
  const frontendPlan = aiPlan?.status === 'ok' ? aiPlan.frontend : null;
  const backendPlan = aiPlan?.status === 'ok' ? aiPlan.backend : null;

  return {
    frontend: resolveSelection(
      frontendCandidates,
      frontendPlan?.root,
      frontendPlan?.confidence,
      frontendPlan?.reason
    ),
    backend: resolveSelection(
      backendCandidates,
      backendPlan?.root,
      backendPlan?.confidence,
      backendPlan?.reason
    ),
  };
};

module.exports = { scoreCandidate, sortCandidates, resolveSelection, rankAndSelect, AI_SCORE_GAP_TOLERANCE, MIN_AI_CONFIDENCE };
