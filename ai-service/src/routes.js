const express = require('express');
const axios = require('axios');
const geminiPool = require('./geminiPool.service');
const GeminiApiKey = require('./models/geminiApiKey.model');
const groqPool = require('./groqPool.service');
const GroqApiKey = require('./models/groqApiKey.model');
const kashiChat = require('./kashi/kashi.chat');
const kashiFix = require('./kashi/kashi.fix');
const runtimeCheck = require('./validators/runtime.check');
const { diagnoseRuntimeErrors } = require('./kashi/runtimeDiagnosis');
const deploymentPlanner = require('./deployment/planner');
const router = express.Router();
const GEMINI_TEST_TIMEOUT_MS = 15000;

function requireServiceKey(req, res, next) {
  const expected = process.env.SERVICE_API_KEY; const provided = req.header('X-Service-Key');
  if (!expected) return res.status(500).json({ success: false, message: 'ai-service is not configured (SERVICE_API_KEY missing).' });
  if (!provided || provided !== expected) return res.status(401).json({ success: false, message: 'Invalid or missing service key.' });
  next();
}
router.get('/health', (req, res) => res.status(200).json({ success: true, status: 'ok', queueWorker: Boolean(req.app.locals.aiWorker?.isRunning?.()) }));
// Generation jobs are consumed from the BullMQ `ai-queue` (see src/queue/worker.js); there are no /jobs HTTP endpoints.

function maskKey(doc) { return `${doc.keyPrefix || 'AIza'}...${doc.keySuffix || '????'}`; }
function isCoolingDown(doc) { return Boolean(doc.cooldownUntil && new Date(doc.cooldownUntil).getTime() > Date.now()); }
function serializeKey(doc) { const o = doc.toObject ? doc.toObject() : doc; return { id: String(o._id), label:o.label, maskedKey:maskKey(o), enabled:o.enabled, priority:o.priority, status:o.status, cooldownUntil:o.cooldownUntil, isCoolingDown:isCoolingDown(o), modelCooldowns:o.modelCooldowns || {}, failureCount:o.failureCount, consecutiveFailures:o.consecutiveFailures, totalRequests:o.totalRequests, totalSuccesses:o.totalSuccesses, totalFailures:o.totalFailures, lastUsedAt:o.lastUsedAt, lastSuccessAt:o.lastSuccessAt, lastFailureAt:o.lastFailureAt, lastErrorCode:o.lastErrorCode, lastErrorMessage:o.lastErrorMessage, createdAt:o.createdAt, updatedAt:o.updatedAt }; }
router.post('/gemini-pool/reload', requireServiceKey, async (req,res)=>{ try { geminiPool.invalidate(); await geminiPool.loadPool(true); res.status(200).json({success:true}); } catch(error){ console.error('Gemini pool reload error:',error.message); res.status(500).json({success:false,message:'Failed to reload Gemini pool.'}); } });
router.get('/gemini-pool/status', requireServiceKey, async (req,res)=>{ try { await geminiPool.loadPool(); res.status(200).json({success:true,data:geminiPool.getSnapshot()}); } catch(error){ console.error('Gemini pool status error:',error.message); res.status(500).json({success:false,message:'Failed to load Gemini pool status.'}); } });
router.post('/gemini-pool/keys/:id/test', requireServiceKey, async (req,res)=>{ try { const doc=await GeminiApiKey.findById(req.params.id).select('+encryptedKey'); if(!doc)return res.status(404).json({success:false,message:'Gemini key not found.'}); const result=await geminiPool.testSingleKey(doc.encryptedKey,async(rawKey)=>{const model=process.env.GEMINI_TEST_MODEL||process.env.GEMINI_MODEL||'gemini-3.8-flash'; return axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(rawKey)}`,{contents:[{role:'user',parts:[{text:'Reply with OK.'}]}],generationConfig:{maxOutputTokens:8}},{timeout:GEMINI_TEST_TIMEOUT_MS,headers:{'Content-Type':'application/json'}});}); const info=result?.classification||result; await GeminiApiKey.findByIdAndUpdate(doc._id,{lastErrorCode:info?.classification==='success'?null:String(info?.status||info?.classification||'unknown'),lastErrorMessage:info?.message||null,status:info?.classification==='invalid'?'invalid':info?.classification==='rate_limit'?'rate_limited':info?.classification==='success'?'healthy':'degraded'}); res.status(200).json({success:true,data:{classification:info?.classification||'unknown',message:info?.message||null}}); } catch(error){ console.error('Gemini key test error:',error.message); res.status(200).json({success:true,data:{classification:'error',message:error.message}}); } });
// ---------------------------------------------------------------------------
// Kashi (assistant) + Groq pool. Entirely separate from the Gemini pool above.
// ---------------------------------------------------------------------------
function kashiError(res, error, fallback) {
  const status = error?.statusCode || (error?.code === 'GROQ_POOL_EXHAUSTED' ? 503 : 502);
  console.error('Kashi error:', error?.message);
  return res.status(status).json({ success: false, message: error?.userMessage || (error?.code === 'GROQ_POOL_EXHAUSTED' ? 'Kashi is busy right now. Try again shortly.' : fallback) });
}
router.post('/kashi/chat', requireServiceKey, async (req, res) => {
  try {
    const { message, history, context } = req.body || {};
    const data = await kashiChat.answer({ message, history, context });
    res.status(200).json({ success: true, data });
  } catch (error) { kashiError(res, error, 'Kashi could not answer.'); }
});
router.post('/kashi/fix', requireServiceKey, async (req, res) => {
  try {
    const { errorLog, files, repoPaths, previousAttempts, mode } = req.body || {};
    if (!Array.isArray(files)) return res.status(400).json({ success: false, message: 'files must be an array.' });
    const data = await kashiFix.proposeFix({ errorLog, files, repoPaths: Array.isArray(repoPaths) ? repoPaths : [], previousAttempts: Array.isArray(previousAttempts) ? previousAttempts : [], mode: mode === 'runtime' ? 'runtime' : 'build' });
    res.status(200).json({ success: true, data });
  } catch (error) { kashiError(res, error, 'Kashi could not propose a fix.'); }
});
// Loads a deployed site in a real browser: READY on Vercel only means the build compiled, not that the page renders.
router.post('/kashi/runtime-check', requireServiceKey, async (req, res) => {
  try {
    const target = await runtimeCheck.assertPublicHttpsUrl(req.body && req.body.url);
    const result = await runtimeCheck.checkUrl(target.toString());
    const diagnosis = result.ok ? { kind: null, hint: null } : diagnoseRuntimeErrors(result.errors);
    res.status(200).json({ success: true, data: { ...result, ...diagnosis } });
  } catch (error) { kashiError(res, error, 'Kashi could not check the site.'); }
});
router.post('/deployment/plan', requireServiceKey, async (req, res) => {
  try {
    const data = await deploymentPlanner.planDeployment({
      candidates: req.body?.candidates || {},
      treePaths: Array.isArray(req.body?.treePaths) ? req.body.treePaths : [],
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    kashiError(res, error, 'Deployment planner could not choose an application root.');
  }
});
router.post('/groq-pool/reload', requireServiceKey, async (req, res) => { try { groqPool.invalidate(); await groqPool.loadPool(true); res.status(200).json({ success: true }); } catch (error) { console.error('Groq pool reload error:', error.message); res.status(500).json({ success: false, message: 'Failed to reload Groq pool.' }); } });
router.get('/groq-pool/status', requireServiceKey, async (req, res) => { try { await groqPool.loadPool(); res.status(200).json({ success: true, data: groqPool.getSnapshot() }); } catch (error) { console.error('Groq pool status error:', error.message); res.status(500).json({ success: false, message: 'Failed to load Groq pool status.' }); } });
router.post('/groq-pool/keys/:id/test', requireServiceKey, async (req, res) => {
  try {
    const doc = await GroqApiKey.findById(req.params.id).select('+encryptedKey');
    if (!doc) return res.status(404).json({ success: false, message: 'Groq key not found.' });
    const model = process.env.GROQ_TEST_MODEL || require('./groq.service').getModels('fast')[0];
    const info = await groqPool.testSingleKey(doc.encryptedKey, (rawKey) => axios.post(process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions', { model, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 4 }, { timeout: GEMINI_TEST_TIMEOUT_MS, headers: { Authorization: `Bearer ${rawKey}`, 'Content-Type': 'application/json' } }));
    await GroqApiKey.findByIdAndUpdate(doc._id, { lastErrorCode: info.classification === 'success' ? null : String(info.status || info.classification), lastErrorMessage: info.classification === 'success' ? null : info.message || null, status: info.classification === 'invalid' ? 'invalid' : info.classification === 'rate_limit' ? 'rate_limited' : info.classification === 'success' ? 'healthy' : 'degraded' });
    groqPool.invalidate();
    res.status(200).json({ success: true, data: { classification: info.classification, message: info.message || null } });
  } catch (error) { console.error('Groq key test error:', error.message); res.status(200).json({ success: true, data: { classification: 'error', message: error.message } }); }
});

module.exports = router;
