import {buildAssetContract} from '../../components/ai-studio/assetContract';
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowUp, Loader2, Bot, User, CheckSquare, ChevronDown, Paperclip, Mic, Sparkles, Send, X, Film, FileText } from 'lucide-react';
import { usePostHog } from '../../analytics/PostHogProvider';
import { aiGenerateAPI } from '../../api/aiGenerate';
import { subscribeToJob } from '../../api/socket';
import AppPreview from '../../components/ai-studio/AppPreview';
import { computePipeline } from '../../components/ai-studio/pipelineSteps';
import TypeArt from '../../components/ai-studio/TypeArt';
import BuildStatusCard from '../../components/ai-studio/BuildStatusCard';
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
  const [studioMode,setStudioMode]=useState('types'); const [mobileView,setMobileView]=useState('chat'); const [failedJobId,setFailedJobId]=useState(null); const [debugRetryAvailable,setDebugRetryAvailable]=useState(false); const [messages,setMessages]=useState([]); const [fileData,setFileData]=useState(null); const [appTitle,setAppTitle]=useState(null); const [input,setInput]=useState(''); const [isGenerating,setIsGenerating]=useState(false); const [genStatusLabel,setGenStatusLabel]=useState('Generating…'); const [pipeline,setPipeline]=useState({}); const [genMode,setGenMode]=useState('generate'); const [currentStage,setCurrentStage]=useState(null); const [error,setError]=useState(null); const [showContract,setShowContract]=useState(false); const scrollRef=useRef(null); const pollTimeoutRef=useRef(null);
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
  const [versionRefreshKey,setVersionRefreshKey]=useState(0);
  const toSandpackFiles=(files={})=>Object.fromEntries(Object.entries(files).map(([path,v])=>[path,typeof v==='string'?{code:v}:v]));
  const handleRestoreVersion=async(version)=>{
    const {data}=await aiStudioSession.restoreVersion(version);
    const project=data?.data;
    if(!project?.files)throw new Error('Restore returned no files.');
    setFileData({files:toSandpackFiles(project.files),dependencies:project.dependencies||{}});
    if(project.title)setAppTitle(project.title);
    setMessages(prev=>[...prev,{role:'assistant',content:`↩️ Restored version ${version}. Your previous version is still in the Versions list.`}]);
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
      const {data}=await aiGenerateAPI.generate(nextMessages,fileData,{...spec,projectId});const {jobId}=data?.data||{};if(!jobId)throw new Error('No jobId returned from server.');const result=await waitForJob(jobId);setMessages(prev=>[...prev,{role:'assistant',content:result.assistantMessage||'Done.'}]);setFileData({files:result.files,dependencies:result.dependencies});setMobileView('preview');if(result.title)setAppTitle(result.title);
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
  if(studioMode==='types')return <div key="studio-types" className="studio fixed inset-0 z-40 overflow-y-auto">
  <div className="mx-auto max-w-[1300px] px-4 pb-24 pt-28 sm:px-6 md:px-10 md:pt-36">
    <header className="mb-14 space-y-4 text-center md:mb-16">
      <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider">AI Studio</span>
      <h1 className="s-display text-4xl font-bold tracking-tight md:text-6xl">What do you want to <span className="text-[var(--s-hi)]">build?</span></h1>
      <p className="mx-auto max-w-xl text-sm leading-7 text-[var(--s-muted)] md:text-base">Choose a website type. We&apos;ll ask only what matters for it, then turn your answers into a ready-to-ship build.</p>
    </header>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">{WEBSITE_TYPES.map((type,idx)=>{const Icon=type.icon;return <motion.button key={type.id} type="button" disabled={!type.enabled} onClick={()=>type.enabled&&setStudioMode(type.id)} initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{duration:0.4,delay:idx*0.04}} className={`group s-card flex flex-col overflow-hidden text-left transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--s-text)] ${type.enabled?'hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.05]':'cursor-not-allowed opacity-45'}`}>
<div className="relative h-48 overflow-hidden border-b border-[var(--s-line)]"><div className={`h-full w-full ${type.enabled?'transition-transform duration-500 ease-out group-hover:scale-[1.06]':'grayscale'}`}><TypeArt id={type.id}/></div></div>
<div className="flex flex-1 flex-col p-6">
<h2 className="s-display text-[22px] leading-7">{type.title}</h2>
<p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--s-muted)]">{type.description}</p>
{type.enabled?<span className="mt-5 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]">Start <span className="transition-transform duration-300 group-hover:translate-x-1">→</span></span>:<span className="s-label mt-5">Coming soon</span>}
</div>
</motion.button>;})}</div>
  </div>
</div>;
  if(studioMode==='portfolio')return <div key="studio-portfolio" className="studio fixed inset-0 z-40 overflow-y-auto"><PortfolioBuilder onBack={()=>setStudioMode('types')} onGenerate={handlePortfolioGenerate}/></div>;
  if(['ecommerce','blog','landing','cafe','hotel','studio','saas','event','education','custom'].includes(studioMode))return <div key={`studio-${studioMode}`} className="studio fixed inset-0 z-40 overflow-y-auto"><WebsiteBuilder type={studioMode} onBack={()=>setStudioMode('types')} onGenerate={handleWebsiteGenerate}/></div>;
  const pipelineMode=genMode==='debug'?'debug':(genMode==='edit'?'edit':'generate');
  const {steps:pipelineSteps,percent,queued}=computePipeline({mode:pipelineMode,pipeline,isGenerating,complete:!isGenerating&&Boolean(fileData)&&!error,currentStage});
  const firstPrompt=messages[0]?.role==='user'?messages[0].content:'';
  const chatMessages=firstPrompt?messages.slice(1):messages;
  const ruleLines=firstPrompt.split('\n').map(l=>l.replace(/^\s*[-*•]\s*/,'').trim()).filter(Boolean);
  const shownRules=showContract?ruleLines:ruleLines.slice(0,3);
  const history=messages.filter(m=>m.role==='user').map(m=>m.content);
  const card='s-card';
  return <div className="studio fixed inset-0 z-40 flex flex-col pt-[3.75rem]">
    <div className="flex shrink-0 gap-2 border-b border-[var(--s-line)] p-2 lg:hidden" role="tablist" aria-label="Studio view">
      {[['chat','Chat'],['preview','Preview']].map(([id,label])=><button key={id} type="button" role="tab" aria-selected={mobileView===id} onClick={()=>setMobileView(id)} className={`flex-1 rounded-full px-4 py-2 text-[12px] font-bold uppercase tracking-[0.12em] transition-colors ${mobileView===id?'bg-[var(--s-text)] text-[#050505]':'border border-white/10 text-[var(--s-muted)]'}`}>{label}</button>)}
    </div>
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className={`${mobileView==='chat'?'flex':'hidden'} min-h-0 w-full flex-1 flex-col lg:flex lg:w-[380px] lg:flex-none lg:shrink-0 lg:border-r lg:border-[var(--s-line)]`}>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
          {firstPrompt&&<div className="overflow-hidden rounded-2xl border border-[var(--s-line)]">
            <button type="button" onClick={()=>setShowContract(v=>!v)} aria-expanded={showContract} className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left">
              <CheckSquare className="h-4 w-4 text-[var(--s-muted)]"/>
              <span className="flex-1 text-[13px] font-medium text-[var(--s-text)]">Your brief</span>
              <span className="text-[11px] text-[var(--s-faint)]">{ruleLines.length} points</span>
              <ChevronDown className={`h-4 w-4 text-[var(--s-faint)] transition-transform ${showContract?'rotate-180':''}`}/>
            </button>
            {showContract&&<ul className="max-h-64 space-y-1.5 overflow-y-auto border-t border-[var(--s-line)] px-3.5 py-3 text-[12px] leading-5 text-[var(--s-muted)]">{ruleLines.map((r,i)=><li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--s-faint)]"/><span>{r}</span></li>)}</ul>}
          </div>}
          {chatMessages.map((m,i)=>m.role==='user'
            ?<div key={i} className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-white/[0.07] px-3.5 py-2.5 text-[13px] leading-5 text-[var(--s-text)]">{m.content}</div>
            :<div key={i} className="flex gap-2.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.07]"><Sparkles className="h-3 w-3 text-[var(--s-text)]"/></span><div className="whitespace-pre-wrap text-[13px] leading-6 text-[var(--s-muted)]">{m.content}</div></div>)}
          <BuildStatusCard steps={pipelineSteps} percent={percent} isGenerating={isGenerating} queued={queued} failed={Boolean(error&&!fileData)} completed={Boolean(fileData)&&!error}/>
        </div>
        <div className="mb-14 shrink-0 px-4 pb-4 lg:mb-0">
          {error&&debugRetryAvailable&&!isGenerating&&<button type="button" onClick={handleDebugRetry} className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--s-line-strong)] px-3 py-2 text-xs font-medium text-[var(--s-text)] transition-colors hover:bg-white/[0.06]">Retry with Debug Agent</button>}
          <div className="rounded-2xl border border-[var(--s-line-strong)] bg-[var(--s-surface)] p-3 transition-colors focus-within:border-white/30">
            <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}}} placeholder="Describe a change to your website…" rows={2} className="w-full resize-none bg-transparent text-[13px] leading-5 text-[var(--s-text)] placeholder:text-[var(--s-faint)] focus:outline-none"/>
            {(attachments.length>0||attachError)&&<div className="mt-2 space-y-1.5">
              {attachments.length>0&&<div className="flex flex-wrap gap-1.5">{attachments.map(a=><div key={a.id} className="relative flex max-w-[150px] items-center gap-1.5 rounded-lg border border-[var(--s-line)] bg-white/[0.03] py-1 pl-1 pr-6 text-[11px] text-[var(--s-muted)]">
                {a.previewUrl?<img src={a.previewUrl} alt="" className="h-6 w-6 shrink-0 rounded object-cover"/>:<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/[0.05]">{a.kind==='video'?<Film className="h-3.5 w-3.5"/>:<FileText className="h-3.5 w-3.5"/>}</span>}
                <span className="truncate" title={a.file.name}>{a.file.name}</span>
                <button type="button" onClick={()=>removeAttachment(a.id)} disabled={isUploadingAttachments} aria-label={`Remove ${a.file.name}`} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--s-faint)] hover:text-[var(--s-text)] disabled:opacity-40"><X className="h-3 w-3"/></button>
              </div>)}</div>}
              {attachError&&<p className="text-[11px] text-[var(--s-err)]">{attachError}</p>}
            </div>}
            <div className="mt-2 flex items-center justify-between">
              <input ref={fileInputRef} type="file" multiple accept={ATTACH_ACCEPT} onChange={handlePickFiles} className="hidden"/>
              <button type="button" onClick={()=>fileInputRef.current?.click()} disabled={isUploadingAttachments||attachments.length>=MAX_ATTACHMENTS} title={isGenerating?"Attach now, send once generation finishes":"Attach images, videos or files to this change"} aria-label="Attach files" className="relative flex h-8 w-8 items-center justify-center rounded-full text-[var(--s-muted)] transition-colors hover:bg-white/[0.07] hover:text-[var(--s-text)] disabled:cursor-not-allowed disabled:opacity-40"><Paperclip className="h-4 w-4"/>{attachments.length>0&&<span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[var(--s-text)] px-1 text-[9px] font-bold text-[#050505]">{attachments.length}</span>}</button>
              <button type="button" onClick={handleSend} disabled={!input.trim()||isGenerating||isUploadingAttachments} aria-label="Send" className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--s-text)] text-[#050505] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-[var(--s-faint)]">{isGenerating||isUploadingAttachments?<Loader2 className="h-4 w-4 animate-spin"/>:<ArrowUp className="h-4 w-4"/>}</button>
            </div>
          </div>
        </div>
      </div>
      <div className={`${mobileView==="preview"?"block":"hidden"} h-full min-h-0 min-w-0 flex-1 p-2 sm:p-4 lg:block`}><AppPreview fileData={fileData} appTitle={appTitle} onFixError={handleFixError} isGenerating={isGenerating} pipeline={pipeline} currentStage={currentStage} onDownload={handleDownload} history={history} projectId={aiStudioSession.projectId} onListVersions={aiStudioSession.listVersions} onRestoreVersion={handleRestoreVersion} versionRefreshKey={versionRefreshKey} pipelineSteps={pipelineSteps} pipelineMode={pipelineMode} percent={percent}/></div>
    </div>
  </div>;
}