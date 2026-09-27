const aiServiceClient = require('./aiServiceClient');
const jobOwners = require('./jobOwners');
const AIStudioAsset = require('../ai-studio/aiStudioAsset.model');
const aiStudioStorage = require('../../services/ai-studio/aiStudioStorage.service');

exports.generate = async (req, res) => {
  try {
    const { messages, fileData, websiteType, userData, preferences, assets, conversation, projectId } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ success:false, message:'No messages provided' });

    let multimodalAssets = [];
    if (projectId && Array.isArray(assets) && assets.length) {
      const assetIds = assets.map((asset) => asset?._id || asset?.id).filter(Boolean);
      if (assetIds.length) {
        const storedAssets = await AIStudioAsset.find({ _id: { $in: assetIds }, projectId, userId: req.userId }).lean();
        multimodalAssets = await Promise.all(storedAssets.map(async (asset) => {
          const buffer = await aiStudioStorage.downloadAsset(asset.storagePath);
          return {
            assetId: String(asset._id),
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            size: asset.size,
            data: buffer.toString('base64'),
          };
        }));
      }
    }

    const jobId = await aiServiceClient.createJob({
      messages,
      fileData:fileData||null,
      websiteType:websiteType||'portfolio',
      userData:userData||{},
      preferences:preferences||{},
      assets:assets||[],
      media:multimodalAssets,
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
