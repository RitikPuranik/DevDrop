import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import PortfolioDetailsStep from './PortfolioDetailsStep';
import DesignPreferencesStep from './DesignPreferencesStep';
import ReviewStep from './ReviewStep';
import { buildPortfolioPrompt } from './portfolioPrompt';

const INITIAL_DETAILS = {
  name: '',
  role: '',
  location: '',
  bio: '',
  targetAudience: '',
  primaryGoal: '',
  phone: '',
  contactEmail: '',
  resumeFile: null,
  skills: [],
  projects: [],
  experience: [],
  education: [],
  achievements: [],
  interests: [],
  socialLinks: { github: '', linkedin: '', twitter: '', instagram: '' },
  ctaText: '',
  ctaLink: '',
};

const INITIAL_DESIGN = {
  style: 'modern',
  theme: 'dark',
  animations: 'subtle',
  primaryColor: null,
};

export default function PortfolioBuilder({ onBack, onGenerate }) {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState(INITIAL_DETAILS);
  const [design, setDesign] = useState(INITIAL_DESIGN);
  const [generating, setGenerating] = useState(false);

  const prompt = useMemo(() => buildPortfolioPrompt(details, design), [details, design]);

  const generate = async () => {
    setGenerating(true);
    try {
      await onGenerate(prompt, { details, design });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-full bg-neutral-950 text-white">
      <div className="mx-auto max-w-4xl px-5 py-6 md:px-8">
        <div className="mb-8 flex items-center justify-between">
          <button type="button" onClick={onBack} disabled={generating} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white disabled:opacity-40">
            <ArrowLeft size={16} /> Website types
          </button>
          <div className="inline-flex items-center gap-2 text-xs text-white/35">
            <Sparkles size={14} className="text-violet-400" /> Portfolio builder
          </div>
        </div>

        <div className="mb-8 flex gap-2" aria-label="Portfolio builder progress">
          {['Details', 'Design', 'Review'].map((label, index) => (
            <div key={label} className="flex-1">
              <div className={`h-1.5 rounded-full ${index <= step ? 'bg-violet-500' : 'bg-white/10'}`} />
              <p className={`mt-2 text-[11px] ${index === step ? 'text-white' : 'text-white/30'}`}>{label}</p>
            </div>
          ))}
        </div>

        <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {step === 0 && (
            <PortfolioDetailsStep
              details={details}
              onChange={setDetails}
              onBack={onBack}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <DesignPreferencesStep
              design={design}
              onChange={setDesign}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <ReviewStep
              details={details}
              design={design}
              assets={{ profileImage: null, resume: null, projectImages: [] }}
              onBack={() => setStep(1)}
              onEditStep={setStep}
              onGenerate={generate}
              generating={generating}
            />
          )}
        </motion.div>

        {generating && (
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-white/40">
            <Check size={14} className="text-violet-400" /> Sending your complete portfolio specification to the AI builder…
          </div>
        )}
      </div>
    </div>
  );
}
