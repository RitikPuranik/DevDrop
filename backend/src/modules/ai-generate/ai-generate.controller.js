const aiServiceClient = require('./aiServiceClient');
const jobOwners = require('./jobOwners');
const { resolveGenerationAssets } = require('../../services/ai-studio/aiStudioAssetPipeline.service');

const REFERENCE_IMAGE_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_REFERENCE_IMAGE_BYTES = 1.5 * 1024 * 1024;

// preferences.referenceImage is a screenshot of the selected style preview.
// Anything that is not a small base64 jpeg/png/webp data URL is dropped (never fails the request).
function sanitizePreferences(preferences) {
  const prefs = preferences && typeof preferences === 'object' ? { ...preferences } : {};
  const ref = prefs.referenceImage;
  delete prefs.referenceImage;
  if (typeof ref === 'string') {
    const m = REFERENCE_IMAGE_RE.exec(ref);
    if (m && Buffer.byteLength(m[2], 'base64') <= MAX_REFERENCE_IMAGE_BYTES) prefs.referenceImage = ref;
  }
  return prefs;
}
exports.sanitizePreferences = sanitizePreferences;

exports.generate = async (req, res) => {
  try {
    const { messages, fileData, websiteType, userData, preferences, assets, conversation, projectId } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ success:false, message:'No messages provided' });

    const hasExistingFiles = Boolean(fileData && fileData.files && typeof fileData.files === 'object' && Object.keys(fileData.files).length);
    // Throws 400/403/404/502 with a user-facing message for critical asset
    // problems; optional document-extraction problems are reported per asset
    // (assets.*.extraction.status) and never fail the request.
    const { assets: resolvedAssets, media } = await resolveGenerationAssets({
      projectId,
      userId: req.userId,
      rawAssets: assets,
      hasExistingFiles,
    });

    const jobId = await aiServiceClient.createJob({
      messages,
      fileData:fileData||null,
      websiteType:websiteType||'portfolio',
      userData:userData||{},
      preferences:sanitizePreferences(preferences),
      assets:resolvedAssets,
      media,
      conversation:conversation||messages
    });
    jobOwners.record(jobId, req.userId);
    res.status(202).json({ success:true, data:{jobId,status:'queued'} });
  } catch(error) {
    console.error('AI generate error:',error.message);
    res.status(error.statusCode||500).json({success:false,message:error.userMessage||'Failed to generate app'});
  }
};

exports.getJob = async (req,res) => {
  try {
    const {id}=req.params;
    if(!jobOwners.isOwner(id,req.userId)) return res.status(404).json({success:false,message:'Job not found'});
    const job=await aiServiceClient.getJob(id);
    if(!job)return res.status(404).json({success:false,message:'Job not found'});
    res.status(200).json({success:true,data:job});
  } catch(error) {
    console.error('AI job status error:',error.message);
    res.status(error.statusCode||500).json({success:false,message:error.userMessage||'Failed to check AI generation status'});
  }
};

exports.debugRetry = async (req, res) => {
  try {
    const originalJobId = req.params.id;
    if (!jobOwners.isOwner(originalJobId, req.userId)) return res.status(404).json({ success:false, message:'Job not found' });
    const original = await aiServiceClient.getJob(originalJobId);
    if (!original || original.status !== 'failed' || !original.debugAvailable) {
      return res.status(404).json({ success:false, message:'No debug retry is available for this job' });
    }
    const debugJobId = await aiServiceClient.debugRetry(originalJobId);
    jobOwners.record(debugJobId, req.userId);
    res.status(202).json({ success:true, data:{jobId:debugJobId,status:'queued',mode:'debug'} });
  } catch(error) {
    res.status(error.statusCode||500).json({success:false,message:error.userMessage||'Failed to start debug retry'});
  }
};
