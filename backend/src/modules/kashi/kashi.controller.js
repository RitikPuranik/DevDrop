const aiClient = require('./kashiAiClient');
const fixer = require('./kashiFixer.service');
const KashiFixRun = require('./kashiFixRun.model');
const realtime = require('../../shared/realtime/socket');
const entitlements = require('../billing/entitlement.service');
const BankDetails = require('../user/bankDetails.model');

const fail = (res, error, fallback) => {
  if (!error.userMessage) console.error('Kashi controller error:', error.message);
  res.status(error.statusCode || 500).json({ success: false, message: error.userMessage || fallback });
};

/**
 * Facts about the logged-in user that Kashi may quote (quota left, plan, payout status). Always read from the
 * database for the verified user; the browser cannot supply or change any of it. Each lookup is independent and
 * best-effort: a failure leaves that fact out and Kashi is told to send the user to the page instead of guessing.
 */
async function loadAccountFacts(req) {
  if (!req.user) return null;
  const [usage, bank] = await Promise.allSettled([
    entitlements.getUsageSummary(req.userId),
    BankDetails.exists({ userId: req.userId }),
  ]);
  if (usage.status === 'rejected') console.warn('Kashi: usage lookup failed:', usage.reason?.message);
  return {
    usage: usage.status === 'fulfilled' ? usage.value : null,
    emailVerified: Boolean(req.user.isVerified),
    payoutSaved: bank.status === 'fulfilled' ? Boolean(bank.value) : false,
  };
}

// The studio snapshot only describes the form on screen (type, step, field keys); it is re-validated in the AI service.
const studioSnapshot = (s) => (s && typeof s === 'object' ? {
  websiteType: typeof s.websiteType === 'string' ? s.websiteType.slice(0, 20) : null,
  step: typeof s.step === 'string' ? s.step.slice(0, 20) : null,
  fields: Array.isArray(s.fields) ? s.fields.slice(0, 40).map((f) => ({ key: String(f?.key || '').slice(0, 41), label: String(f?.label || '').slice(0, 60), list: Boolean(f?.list) })) : [],
  filled: Array.isArray(s.filled) ? s.filled.slice(0, 40).map((k) => String(k).slice(0, 41)) : [],
} : null);

/** POST /api/kashi/chat  body: { message, history?, context?: { path, deploymentId, studio? } } */
exports.chat = async (req, res) => {
  try {
    const { message, history, context } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ success: false, message: 'Say something to Kashi first.' });
    // Identity facts come from the verified token, never from the client.
    const account = await loadAccountFacts(req);
    const data = await aiClient.chat({
      message: message.slice(0, 1200),
      history: Array.isArray(history) ? history.slice(-8) : [],
      context: {
        isLoggedIn: Boolean(req.user),
        role: req.user?.role === 'admin' ? 'admin' : 'user',
        path: typeof context?.path === 'string' ? context.path.slice(0, 200) : '/',
        deploymentId: typeof context?.deploymentId === 'string' ? context.deploymentId : null,
        studio: studioSnapshot(context?.studio),
        account,
      },
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    fail(res, error, 'Kashi could not answer right now.');
  }
};

/** POST /api/kashi/deployments/:deploymentId/fix */
exports.startFix = async (req, res) => {
  try {
    const { run, alreadyRunning } = await fixer.startFixRun({ userId: req.userId, deploymentId: req.params.deploymentId });
    res.status(alreadyRunning ? 200 : 202).json({ success: true, data: { run: fixer.serializeRun(run), alreadyRunning } });
  } catch (error) {
    fail(res, error, 'Could not start Kashi.');
  }
};

/** GET /api/kashi/fix-runs/:runId */
exports.getRun = async (req, res) => {
  try {
    const run = await KashiFixRun.findOne({ _id: req.params.runId, userId: req.userId });
    if (!run) return res.status(404).json({ success: false, message: 'Run not found.' });
    res.status(200).json({ success: true, data: { run: fixer.serializeRun(run) } });
  } catch (error) {
    fail(res, error, 'Could not load the run.');
  }
};

/** GET /api/kashi/deployments/:deploymentId/fix-runs/latest */
exports.getLatestForDeployment = async (req, res) => {
  try {
    const run = await KashiFixRun.findOne({ deploymentId: req.params.deploymentId, userId: req.userId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: { run: run ? fixer.serializeRun(run) : null } });
  } catch (error) {
    fail(res, error, 'Could not load the run.');
  }
};

/** POST /api/kashi/fix-runs/:runId/cancel */
exports.cancelRun = async (req, res) => {
  try {
    const run = await fixer.cancelRun({ userId: req.userId, runId: req.params.runId });
    if (!run) return res.status(404).json({ success: false, message: 'No active run to stop.' });
    const serialized = fixer.serializeRun(run);
    realtime.emitToKashiRun(serialized.id, 'kashi-fix:status', {
      runId: serialized.id,
      status: serialized.status,
      resultMessage: serialized.resultMessage,
      finishedAt: serialized.finishedAt,
    });
    res.status(200).json({ success: true, data: { run: serialized } });
  } catch (error) {
    fail(res, error, 'Could not stop the run.');
  }
};
