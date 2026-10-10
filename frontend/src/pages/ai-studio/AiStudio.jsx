import {buildAssetContract} from '../../components/ai-studio/assetContract';
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUp, Loader2, Bot, User, CheckSquare, ChevronDown, Paperclip, Mic, Sparkles, Send, X, Film, FileText } from 'lucide-react';
import { usePostHog } from '../../analytics/PostHogProvider';
import { aiGenerateAPI } from '../../api/aiGenerate';
import { subscribeToJob } from '../../api/socket';
import AppPreview from '../../components/ai-studio/AppPreview';
import { PipelineSteps, computePipeline } from '../../components/ai-studio/pipelineSteps';
import PortfolioBuilder from '../../components/ai-studio/PortfolioBuilder';
import { buildPortfolioPrompt } from '../../components/ai-studio/portfolioPrompt';
import WebsiteBuilder, { buildWebsitePrompt } from '../../components/ai-studio/WebsiteBuilder';
import { WEBSITE_TYPES } from '../../config/aiStudio.config';
import { useAiStudioSession } from '../../hooks/ai-studio/useAiStudioSession';

// Files attached while editing are uploaded through the normal AI Studio asset
// endpoint, so they land in the same ai-studio/{projectId}/assets storage prefix
// as every other project asset and are removed by the existing cleanup worker.
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // matches the backend asset upload limit
const ATTACH_ACCEPT = 'image/*,video/*,.pdf,.doc,.docx';
const attachKind = (f) => (f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : 'file');

export default function AiStudio() {
  const navigate = useNavigate(); const posthog = usePostHog();
  const [versionRefreshKey,setVersionRefreshKey]=useState(0); const [studioMode,setStudioMode]=useState('types'); const [failedJobId,setFailedJobId]=useState(null); const [debugRetryAvailable,setDebugRetryAvailable]=useState(false); const [messages,setMessages]=useState([]); const [fileData,setFileData]=useState(null); const [appTitle,setAppTitle]=useState(null); const [input,setInput]=useState(''); const [isGenerating,setIsGenerating]=useState(false); const [genStatusLabel,setGenStatusLabel]=useState('Generating…'); const [pipeline,setPipeline]=useState({}); const [genMode,setGenMode]=useState('generate'); const [currentStage,setCurrentStage]=useState(null); const [error,setError]=useState(null); const [showContract,setShowContract]=useState(false); const scrollRef=useRef(null); const pollTimeoutRef=useRef(null);
  const [attachments,setAttachments]=useState([]); const [isUploadingAttachments,setIsUploadingAttachments]=useState(false); const [attachError,setAttachError]=useState(null); const fileInputRef=useRef(null); const uploadedAttachmentsRef=useRef(new Map());
  // Persists the generated project (zip + files) to the backend for as long
  // as this AI Studio tab stays open/active. Refresh or close naturally lets
  // this session's heartbeat stop -- see useAiStudioSession -- rather than
  // this page trying to delete anything itself.
  const aiStudioSession = useAiStudioSession();
  const aiStudioEnabled=import.meta.env.VITE_AI_STUDIO_ENABLED!=='false';
  useEffect(()=>{if(!aiStudioEnabled)navigate('/workspace',{replace:true});},[aiStudioEnabled,navigate]);
  useEffect(()=>{try{posthog?.capture('ai_studio_opened');}catch{}},[posthog]);
  useEffect(()=>{scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'});},[messages,isGenerating]);
  useEffect(()=>()=>{if(pollTimeoutRef.current)clearTimeout(pollTimeoutRef.current);},[]);
  if(!aiStudioEnabled)return null;
  // Safety-net resync only — NOT a poll loop. If the socket silently missed
  // an event (brief disconnect, etc.) this checks in once, well after the
  // job should have produced *some* stage event, rather than re-hitting the
  // backend/ai-service every couple of seconds for the whole run.
  const RESYNC_AFTER_MS=20000;
  const stageLabel=(stage)=>{if(stage.startsWith('code:'))return `Generating ${stage.slice(5)}…`;if(stage==='build-validator')return 'Validating build…';if(stage.startsWith('deployment-readiness'))return 'Checking Vercel readiness…';if(stage==='relevant-files')return 'Finding affected files…';if(stage==='edit')return 'Applying edit…';if(stage.startsWith('edit-debug'))return 'Fixing an issue…';return `${stage.charAt(0).toUpperCase()+stage.slice(1)}…`;};
  const updateProgress=(job)=>{const agents=job?.generationMeta?.agents||[]; const next={}; for(const a of agents)next[a.name]=a.status; setPipeline(next); if(job?.mode)setGenMode(job.mode); setCurrentStage(job?.currentStage||null); if(job?.currentStage)setGenStatusLabel(stageLabel(job.currentStage));};
  // Waits for a job's result over its ai-job:<jobId> socket room. Each agent
  // completion (onStage in ai-service) arrives here the moment it happens,
  // pushed via ai-service -> backend webhook -> this socket event, instead
  // of the frontend asking "done yet?" on a timer.
  const waitForJob=(jobId)=>new Promise((resolve,reject)=>{
    let lastEventAt=Date.now();
    const armResync=()=>{
      if(pollTimeoutRef.current)clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current=setTimeout(async()=>{
        if(Date.now()-lastEventAt<RESYNC_AFTER_MS)return; // an event arrived meanwhile
        try{
          const {data}=await aiGenerateAPI.getJob(jobId);
          const job=data?.data;
          if(job)updateProgress(job);
          if(job?.status==='failed'){setFailedJobId(jobId);setDebugRetryAvailable(Boolean(job.debugAvailable));}
          if(job?.status==='completed'){cleanup();resolve(job.result);return;}
          if(job?.status==='failed'){cleanup();const failure=new Error(job.error||'AI generation failed.');failure.jobId=jobId;failure.debugAvailable=Boolean(job.debugAvailable);reject(failure);return;}
        }catch(err){
          const status=err?.response?.status;
          if(status===401||status===403||status===404){cleanup();reject(err);return;}
        }
        lastEventAt=Date.now();
        armResync();
      },RESYNC_AFTER_MS);
    };
    const cleanup=()=>{unsubscribe();if(pollTimeoutRef.current){clearTimeout(pollTimeoutRef.current);pollTimeoutRef.current=null;}};
    const unsubscribe=subscribeToJob(jobId,{
      onStage:({stage,status,details})=>{
        lastEventAt=Date.now();
        if(details)setPipeline(prev=>({...prev,[stage]:status}));
        setCurrentStage(stage); setGenStatusLabel(stageLabel(stage));
      },
      onCompleted:({result})=>{cleanup();resolve(result);},
      onFailed:async({error})=>{cleanup();const failure=new Error(error||'AI generation failed.');failure.jobId=jobId;try{const {data}=await aiGenerateAPI.getJob(jobId);failure.debugAvailable=Boolean(data?.data?.debugAvailable);}catch{}reject(failure);},
    });
    armResync();
  });
  const toSandpackFiles=(files={})=>Object.fromEntries(Object.entries(files).map(([path,v])=>[path,typeof v==='string'?{code:v}:v]));
  const handleRestoreVersion=async(version)=>{
    const {data}=await aiStudioSession.restoreVersion(version);
    const project=data?.data;
    if(!project?.files)throw new Error('Restore returned no files.');
    setFileData({files:toSandpackFiles(project.files),dependencies:project.dependencies||{}});
    if(project.title)setAppTitle(project.title);
    setMessages(prev=>[...prev,{role:'assistant',content:`Switched to version ${version}. Edits from here are saved as a new version marked "Edited from v${version}".`}]);
    setVersionRefreshKey(k=>k+1);
  };
  const runGeneration=async(nextMessages,spec={})=>{setIsGenerating(true);setError(null);setFailedJobId(null);setDebugRetryAvailable(false);setPipeline({});setCurrentStage('queued');
    // Optimistic guess so the sidebar shows the right stage list immediately,
    // before the first poll response confirms the actual mode the backend
    // picked (based on whether we're sending existing project files back).
    const expectingEdit=Boolean(fileData?.files&&Object.keys(fileData.files).length);
    setGenMode(expectingEdit?'edit':'generate');
    setGenStatusLabel(expectingEdit?'Queuing edit…':'Queuing AI job…');
    try{
      const projectId=aiStudioSession.getProjectId()||await aiStudioSession.open(spec?.websiteType);
      if(!projectId)throw new Error('AI Studio project could not be initialized.');
      const {data}=await aiGenerateAPI.generate(nextMessages,fileData,{...spec,projectId});const {jobId}=data?.data||{};if(!jobId)throw new Error('No jobId returned from server.');const result=await waitForJob(jobId);setMessages(prev=>[...prev,{role:'assistant',content:result.assistantMessage||'Done.'}]);setFileData({files:result.files,dependencies:result.dependencies});if(result.title)setAppTitle(result.title);
      // Persist the latest generated state -- this is what makes the
      // project outlive an individual (30-minute-TTL'd) AI generation job.
      await aiStudioSession.syncFiles({files:result.files,dependencies:result.dependencies,title:result.title,source:expectingEdit?'edit':'generate',label:expectingEdit?String(nextMessages?.[nextMessages.length-1]?.content||'').slice(0,120):''});setVersionRefreshKey(k=>k+1);
    }catch(err){const msg=err.response?.data?.message||err.message||'Something went wrong generating your app. Please try again.';if(err.jobId){setFailedJobId(err.jobId);setDebugRetryAvailable(Boolean(err.debugAvailable));}setError(msg);setMessages(prev=>[...prev,{role:'assistant',content:`⚠️ ${msg}`}]);}finally{if(pollTimeoutRef.current){clearTimeout(pollTimeoutRef.current);pollTimeoutRef.current=null;}setIsGenerating(false);}};
  const handlePortfolioGenerate=async(prompt,spec)=>{
    const nextMessages=[{role:'user',content:prompt}];
    setStudioMode('chat');
    setMessages(nextMessages);
    try{
      let resumeAsset=null;
      if(spec?.details?.resumeFile){
        const projectId=aiStudioSession.getProjectId()||await aiStudioSession.open('portfolio');
        const uploaded=await aiStudioSession.uploadAsset(spec.details.resumeFile,projectId);
        resumeAsset=uploaded?.data?.data||null;
      }
      const images=Array.isArray(spec?.details?.images)?spec.details.images:[]; const videos=Array.isArray(spec?.details?.videos)?spec.details.videos:[];
      const media=await uploadMediaAssets('portfolio',{images,videos});
      const promptWithMedia=buildPortfolioPrompt({...spec.details,images:media.images,videos:media.videos},spec.design);
      const portfolioMessage=[{role:'user',content:promptWithMedia}];
      setMessages(portfolioMessage);
      await runGeneration(portfolioMessage,{websiteType:'portfolio',userData:{...spec?.details,images:undefined,videos:undefined},preferences:spec?.design||{},assets:buildAssetContract({resume:resumeAsset,images:media.images,videos:media.videos})});
    }catch(error){
      const msg=error?.response?.data?.message||error?.message||'Failed to save the resume to AI Studio storage.';
      setError(msg);
      setMessages(prev=>[...prev,{role:'assistant',content:`⚠️ ${msg}`}]);
    }
  };
  const uploadMediaAssets = async (websiteType, details) => {
    const images = Array.isArray(details?.images) ? details.images : [];
    const videos = Array.isArray(details?.videos) ? details.videos : [];
    if (!images.length && !videos.length) return { images: [], videos: [] };
    const projectId=aiStudioSession.getProjectId()||await aiStudioSession.open(websiteType);
    const upload = async (file, kind) => {
      const response = await aiStudioSession.uploadAsset(file,projectId);
      return { ...(response?.data?.data || {}), kind, originalName: file.name };
    };
    const [uploadedImages, uploadedVideos] = await Promise.all([
      Promise.all(images.map((file) => upload(file, 'image'))),
      Promise.all(videos.map((file) => upload(file, 'video'))),
    ]);
    return { images: uploadedImages, videos: uploadedVideos };
  };

  const handleWebsiteGenerate=async(type,details,design)=>{
    const media=await uploadMediaAssets(type,details);
    const prompt=buildWebsitePrompt(type,{...details,images:media.images,videos:media.videos},design);
    const nextMessages=[{role:'user',content:prompt}];
    setStudioMode('chat');
    setMessages(nextMessages);
    await runGeneration(nextMessages,{websiteType:type,userData:{...details,images:undefined,videos:undefined},preferences:design,assets:buildAssetContract({images:media.images,videos:media.videos})});
  };
  const handlePickFiles=(e)=>{
    const picked=Array.from(e.target.files||[]); e.target.value='';
    if(!picked.length)return;
    const next=[...attachments]; let problem=null;
    for(const f of picked){
      if(next.length>=MAX_ATTACHMENTS){problem=`You can attach up to ${MAX_ATTACHMENTS} files per message.`;break;}
      if(f.size>MAX_ATTACHMENT_BYTES){problem=`${f.name} is larger than 10 MB.`;continue;}
      next.push({id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,file:f,kind:attachKind(f),previewUrl:f.type.startsWith('image/')?URL.createObjectURL(f):null});
    }
    setAttachments(next); setAttachError(problem);
  };
  const removeAttachment=(id)=>{setAttachments(prev=>{const gone=prev.find(a=>a.id===id);if(gone?.previewUrl)URL.revokeObjectURL(gone.previewUrl);return prev.filter(a=>a.id!==id);});uploadedAttachmentsRef.current.delete(id);setAttachError(null);};
  const handleSend=async()=>{
    const trimmed=input.trim(); if(!trimmed||isGenerating||isUploadingAttachments)return;
    let content=trimmed; const pending=attachments;
    if(pending.length){
      setIsUploadingAttachments(true); setAttachError(null);
      try{
        const projectId=aiStudioSession.getProjectId()||await aiStudioSession.open('portfolio');
        // Files that uploaded on a previous (partially failed) attempt are not uploaded twice.
        for(const a of pending){
          if(uploadedAttachmentsRef.current.has(a.id))continue;
          const res=await aiStudioSession.uploadAsset(a.file,projectId); const d=res?.data?.data||{};
          uploadedAttachmentsRef.current.set(a.id,{name:d.fileName||a.file.name,kind:d.kind||a.kind});
        }
        const list=pending.map(a=>uploadedAttachmentsRef.current.get(a.id)).filter(Boolean).map(u=>`${u.name} (${u.kind})`).join(', ');
        // Edits resolve ALL of the project's assets server-side (see resolveGenerationAssets),
        // so the new uploads reach the edit agent's media manifest automatically; this note
        // just tells the model which of them the request is about.
        content=`${trimmed}\n\n[Attached for this change - now in the project's assets: ${list}. Use these uploaded files where my request refers to them.]`;
      }catch(err){
        setAttachError(err?.response?.data?.message||err?.message||'Failed to upload attachment. Please try again.');
        setIsUploadingAttachments(false); return;
      }
      setIsUploadingAttachments(false);
      pending.forEach(a=>{if(a.previewUrl)URL.revokeObjectURL(a.previewUrl);uploadedAttachmentsRef.current.delete(a.id);});
      setAttachments([]);
    }
    setInput(''); const nextMessages=[...messages,{role:'user',content}]; setMessages(nextMessages);
    runGeneration(nextMessages,{websiteType:'portfolio',userData:{},preferences:{},conversation:nextMessages});
  };
  const handleFixError=(previewError)=>{if(isGenerating)return;const prompt=`The preview threw this error, please fix it:\n\n${previewError}`;const nextMessages=[...messages,{role:'user',content:prompt}];setMessages(nextMessages);runGeneration(nextMessages,{websiteType:'portfolio',userData:{},preferences:{},conversation:nextMessages});};
  const handleDebugRetry=async()=>{
    if(!failedJobId||isGenerating)return;
    setIsGenerating(true); setError(null); setPipeline({}); setCurrentStage('queued'); setGenMode('debug'); setGenStatusLabel('Retrying with Debug Agent…');
    try{
      const {data}=await aiGenerateAPI.debugRetry(failedJobId);
      const jobId=data?.data?.jobId;
      if(!jobId)throw new Error('No debug retry jobId returned.');
      const result=await waitForJob(jobId);
      setFileData({files:result.files,dependencies:result.dependencies});
      if(result.title)setAppTitle(result.title);
      await aiStudioSession.syncFiles({files:result.files,dependencies:result.dependencies,title:result.title,source:'edit',label:'Debug repair'});setVersionRefreshKey(k=>k+1);
      setMessages(prev=>[...prev,{role:'assistant',content:result.assistantMessage||'Debug repair completed.'}]);
      setError(null); setDebugRetryAvailable(false); setFailedJobId(null);
    }catch(err){
      const msg=err.response?.data?.message||err.message||'Debug retry failed.';
      if(err.jobId){setFailedJobId(err.jobId);setDebugRetryAvailable(Boolean(err.debugAvailable));}
      setError(msg); setMessages(prev=>[...prev,{role:'assistant',content:`⚠️ ${msg}`}]);
    }finally{setIsGenerating(false);}
  };
  const handleDownload=()=>{aiStudioSession.recordActivity();};
  if(studioMode==='types')return <div className="fixed inset-0 z-40 overflow-y-auto bg-neutral-950 text-white"><div className="mx-auto max-w-6xl px-5 pb-16 pt-24 md:px-8 md:pt-28"><div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">AI Studio</p><h1 className="text-3xl font-bold tracking-tight md:text-4xl">What do you want to build?</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/40">Choose a website type first. DevDrop will then collect the information that matters for that kind of site and turn it into a detailed build specification for the AI.</p></div><div className="hidden items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/25 sm:flex"><span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-white/60">01 Choose type</span><span>→</span><span>02 Details</span><span>→</span><span>03 Design</span><span>→</span><span>04 Review</span></div></div><div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">{WEBSITE_TYPES.map(type=>{const Icon=type.icon;return <button key={type.id} type="button" disabled={!type.enabled} onClick={()=>type.enabled&&setStudioMode(type.id)} className={`group relative flex min-h-[176px] flex-col overflow-hidden rounded-[18px] border p-4 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70 ${type.enabled?'border-white/[0.09] bg-[linear-gradient(145deg,rgba(255,255,255,.05),rgba(10,10,14,.9))] shadow-[inset_0_1px_0_rgba(255,255,255,.04)] hover:-translate-y-0.5 hover:border-violet-400/60 hover:shadow-[0_0_28px_rgba(139,92,246,.16),inset_0_1px_0_rgba(255,255,255,.06)]':'cursor-not-allowed border-white/5 bg-white/[0.015] opacity-45'}`}>
<span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-white/10 bg-white/[0.04]"><Icon size={16} strokeWidth={1.35} className="text-white/60"/></span>
{type.artImage&&<img src={type.artImage} alt="" aria-hidden="true" onError={(event)=>{event.currentTarget.style.display='none';}} className="pointer-events-none absolute right-3.5 top-3.5 h-[88px] w-[46%] object-contain object-right-top opacity-90 transition-transform duration-300 origin-top-right group-hover:scale-[1.05]"/>}
<div className="relative z-10 mt-auto max-w-[80%] pt-5">
<h2 className="text-[15px] font-medium leading-5 tracking-tight text-white/90">{type.title}</h2>
<p className="mt-1 text-[11px] leading-[1.5] text-white/40">{type.description}</p>
{!type.enabled&&<p className="mt-2 text-[8px] font-bold uppercase tracking-[0.16em] text-white/25">Coming soon</p>}
</div>
{type.id==='custom'&&<span className="absolute right-3 top-3 z-20 rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-white/50">Custom</span>}
</button>;})}</div></div></div>;
  if(studioMode==='portfolio')return <div className="fixed inset-0 z-40 overflow-y-auto bg-neutral-950"><PortfolioBuilder onBack={()=>setStudioMode('types')} onGenerate={handlePortfolioGenerate}/></div>;
  if(['ecommerce','blog','landing','cafe','hotel','studio','saas','event','education','custom'].includes(studioMode))return <div className="fixed inset-0 z-40 overflow-y-auto bg-neutral-950"><WebsiteBuilder type={studioMode} onBack={()=>setStudioMode('types')} onGenerate={handleWebsiteGenerate}/></div>;
  const pipelineMode=genMode==='debug'?'debug':(genMode==='edit'?'edit':'generate');
  const {steps:pipelineSteps,percent,queued}=computePipeline({mode:pipelineMode,pipeline,isGenerating,complete:!isGenerating&&Boolean(fileData)&&!error,currentStage});
  const statusText=isGenerating?(queued?'Queued…':`${pipelineMode==='edit'?'Editing':'Generating'} (${percent}%)`):(error&&!fileData?'Failed':fileData?'Generation Complete (100%)':'Ready');
  const statusTone=isGenerating?'border-violet-500/30 bg-violet-500/10 text-violet-300':(error&&!fileData?'border-red-500/30 bg-red-500/10 text-red-300':'border-emerald-500/30 bg-emerald-500/10 text-emerald-300');
  const dotTone=isGenerating?'bg-violet-400 animate-pulse':(error&&!fileData?'bg-red-400':'bg-emerald-400');
  const firstPrompt=messages[0]?.role==='user'?messages[0].content:'';
  const chatMessages=firstPrompt?messages.slice(1):messages;
  const ruleLines=firstPrompt.split('\n').map(l=>l.replace(/^\s*[-*•]\s*/,'').trim()).filter(Boolean);
  const shownRules=showContract?ruleLines:ruleLines.slice(0,3);
  const card='rounded-2xl border border-white/[0.12] bg-[#0b0b0c]';
  return <div className="fixed inset-0 z-40 flex flex-col bg-[#070708] pt-[3.75rem] text-white">
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[360px] shrink-0 flex-col border-r border-white/[0.08]">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {firstPrompt&&<div className={`${card} p-4`}>
            <div className="mb-3 flex items-center gap-3 text-[14px] font-medium text-white"><CheckSquare className="h-5 w-5 text-white/60"/>Instructions &amp; Rules</div>
            <ul className={`space-y-1.5 text-[12px] leading-5 text-white/80 ${showContract?'max-h-72 overflow-y-auto pr-1':''}`}>{shownRules.map((r,i)=><li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/70"/><span className={showContract?'':'line-clamp-2'}>{r}</span></li>)}</ul>
            <button type="button" onClick={()=>setShowContract(v=>!v)} className="mt-3 flex w-full items-center justify-center gap-1.5 border-t border-white/[0.1] pt-2.5 text-[12px] text-white/60 hover:text-white">[ <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showContract?'rotate-180':''}`}/> {showContract?'Hide':'View'} Contract ]</button>
          </div>}
          <div className="px-1 pt-2">
            <div className="mb-2.5 text-[14px] font-semibold text-white">Build Status: <span className={isGenerating?'text-violet-300':(error&&!fileData?'text-red-300':'text-emerald-400')}>{isGenerating?(queued?'Queued':'In progress'):(error&&!fileData?'Failed':fileData?'Completed':'Idle')} ({percent}%)</span></div>
            <PipelineSteps steps={pipelineSteps} variant="compact"/>
          </div>
          {chatMessages.length>0&&<div className="space-y-3">{chatMessages.map((m,i)=><div key={i} className={`flex gap-2 ${m.role==='user'?'justify-end':'justify-start'}`}>{m.role==='assistant'&&<Bot className="mt-1 h-4 w-4 shrink-0 text-violet-400"/>}<div className={`max-w-[88%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[12px] ${m.role==='user'?'bg-violet-600 text-white':'bg-white/[0.04] text-white/80'}`}>{m.content}</div>{m.role==='user'&&<User className="mt-1 h-4 w-4 shrink-0 text-white/40"/>}</div>)}</div>}
        </div>
        <div className="shrink-0 p-5 pt-0">
          {error&&debugRetryAvailable&&!isGenerating&&<button type="button" onClick={handleDebugRetry} className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/15">Retry Debug Only</button>}
          <div className={`${card} p-3`}>
            <div className="rounded-xl border border-white/[0.12] p-3">
              <div className="flex items-start gap-2"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}}} placeholder="Describe a change to your website..." rows={2} className="flex-1 resize-none bg-transparent text-[13px] text-white placeholder:text-white/40 focus:outline-none"/><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-white"/></div>
              {(attachments.length>0||attachError)&&<div className="mt-2 space-y-1.5">
                {attachments.length>0&&<div className="flex flex-wrap gap-1.5">{attachments.map(a=><div key={a.id} className="group relative flex max-w-[150px] items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] py-1 pl-1 pr-6 text-[11px] text-white/70">
                  {a.previewUrl?<img src={a.previewUrl} alt="" className="h-6 w-6 shrink-0 rounded object-cover"/>:<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/[0.06]">{a.kind==='video'?<Film className="h-3.5 w-3.5"/>:<FileText className="h-3.5 w-3.5"/>}</span>}
                  <span className="truncate" title={a.file.name}>{a.file.name}</span>
                  <button type="button" onClick={()=>removeAttachment(a.id)} disabled={isUploadingAttachments} aria-label={`Remove ${a.file.name}`} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/40 hover:text-white disabled:opacity-40"><X className="h-3 w-3"/></button>
                </div>)}</div>}
                {attachError&&<p className="text-[11px] text-red-300">{attachError}</p>}
              </div>}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-3 text-white/45"><input ref={fileInputRef} type="file" multiple accept={ATTACH_ACCEPT} onChange={handlePickFiles} className="hidden"/><button type="button" onClick={()=>fileInputRef.current?.click()} disabled={isUploadingAttachments||attachments.length>=MAX_ATTACHMENTS} title={isGenerating?"Attach now, send once generation finishes":"Attach images, videos or files to this change"} aria-label="Attach files" className="relative hover:text-white disabled:cursor-not-allowed disabled:opacity-40"><Paperclip className="h-5 w-5"/>{attachments.length>0&&<span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-violet-500 px-1 text-[9px] font-semibold text-white">{attachments.length}</span>}</button><button type="button" disabled title="Coming soon" className="cursor-not-allowed"><Mic className="h-5 w-5"/></button></div>
                <button type="button" onClick={handleSend} disabled={!input.trim()||isGenerating||isUploadingAttachments} aria-label="Send" className="text-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">{isGenerating||isUploadingAttachments?<Loader2 className="h-5 w-5 animate-spin"/>:<Send className="h-5 w-5"/>}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="h-full min-h-0 min-w-0 flex-1 p-4"><AppPreview fileData={fileData} appTitle={appTitle} onFixError={handleFixError} isGenerating={isGenerating} pipeline={pipeline} currentStage={currentStage} onDownload={handleDownload} projectId={aiStudioSession.projectId} onListVersions={aiStudioSession.listVersions} onRestoreVersion={handleRestoreVersion} versionRefreshKey={versionRefreshKey} pipelineSteps={pipelineSteps} pipelineMode={pipelineMode} percent={percent}/></div>
    </div>
  </div>;
}