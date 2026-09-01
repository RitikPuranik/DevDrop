/**
 * Turns one envPlan entry (from analyzer/index.js) into an actual value,
 * given what's known about this deployment run so far. Returns `null` when
 * the value genuinely isn't available yet (e.g. a frontend var that points
 * at the backend URL, before the backend has been deployed) — callers skip
 * null entries rather than pushing an empty string to the provider.
 *
 * @param {{key: string, target: 'frontend'|'backend', source: 'auto'|'user', autoRole?: string}} entry
 * @param {{ frontendUrl?: string, backendUrl?: string, userSecrets: Map<string,string> }} context
 */
const resolveVariableValue = (entry, context) => {
  if (entry.source === 'auto') {
    if (entry.key === 'NODE_ENV') return 'production';
    if (entry.key === 'PORT') return null; // the provider assigns this itself
    if (entry.autoRole === 'frontend-url') return context.frontendUrl || null;
    if (entry.autoRole === 'backend-url') return context.backendUrl || null;
    return null;
  }
  // source === 'user'
  return context.userSecrets.has(entry.key) ? context.userSecrets.get(entry.key) : null;
};

/**
 * Builds the {key, value} list for one side ('frontend' | 'backend') of a
 * deployment, ready to hand to a provider's configureEnvironment(). Entries
 * that can't be resolved yet are omitted (not sent as empty strings).
 */
const buildVariableList = (envPlan, target, context) => {
  return envPlan
    .filter((entry) => entry.target === target)
    .map((entry) => ({ key: entry.key, value: resolveVariableValue(entry, context) }))
    .filter((entry) => entry.value !== null && entry.value !== undefined && entry.value !== '');
};

module.exports = { resolveVariableValue, buildVariableList };
