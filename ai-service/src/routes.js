const express = require('express');
const axios = require('axios');
const { createJob, getJob } = require('./jobs.service');
const geminiPool = require('./geminiPool.service');
const GeminiApiKey = require('./models/geminiApiKey.model');
const router = express.Router();
const GEMINI_TEST_TIMEOUT_MS = 15000;

function requireServiceKey(req, res, next) {
  const expected = process.env.SERVICE_API_KEY; const provided = req.header('X-Service-Key');
  if (!expected) return res.status(500).json({ success: false, message: 'ai-service is not configured (SERVICE_API_KEY missing).' });
  if (!provided || provided !== expected) return res.status(401).json({ success: false, message: 'Invalid or missing service key.' });
  next();
}
router.get('/health', (req, res) => res.status(200).json({ success: true, status: 'ok' }));
router.post('/jobs', requireServiceKey, (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.messages) || body.messages.length === 0) return res.status(400).json({ success: false, message: 'No messages provided' });
  // An existing project's files travel along with every follow-up request
  // (the frontend keeps them in `fileData` after the first generation). Their
  // presence is what distinguishes "edit an existing site" from "generate a
  // new one" -- a brand-new request never has them.
  const existingFiles = body.fileData && typeof body.fileData.files === 'object' && body.fileData.files ? body.fileData.files : null;
  const mode = existingFiles && Object.keys(existingFiles).length > 0 ? 'edit' : 'generate';
  const jobId = createJob({
    messages: body.messages,
    fileData: body.fileData || null,
    websiteType: body.websiteType || body.type || 'portfolio',
    userData: body.userData || body.portfolioData || {},
    preferences: body.preferences || {},
    assets: body.assets || [],
    conversation: body.conversation || body.messages,
    mode,
    existingFiles,
    existingDependencies: (existingFiles && body.fileData?.dependencies) || {},
  });
  res.status(202).json({ success: true, data: { jobId, status: 'queued', mode } });
});
router.get('/jobs/:id', requireServiceKey, (req, res) => {
  const job = getJob(req.params.id); if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
  const progress = { currentStage: job.currentStage, stageStatus: job.stageStatus, generationMeta: job.generationMeta, mode: job.mode };
  if (job.status === 'completed') return res.status(200).json({ success: true, data: { jobId: job.id, status: job.status, ...progress, result: job.result } });
  if (job.status === 'failed') return res.status(200).json({ success: true, data: { jobId: job.id, status: job.status, ...progress, error: job.error } });
  return res.status(200).json({ success: true, data: { jobId: job.id, status: job.status, ...progress } });
});

function maskKey(doc) { return `${doc.keyPrefix || 'AIza'}...${doc.keySuffix || '????'}`; }
function isCoolingDown(doc) { return Boolean(doc.cooldownUntil && new Date(doc.cooldownUntil).getTime() > Date.now()); }
function serializeKey(doc) { const o = doc.toObject ? doc.toObject() : doc; return { id: String(o._id), label:o.label, maskedKey:maskKey(o), enabled:o.enabled, priority:o.priority, status:o.status, cooldownUntil:o.cooldownUntil, isCoolingDown:isCoolingDown(o), modelCooldowns:o.modelCooldowns || {}, failureCount:o.failureCount, consecutiveFailures:o.consecutiveFailures, totalRequests:o.totalRequests, totalSuccesses:o.totalSuccesses, totalFailures:o.totalFailures, lastUsedAt:o.lastUsedAt, lastSuccessAt:o.lastSuccessAt, lastFailureAt:o.lastFailureAt, lastErrorCode:o.lastErrorCode, lastErrorMessage:o.lastErrorMessage, createdAt:o.createdAt, updatedAt:o.updatedAt }; }
router.post('/gemini-pool/reload', requireServiceKey, async (req,res)=>{ try { geminiPool.invalidate(); await geminiPool.loadPool(true); res.status(200).json({success:true}); } catch(error){ console.error('Gemini pool reload error:',error.message); res.status(500).json({success:false,message:'Failed to reload Gemini pool.'}); } });
router.get('/gemini-pool/status', requireServiceKey, async (req,res)=>{ try { await geminiPool.loadPool(); res.status(200).json({success:true,data:geminiPool.getSnapshot()}); } catch(error){ console.error('Gemini pool status error:',error.message); res.status(500).json({success:false,message:'Failed to load Gemini pool status.'}); } });
router.post('/gemini-pool/keys/:id/test', requireServiceKey, async (req,res)=>{ try { const doc=await GeminiApiKey.findById(req.params.id).select('+encryptedKey'); if(!doc)return res.status(404).json({success:false,message:'Gemini key not found.'}); const result=await geminiPool.testSingleKey(doc.encryptedKey,async(rawKey)=>{const model=process.env.GEMINI_TEST_MODEL||process.env.GEMINI_MODEL||'gemini-3.8-flash'; return axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(rawKey)}`,{contents:[{role:'user',parts:[{text:'Reply with OK.'}]}],generationConfig:{maxOutputTokens:8}},{timeout:GEMINI_TEST_TIMEOUT_MS,headers:{'Content-Type':'application/json'}});}); const info=result?.classification||result; await GeminiApiKey.findByIdAndUpdate(doc._id,{lastErrorCode:info?.classification==='success'?null:String(info?.status||info?.classification||'unknown'),lastErrorMessage:info?.message||null,status:info?.classification==='invalid'?'invalid':info?.classification==='rate_limit'?'rate_limited':info?.classification==='success'?'healthy':'degraded'}); res.status(200).json({success:true,data:{classification:info?.classification||'unknown',message:info?.message||null}}); } catch(error){ console.error('Gemini key test error:',error.message); res.status(200).json({success:true,data:{classification:'error',message:error.message}}); } });
module.exports = router;
