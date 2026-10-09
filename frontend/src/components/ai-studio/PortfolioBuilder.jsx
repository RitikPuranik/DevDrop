import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import PortfolioDetailsStep from './PortfolioDetailsStep';
import DesignPreferencesStep from './DesignPreferencesStep';
import StudioTopBar from './StudioTopBar';
import ReviewStep from './ReviewStep';
import { buildPortfolioPrompt } from './portfolioPrompt';

const INITIAL_DETAILS = { name:'',role:'',location:'',bio:'',targetAudience:'',primaryGoal:'',phone:'',contactEmail:'',resumeFile:null,skills:[],projects:[],experience:[],education:[],achievements:[],interests:[],socialLinks:{github:'',linkedin:'',twitter:'',instagram:'',kaggle:''},ctaText:'',ctaLink:'',images:[],videos:[] };
const INITIAL_DESIGN = { style:'modern',theme:'dark',animations:'subtle',primaryColor:'#b8935a',paletteId:'amber',palette:'#b8935a, #e8d9bf, #b4583a, #2f3436, #f1f1f1',typography:'grotesk',themeTouched:false,paletteTouched:false };
export default function PortfolioBuilder({onBack,onGenerate}){
 const [step,setStep]=useState(0),[details,setDetails]=useState(INITIAL_DETAILS),[design,setDesign]=useState(INITIAL_DESIGN),[generating,setGenerating]=useState(false);
 const generate=async()=>{setGenerating(true);try{await onGenerate(buildPortfolioPrompt(details,design),{details,design});}finally{setGenerating(false);}};
 if(step===1)return <DesignPreferencesStep websiteType="portfolio" design={design} onChange={setDesign} onBack={()=>setStep(0)} onNext={()=>setStep(2)} topBar={<StudioTopBar onBack={onBack} disabled={generating} title="Portfolio builder" step={step}/>}/>;
 return <div className="studio min-h-full"><div className={`mx-auto px-5 pb-12 pt-24 md:px-8 md:pt-28 ${step===0?'max-w-6xl':'max-w-4xl'}`}><div className="mb-8 flex items-center justify-between"><button type="button" onClick={onBack} disabled={generating} className="s-btn s-btn-ghost !px-4 !py-2 !text-[12px]"><ArrowLeft size={16}/> Website types</button><div className="s-label">Portfolio builder</div></div><ol className="mb-10 flex flex-wrap items-center justify-center gap-2" aria-label="AI Studio progress">     {['Details', 'Design', 'Review'].map((label, index) => (      <li key={label} aria-current={index === step ? 'step' : undefined} className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] ${index === step ? 'border-transparent bg-[var(--s-text)] text-[#050505]' : index < step ? 'border-white/15 bg-white/5 text-[var(--s-text)]' : 'border-white/8 text-[var(--s-faint)]'}`}>       <span className="tabular-nums">{index < step ? '✓' : String(index + 1).padStart(2, '0')}</span> {label}      </li>     ))}    </ol><motion.div key={step} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.2}}>{step===0&&<PortfolioDetailsStep details={details} onChange={setDetails} onBack={onBack} onNext={()=>setStep(1)}/>} {step===2&&<div className="mx-auto max-w-4xl"><ReviewStep details={details} design={design} assets={{profileImage:null,resume:null,projectImages:[]}} onBack={()=>setStep(1)} onEditStep={setStep} onGenerate={generate} generating={generating}/></div>}</motion.div>{generating&&<div className="mt-5 flex items-center justify-center gap-2 text-xs text-[var(--s-faint)]">Questionnaire locked while the real generation pipeline is running…</div>}</div></div>;
}
