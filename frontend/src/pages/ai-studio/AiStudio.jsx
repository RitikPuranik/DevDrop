import {buildAssetContract} from '../../components/ai-studio/assetContract';
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUp, Loader2, Bot, User, Check, Circle } from 'lucide-react';
import { usePostHog } from '../../analytics/PostHogProvider';
import { aiGenerateAPI } from '../../api/aiGenerate';
import { subscribeToJob } from '../../api/socket';
import AppPreview from '../../components/ai-studio/AppPreview';
import PortfolioBuilder from '../../components/ai-studio/PortfolioBuilder';
import { buildPortfolioPrompt } from '../../components/ai-studio/portfolioPrompt';
import WebsiteBuilder, { buildWebsitePrompt } from '../../components/ai-studio/WebsiteBuilder';
import { WEBSITE_TYPES } from '../../config/aiStudio.config';
import { useAiStudioSession } from '../../hooks/ai-studio/useAiStudioSession';

const PIPELINE_STAGES = [
  ['requirements', 'Requirements'], ['design', 'Design'], ['architecture', 'Architecture'],
  ['code-generation', 'Code'], ['integration', 'Integration'], ['build-validator', 'Validation'],
];
// A targeted edit never runs the full pipeline above -- it only runs these
// two (rarely three, if a repair pass is needed) stages. Showing the full
// six-stage list during an edit is what made a fast, targeted edit look like
// "the whole multi-agent thing is running again", even once the backend
// itself was already only doing the small amount of work.
const EDIT_PIPELINE_STAGES = [
  ['relevant-files', 'Finding affected files'], ['edit', 'Applying edit'], ['edit-debug', 'Fixing an issue'],
];
const DEBUG_PIPELINE_STAGES = [
  ['debug-only', 'Debugging existing code'], ['build-validator', 'Re-validating build'],
];

export default function AiStudio() {
  const navigate = useNavigate(); const posthog = usePostHog();
  const [studioMode,setStudioMode]=useState('types'); const [failedJobId,setFailedJobId]=useState(null); const [debugRetryAvailable,setDebugRetryAvailable]=useState(false); const [messages,setMessages]=useState([]); const [fileData,setFileData]=useState(null); const [appTitle,setAppTitle]=useState(null); const [input,setInput]=useState(''); const [isGenerating,setIsGenerating]=useState(false); const [genStatusLabel,setGenStatusLabel]=useState('Generating…'); const [pipeline,setPipeline]=useState({}); const [genMode,setGenMode]=useState('generate'); const [currentStage,setCurrentStage]=useState(null); const [error,setError]=useState(null); const scrollRef=useRef(null); const pollTimeoutRef=useRef(null);
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
  const stageLabel=(stage)=>{if(stage.startsWith('code:'))return `Generating ${stage.slice(5)}…`;if(stage==='build-validator')return 'Validating build…';if(stage==='relevant-files')return 'Finding affected files…';if(stage==='edit')return 'Applying edit…';if(stage.startsWith('edit-debug'))return 'Fixing an issue…';return `${stage.charAt(0).toUpperCase()+stage.slice(1)}…`;};
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
      await aiStudioSession.syncFiles({files:result.files,dependencies:result.dependencies,title:result.title});
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
  const handleSend=()=>{const trimmed=input.trim();if(!trimmed||isGenerating)return;setInput('');const nextMessages=[...messages,{role:'user',content:trimmed}];setMessages(nextMessages);runGeneration(nextMessages,{websiteType:'portfolio',userData:{},preferences:{},conversation:nextMessages});};
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
      await aiStudioSession.syncFiles({files:result.files,dependencies:result.dependencies,title:result.title});
      setMessages(prev=>[...prev,{role:'assistant',content:result.assistantMessage||'Debug repair completed.'}]);
      setError(null); setDebugRetryAvailable(false); setFailedJobId(null);
    }catch(err){
      const msg=err.response?.data?.message||err.message||'Debug retry failed.';
      if(err.jobId){setFailedJobId(err.jobId);setDebugRetryAvailable(Boolean(err.debugAvailable));}
      setError(msg); setMessages(prev=>[...prev,{role:'assistant',content:`⚠️ ${msg}`}]);
    }finally{setIsGenerating(false);}
  };
  const handleDownload=()=>{aiStudioSession.recordActivity();};
  const stageView=(key,label)=>{const grouped=key==='code-generation'||key==='edit-debug';const prefix=key==='code-generation'?'code:':'edit-debug';const exact=pipeline[key];const groupDone=grouped&&Object.keys(pipeline).some(k=>k.startsWith(prefix)&&pipeline[k]==='completed');const active=grouped?Object.keys(pipeline).some(k=>k.startsWith(prefix)&&(pipeline[k]==='processing'||pipeline[k]==='started')):exact==='processing'||exact==='started';const done=grouped?groupDone:exact==='completed';
    // The optional repair pass (edit-debug) only shows up at all if a repair
    // was actually needed -- most edits never touch it.
    if(key==='edit-debug'&&!active&&!done)return null;
    return <div key={key} className="flex items-center gap-2 text-xs"><span className="flex h-4 w-4 items-center justify-center">{done?<Check className="h-3.5 w-3.5 text-emerald-400"/>:active?<Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400"/>:<Circle className="h-3 w-3 text-white/20"/>}</span><span className={done?'text-white/70':active?'text-white':'text-white/30'}>{label}</span></div>;};
  const activeStageList=genMode==='debug'?DEBUG_PIPELINE_STAGES:(genMode==='edit'?EDIT_PIPELINE_STAGES:PIPELINE_STAGES);
  if(studioMode==='types')return <div className="fixed inset-0 z-40 overflow-y-auto bg-neutral-950 text-white"><div className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12"><button type="button" onClick={()=>navigate('/workspace')} className="mb-10 inline-flex items-center gap-2 text-sm text-white/50 hover:text-white"><ArrowLeft size={16}/> Back to DevDrop</button><div className="mb-10"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">AI Studio</p><h1 className="text-3xl font-bold tracking-tight md:text-4xl">What do you want to build?</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/40">Choose a website type first. You will then provide the information specific to that type, and DevDrop will turn it into a detailed build specification for the AI.</p></div><div className="grid gap-4 sm:grid-cols-2">{WEBSITE_TYPES.map(type=>{const Icon=type.icon;return <button key={type.id} type="button" disabled={!type.enabled} onClick={()=>type.enabled&&setStudioMode(type.id)} className={`group rounded-3xl border p-6 text-left transition-all ${type.enabled?'border-white/10 bg-white/[0.03] hover:border-violet-500/50 hover:bg-violet-500/[0.05]':'cursor-not-allowed border-white/5 bg-white/[0.015] opacity-45'}`}><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5"><Icon size={19} className="text-violet-400"/></div><h2 className="text-lg font-semibold">{type.title}</h2><p className="mt-2 text-sm leading-6 text-white/35">{type.description}</p>{!type.enabled&&<p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-white/25">Coming soon</p>}</button>;})}</div></div></div>;
  if(studioMode==='portfolio')return <div className="fixed inset-0 z-40 overflow-y-auto bg-neutral-950"><PortfolioBuilder onBack={()=>setStudioMode('types')} onGenerate={handlePortfolioGenerate}/></div>;
  if(['ecommerce','blog','landing'].includes(studioMode))return <div className="fixed inset-0 z-40 overflow-y-auto bg-neutral-950"><WebsiteBuilder type={studioMode} onBack={()=>setStudioMode('types')} onGenerate={handleWebsiteGenerate}/></div>;
  return <div className="fixed inset-0 z-40 flex flex-col bg-neutral-950 text-white"><div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2"><button type="button" onClick={()=>setStudioMode('types')} className="inline-flex items-center gap-2 text-sm text-neutral-300 hover:text-white"><ArrowLeft className="h-4 w-4"/> Website types</button><span className="text-sm font-medium text-neutral-300">{appTitle||'AI Studio'}</span><span className="w-24"/></div><div className="flex min-h-0 flex-1"><div className="flex w-[380px] shrink-0 flex-col border-r border-neutral-800"><div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">{messages.map((m,i)=><div key={i} className={`flex gap-2 ${m.role==='user'?'justify-end':'justify-start'}`}>{m.role==='assistant'&&<Bot className="mt-1 h-4 w-4 shrink-0 text-violet-400"/>}<div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role==='user'?'bg-violet-600 text-white':'bg-neutral-900 text-neutral-200'}`}>{m.content}</div>{m.role==='user'&&<User className="mt-1 h-4 w-4 shrink-0 text-neutral-500"/>}</div>)}{isGenerating&&<div className="space-y-2 rounded-lg border border-white/5 bg-white/[0.02] p-3"><div className="flex items-center gap-2 text-sm text-neutral-300"><Loader2 className="h-4 w-4 animate-spin text-violet-400"/>{genStatusLabel}</div><div className="space-y-1.5">{activeStageList.map(([key,label])=>stageView(key,label))}</div></div>}</div><div className="border-t border-neutral-800 p-3">{error&&debugRetryAvailable&&!isGenerating&&<button type="button" onClick={handleDebugRetry} className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/15">Retry Debug Only</button>}<div className="flex items-end gap-2 rounded-lg border border-neutral-700 bg-neutral-900 p-2"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}}} placeholder="Describe a change to your generated website…" rows={2} className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none"/><button type="button" onClick={handleSend} disabled={!input.trim()||isGenerating} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white disabled:cursor-not-allowed disabled:opacity-40">{isGenerating?<Loader2 className="h-4 w-4 animate-spin"/>:<ArrowUp className="h-4 w-4"/>}</button></div></div></div><div className="h-full min-h-0 flex-1"><AppPreview fileData={fileData} appTitle={appTitle} onFixError={handleFixError} isGenerating={isGenerating} pipeline={pipeline} currentStage={currentStage} onDownload={handleDownload}/></div></div></div>;
}
