import {buildAssetContract} from '../../components/ai-studio/assetContract';
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUp, Loader2, Bot, User, Check, Circle, CheckSquare, ChevronDown, Paperclip, Mic, Sparkles, Send } from 'lucide-react';
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
  const [studioMode,setStudioMode]=useState('types'); const [failedJobId,setFailedJobId]=useState(null); const [debugRetryAvailable,setDebugRetryAvailable]=useState(false); const [messages,setMessages]=useState([]); const [fileData,setFileData]=useState(null); const [appTitle,setAppTitle]=useState(null); const [input,setInput]=useState(''); const [isGenerating,setIsGenerating]=useState(false); const [genStatusLabel,setGenStatusLabel]=useState('Generating…'); const [pipeline,setPipeline]=useState({}); const [genMode,setGenMode]=useState('generate'); const [currentStage,setCurrentStage]=useState(null); const [error,setError]=useState(null); const [showContract,setShowContract]=useState(false); const scrollRef=useRef(null); const pollTimeoutRef=useRef(null);
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
  const stageState=(key)=>{const grouped=key==='code-generation'||key==='edit-debug';const prefix=key==='code-generation'?'code:':'edit-debug';const exact=pipeline[key];const done=grouped?Object.keys(pipeline).some(k=>k.startsWith(prefix)&&pipeline[k]==='completed'):exact==='completed';const active=grouped?Object.keys(pipeline).some(k=>k.startsWith(prefix)&&(pipeline[k]==='processing'||pipeline[k]==='started')):exact==='processing'||exact==='started';return {done,active};};
  const activeStageList=genMode==='debug'?DEBUG_PIPELINE_STAGES:(genMode==='edit'?EDIT_PIPELINE_STAGES:PIPELINE_STAGES);
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
  const visibleKeys=activeStageList.filter(([k])=>!(k==='edit-debug'&&!stageState(k).active&&!stageState(k).done));
  const STUDIO_STEPS=[['Analyzing Prompt & Requirements',['requirements']],['Wireframing & Responsive Grid',['design','architecture']],['Generating Code (Tailwind UI)',['code-generation','integration']],['Asset Loading & Validation',['build-validator']]];
  const stepList=genMode==='generate'?STUDIO_STEPS:visibleKeys.map(([k,l])=>[l,[k]]);
  const stepView=([label,keys])=>{const st=keys.map(stageState);const done=!isGenerating&&fileData?true:st.every(x=>x.done);const active=!done&&isGenerating&&(st.some(x=>x.active)||st.some(x=>x.done));return <div key={label} className="flex items-center gap-2.5 text-[12.5px]"><span className="flex h-5 w-5 items-center justify-center">{done?<Check className="h-4 w-4 text-emerald-400"/>:active?<Loader2 className="h-4 w-4 animate-spin text-violet-400"/>:<Circle className="h-3.5 w-3.5 text-white/25"/>}</span><span className={done?'text-white/85':active?'text-white':'text-white/35'}>{label}</span></div>;};
  const doneCount=visibleKeys.filter(([k])=>stageState(k).done).length;
  const percent=isGenerating?Math.min(99,Math.round(doneCount/Math.max(visibleKeys.length,1)*100)):(fileData?100:0);
  const statusText=isGenerating?`Generating (${percent}%)`:(error&&!fileData?'Failed':fileData?'Generation Complete (100%)':'Ready');
  const statusTone=isGenerating?'border-violet-500/30 bg-violet-500/10 text-violet-300':(error&&!fileData?'border-red-500/30 bg-red-500/10 text-red-300':'border-emerald-500/30 bg-emerald-500/10 text-emerald-300');
  const dotTone=isGenerating?'bg-violet-400 animate-pulse':(error&&!fileData?'bg-red-400':'bg-emerald-400');
  const firstPrompt=messages[0]?.role==='user'?messages[0].content:'';
  const chatMessages=firstPrompt?messages.slice(1):messages;
  const ruleLines=firstPrompt.split('\n').map(l=>l.replace(/^\s*[-*•]\s*/,'').trim()).filter(Boolean);
  const shownRules=showContract?ruleLines:ruleLines.slice(0,3);
  const history=messages.filter(m=>m.role==='user').map(m=>m.content);
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
            <div className="mb-2.5 text-[14px] font-semibold text-white">Build Status: <span className={isGenerating?'text-violet-300':(error&&!fileData?'text-red-300':'text-emerald-400')}>{isGenerating?'In progress':(error&&!fileData?'Failed':fileData?'Completed':'Idle')} ({percent}%)</span></div>
            <div className="space-y-2">{stepList.map(stepView)}</div>
          </div>
          {chatMessages.length>0&&<div className="space-y-3">{chatMessages.map((m,i)=><div key={i} className={`flex gap-2 ${m.role==='user'?'justify-end':'justify-start'}`}>{m.role==='assistant'&&<Bot className="mt-1 h-4 w-4 shrink-0 text-violet-400"/>}<div className={`max-w-[88%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[12px] ${m.role==='user'?'bg-violet-600 text-white':'bg-white/[0.04] text-white/80'}`}>{m.content}</div>{m.role==='user'&&<User className="mt-1 h-4 w-4 shrink-0 text-white/40"/>}</div>)}</div>}
        </div>
        <div className="shrink-0 p-5 pt-0">
          {error&&debugRetryAvailable&&!isGenerating&&<button type="button" onClick={handleDebugRetry} className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/15">Retry Debug Only</button>}
          <div className={`${card} p-3`}>
            <div className="rounded-xl border border-white/[0.12] p-3">
              <div className="flex items-start gap-2"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}}} placeholder="Describe a change to your website..." rows={2} className="flex-1 resize-none bg-transparent text-[13px] text-white placeholder:text-white/40 focus:outline-none"/><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-white"/></div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-3 text-white/45"><button type="button" disabled title="Coming soon" className="cursor-not-allowed"><Paperclip className="h-5 w-5"/></button><button type="button" disabled title="Coming soon" className="cursor-not-allowed"><Mic className="h-5 w-5"/></button></div>
                <button type="button" onClick={handleSend} disabled={!input.trim()||isGenerating} aria-label="Send" className="text-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">{isGenerating?<Loader2 className="h-5 w-5 animate-spin"/>:<Send className="h-5 w-5"/>}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="h-full min-h-0 min-w-0 flex-1 p-4"><AppPreview fileData={fileData} appTitle={appTitle} onFixError={handleFixError} isGenerating={isGenerating} pipeline={pipeline} currentStage={currentStage} onDownload={handleDownload} history={history}/></div>
    </div>
  </div>;
}