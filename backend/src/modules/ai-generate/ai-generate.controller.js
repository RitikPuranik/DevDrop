const aiServiceClient = require('./aiServiceClient');
const jobOwners = require('./jobOwners');

exports.generate = async (req, res) => {
  try {
    const { messages, fileData, websiteType, userData, preferences, assets, conversation } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ success:false, message:'No messages provided' });
    const jobId = await aiServiceClient.createJob({ messages, fileData:fileData||null, websiteType:websiteType||'portfolio', userData:userData||{}, preferences:preferences||{}, assets:assets||[], conversation:conversation||messages });
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
