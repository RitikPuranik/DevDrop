import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUp, Loader2, Bot, User, Check, Circle } from 'lucide-react';
import { usePostHog } from '@posthog/react';
import { aiGenerateAPI } from '../../api/aiGenerate';
import AppPreview from '../../components/ai-studio/AppPreview';
import PortfolioBuilder from '../../components/ai-studio/PortfolioBuilder';
import { WEBSITE_TYPES } from '../../config/aiStudio.config';

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

export default function AiStudio() {
  const navigate = useNavigate(); const posthog = usePostHog();
  const [studioMode,setStudioMode]=useState('types'); const [messages,setMessages]=useState([]); const [fileData,setFileData]=useState(null); const [appTitle,setAppTitle]=useState(null); const [input,setInput]=useState(''); const [isGenerating,setIsGenerating]=useState(false); const [genStatusLabel,setGenStatusLabel]=useState('Generating…'); const [pipeline,setPipeline]=useState({}); const [genMode,setGenMode]=useState('generate'); const [currentStage,setCurrentStage]=useState(null); const [error,setError]=useState(null); const scrollRef=useRef(null); const pollTimeoutRef=useRef(null);
  const aiStudioEnabled=import.meta.env.VITE_AI_STUDIO_ENABLED!=='false';
  useEffect(()=>{if(!aiStudioEnabled)navigate('/workspace',{replace:true});},[aiStudioEnabled,navigate]);
  useEffect(()=>{try{posthog?.capture('ai_studio_opened');}catch{}},[posthog]);
  useEffect(()=>{scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'});},[messages,isGenerating]);
  useEffect(()=>()=>{if(pollTimeoutRef.current)clearTimeout(pollTimeoutRef.current);},[]);
  if(!aiStudioEnabled)return null;
  const POLL_INTERVAL_MS=2000;
  const stageLabel=(stage)=>{if(stage.startsWith('code:'))return `Generating ${stage.slice(5)}…`;if(stage==='build-validator')return 'Validating build…';if(stage==='relevant-files')return 'Finding affected files…';if(stage==='edit')return 'Applying edit…';if(stage.startsWith('edit-debug'))return 'Fixing an issue…';return `${stage.charAt(0).toUpperCase()+stage.slice(1)}…`;};
  const updateProgress=(job)=>{const agents=job?.generationMeta?.agents||[]; const next={}; for(const a of agents)next[a.name]=a.status; setPipeline(next); if(job?.mode)setGenMode(job.mode); setCurrentStage(job?.currentStage||null); if(job?.currentStage)setGenStatusLabel(stageLabel(job.currentStage));};
  const pollJob=(jobId)=>new Promise((resolve,reject)=>{
    let consecutivePollErrors=0;
    let pollCount=0;
    const MAX_POLL_ERRORS=30;
    const tick=async()=>{
      pollCount+=1;
      try{
        const {data}=await aiGenerateAPI.getJob(jobId);
        consecutivePollErrors=0;
        const job=data?.data;
        updateProgress(job);
        if(job?.status==='completed'){resolve(job.result);return;}
        if(job?.status==='failed'){reject(new Error(job.error||'AI generation failed.'));return;}
        pollTimeoutRef.current=setTimeout(tick,POLL_INTERVAL_MS);
      }catch(err){
        consecutivePollErrors+=1;
        const status=err?.response?.status;
        const message=err?.response?.data?.message||err?.message||'Unknown status polling error';
        console.warn('[AI Studio] Status check failed; generation may still be running', {jobId,pollCount,consecutivePollErrors,status,message});
        // A transient timeout/network/5xx must not kill an otherwise healthy
        // long-running generation. Keep polling and let the backend/ai-service
        // report the final job state on the next successful request.
        if(status===401||status===403||status===404||consecutivePollErrors>=MAX_POLL_ERRORS){
          reject(err);
          return;
        }
        pollTimeoutRef.current=setTimeout(tick,Math.min(POLL_INTERVAL_MS*consecutivePollErrors,10000));
      }
    };
    tick();
  });
  const runGeneration=async(nextMessages,spec={})=>{setIsGenerating(true);setError(null);setPipeline({});setCurrentStage('queued');
    // Optimistic guess so the sidebar shows the right stage list immediately,
    // before the first poll response confirms the actual mode the backend
    // picked (based on whether we're sending existing project files back).
    const expectingEdit=Boolean(fileData?.files&&Object.keys(fileData.files).length);
    setGenMode(expectingEdit?'edit':'generate');
    setGenStatusLabel(expectingEdit?'Queuing edit…':'Queuing AI job…');
    try{const {data}=await aiGenerateAPI.generate(nextMessages,fileData,spec);const {jobId}=data?.data||{};if(!jobId)throw new Error('No jobId returned from server.');const result=await pollJob(jobId);setMessages(prev=>[...prev,{role:'assistant',content:result.assistantMessage||'Done.'}]);setFileData({files:result.files,dependencies:result.dependencies});if(result.title)setAppTitle(result.title);}catch(err){const msg=err.response?.data?.message||err.message||'Something went wrong generating your app. Please try again.';setError(msg);setMessages(prev=>[...prev,{role:'assistant',content:`⚠️ ${msg}`}]);}finally{if(pollTimeoutRef.current){clearTimeout(pollTimeoutRef.current);pollTimeoutRef.current=null;}setIsGenerating(false);}};
  const handlePortfolioGenerate=async(prompt,spec)=>{const nextMessages=[{role:'user',content:prompt}];setStudioMode('chat');setMessages(nextMessages);await runGeneration(nextMessages,{websiteType:'portfolio',userData:spec?.details||{},preferences:spec?.design||{},assets:{profileImage:null,resume:null,projectImages:[]}});};
  const handleSend=()=>{const trimmed=input.trim();if(!trimmed||isGenerating)return;setInput('');const nextMessages=[...messages,{role:'user',content:trimmed}];setMessages(nextMessages);runGeneration(nextMessages,{websiteType:'portfolio',userData:{},preferences:{},conversation:nextMessages});};
  const handleFixError=(previewError)=>{if(isGenerating)return;const prompt=`The preview threw this error, please fix it:\n\n${previewError}`;const nextMessages=[...messages,{role:'user',content:prompt}];setMessages(nextMessages);runGeneration(nextMessages,{websiteType:'portfolio',userData:{},preferences:{},conversation:nextMessages});};
  const stageView=(key,label)=>{const grouped=key==='code-generation'||key==='edit-debug';const prefix=key==='code-generation'?'code:':'edit-debug';const exact=pipeline[key];const groupDone=grouped&&Object.keys(pipeline).some(k=>k.startsWith(prefix)&&pipeline[k]==='completed');const active=grouped?Object.keys(pipeline).some(k=>k.startsWith(prefix)&&(pipeline[k]==='processing'||pipeline[k]==='started')):exact==='processing'||exact==='started';const done=grouped?groupDone:exact==='completed';
    // The optional repair pass (edit-debug) only shows up at all if a repair
    // was actually needed -- most edits never touch it.
    if(key==='edit-debug'&&!active&&!done)return null;
    return <div key={key} className="flex items-center gap-2 text-xs"><span className="flex h-4 w-4 items-center justify-center">{done?<Check className="h-3.5 w-3.5 text-emerald-400"/>:active?<Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400"/>:<Circle className="h-3 w-3 text-white/20"/>}</span><span className={done?'text-white/70':active?'text-white':'text-white/30'}>{label}</span></div>;};
  const activeStageList=genMode==='edit'?EDIT_PIPELINE_STAGES:PIPELINE_STAGES;
  if(studioMode==='types')return <div className="fixed inset-0 z-40 overflow-y-auto bg-neutral-950 text-white"><div className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12"><button type="button" onClick={()=>navigate('/workspace')} className="mb-10 inline-flex items-center gap-2 text-sm text-white/50 hover:text-white"><ArrowLeft size={16}/> Back to DevDrop</button><div className="mb-10"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">AI Studio</p><h1 className="text-3xl font-bold tracking-tight md:text-4xl">What do you want to build?</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/40">Choose a website type first. You will then provide the information specific to that type, and DevDrop will turn it into a detailed build specification for the AI.</p></div><div className="grid gap-4 sm:grid-cols-2">{WEBSITE_TYPES.map(type=>{const Icon=type.icon;return <button key={type.id} type="button" disabled={!type.enabled} onClick={()=>type.enabled&&setStudioMode(type.id)} className={`group rounded-3xl border p-6 text-left transition-all ${type.enabled?'border-white/10 bg-white/[0.03] hover:border-violet-500/50 hover:bg-violet-500/[0.05]':'cursor-not-allowed border-white/5 bg-white/[0.015] opacity-45'}`}><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5"><Icon size={19} className="text-violet-400"/></div><h2 className="text-lg font-semibold">{type.title}</h2><p className="mt-2 text-sm leading-6 text-white/35">{type.description}</p>{!type.enabled&&<p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-white/25">Coming soon</p>}</button>;})}</div></div></div>;
  if(studioMode==='portfolio')return <div className="fixed inset-0 z-40 overflow-y-auto bg-neutral-950"><PortfolioBuilder onBack={()=>setStudioMode('types')} onGenerate={handlePortfolioGenerate}/></div>;
  return <div className="fixed inset-0 z-40 flex flex-col bg-neutral-950 text-white"><div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2"><button type="button" onClick={()=>setStudioMode('types')} className="inline-flex items-center gap-2 text-sm text-neutral-300 hover:text-white"><ArrowLeft className="h-4 w-4"/> Website types</button><span className="text-sm font-medium text-neutral-300">{appTitle||'AI Studio'}</span><span className="w-24"/></div><div className="flex min-h-0 flex-1"><div className="flex w-[380px] shrink-0 flex-col border-r border-neutral-800"><div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">{messages.map((m,i)=><div key={i} className={`flex gap-2 ${m.role==='user'?'justify-end':'justify-start'}`}>{m.role==='assistant'&&<Bot className="mt-1 h-4 w-4 shrink-0 text-violet-400"/>}<div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role==='user'?'bg-violet-600 text-white':'bg-neutral-900 text-neutral-200'}`}>{m.content}</div>{m.role==='user'&&<User className="mt-1 h-4 w-4 shrink-0 text-neutral-500"/>}</div>)}{isGenerating&&<div className="space-y-2 rounded-lg border border-white/5 bg-white/[0.02] p-3"><div className="flex items-center gap-2 text-sm text-neutral-300"><Loader2 className="h-4 w-4 animate-spin text-violet-400"/>{genStatusLabel}</div><div className="space-y-1.5">{activeStageList.map(([key,label])=>stageView(key,label))}</div></div>}</div><div className="border-t border-neutral-800 p-3"><div className="flex items-end gap-2 rounded-lg border border-neutral-700 bg-neutral-900 p-2"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}}} placeholder="Describe a change to your generated website…" rows={2} className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none"/><button type="button" onClick={handleSend} disabled={!input.trim()||isGenerating} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white disabled:cursor-not-allowed disabled:opacity-40">{isGenerating?<Loader2 className="h-4 w-4 animate-spin"/>:<ArrowUp className="h-4 w-4"/>}</button></div></div></div><div className="h-full min-h-0 flex-1"><AppPreview fileData={fileData} appTitle={appTitle} onFixError={handleFixError} isGenerating={isGenerating} pipeline={pipeline} currentStage={currentStage}/></div></div></div>;
}
