import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { usePostHog } from '@posthog/react';

import { aiStudioAPI } from '../../api/ai';
import { useGenerationPolling } from '../../hooks/useGenerationPolling';
import WebsiteTypeStep from '../../components/ai-studio/WebsiteTypeStep';
import PortfolioDetailsStep from '../../components/ai-studio/PortfolioDetailsStep';
import AssetsStep from '../../components/ai-studio/AssetsStep';
import DesignPreferencesStep from '../../components/ai-studio/DesignPreferencesStep';
import ReviewStep from '../../components/ai-studio/ReviewStep';
import GenerationProgress from '../../components/ai-studio/GenerationProgress';
import { AI_STUDIO_STEPS } from '../../config/aiStudio.config';

const INITIAL_DETAILS = {
  name: '',
  role: '',
  bio: '',
  targetAudience: '',
  primaryGoal: '',
  contactEmail: '',
  skills: [],
  projects: [],
  socialLinks: { github: '', linkedin: '' },
};

const INITIAL_DESIGN = { style: 'modern', theme: 'dark', animations: true, primaryColor: null };
const INITIAL_ASSETS = { profileImage: null, resume: null, projectImages: [] };

/**
 * AI Studio — Phase 6.
 *
 * Guided flow: Website Type -> Details -> Assets -> Design -> Review ->
 * Generate -> Progress -> Ready. State for every step lives here so
 * moving backward never loses input (Section 7). Only a `websiteType`
 * of "portfolio" is supported this phase (Section 4).
 */
export default function AiStudio() {
  const navigate = useNavigate();
  const posthog = usePostHog();

  // Simple configuration gate (Section 46) — DevDrop has no established
  // feature-flag platform yet, so this mirrors the same env-var pattern
  // used for other opt-in integrations rather than building one.
  const aiStudioEnabled = import.meta.env.VITE_AI_STUDIO_ENABLED !== 'false';

  React.useEffect(() => {
    if (!aiStudioEnabled) navigate('/workspace', { replace: true });
  }, [aiStudioEnabled, navigate]);

  if (!aiStudioEnabled) return null;


  const [stepIndex, setStepIndex] = useState(0); // index into AI_STUDIO_STEPS
  const [websiteType, setWebsiteType] = useState('');
  const [details, setDetails] = useState(INITIAL_DETAILS);
  const [assets, setAssets] = useState(INITIAL_ASSETS);
  const [design, setDesign] = useState(INITIAL_DESIGN);

  const [generating, setGenerating] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [jobId, setJobId] = useState(null);
  const { job, pollError } = useGenerationPolling(jobId);

  const track = useCallback((event, props) => {
    try {
      posthog?.capture(event, props);
    } catch {
      // Analytics should never break the flow.
    }
  }, [posthog]);

  const goTo = (index) => setStepIndex(index);
  const next = () => setStepIndex((i) => Math.min(i + 1, AI_STUDIO_STEPS.length - 1));
  const back = () => {
    if (stepIndex === 0) {
      navigate('/workspace');
      return;
    }
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const handleSelectWebsiteType = (type) => {
    setWebsiteType(type);
    track('website_type_selected', { type });
  };

  const startGeneration = async () => {
    setGenerating(true);
    track('generation_started', { websiteType });
    try {
      const payload = {
        websiteType,
        userData: {
          name: details.name.trim(),
          role: details.role.trim(),
          bio: details.bio.trim() || null,
          skills: details.skills,
          projects: details.projects
            .filter((p) => p.title.trim())
            .map((p) => ({ title: p.title.trim(), description: p.description.trim() || null, link: p.link.trim() || null })),
          socialLinks: {
            github: details.socialLinks.github.trim() || null,
            linkedin: details.socialLinks.linkedin.trim() || null,
          },
        },
        preferences: { style: design.style, theme: design.theme, animations: design.animations },
        // Asset references only (Section 37) — never raw binaries.
        assets: [
          ...(assets.profileImage ? [{ type: 'profile-image', url: assets.profileImage.url, name: assets.profileImage.name }] : []),
          ...(assets.resume ? [{ type: 'resume', url: assets.resume.url, name: assets.resume.name }] : []),
          ...assets.projectImages.map((img) => ({ type: 'project-image', url: img.url, name: img.name })),
        ],
      };

      const res = await aiStudioAPI.generatePortfolio(payload);
      setJobId(res.data.jobId);
      setStepIndex(AI_STUDIO_STEPS.indexOf('generating'));
    } catch (err) {
      track('generation_failed', { stage: 'submission' });
      toast.error(err.response?.data?.message || 'Could not start generation. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRetry = async () => {
    if (!jobId) return;
    setRetrying(true);
    track('generation_retried', { previousJobId: jobId });
    try {
      const res = await aiStudioAPI.retryJob(jobId);
      setJobId(res.data.jobId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not retry generation.');
    } finally {
      setRetrying(false);
    }
  };

  const resetToStart = () => {
    setJobId(null);
    setStepIndex(0);
  };

  // Fire once per terminal transition rather than on every poll tick.
  const lastTrackedStatus = React.useRef(null);
  React.useEffect(() => {
    if (!job || lastTrackedStatus.current === job.status) return;
    lastTrackedStatus.current = job.status;
    if (job.status === 'completed') track('generation_completed', { jobId: job.jobId, projectId: job.projectId });
    if (job.status === 'failed') track('generation_failed', { jobId: job.jobId, stage: job.currentStage });
  }, [job, track]);

  React.useEffect(() => {
    track('ai_studio_opened');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentStepName = AI_STUDIO_STEPS[stepIndex];

  return (
    <div className="ui-surface min-h-screen bg-[#08090a] text-[#e7e9ea]">
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-10 md:py-14">
        {currentStepName !== 'generating' && (
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-2 text-white/35 hover:text-white text-xs font-bold uppercase tracking-widest mb-8 transition-colors"
          >
            <ArrowLeft size={14} /> {stepIndex === 0 ? 'Back to Workspace' : 'Back'}
          </button>
        )}

        <AnimatePresence mode="wait">
          {currentStepName === 'websiteType' && (
            <WebsiteTypeStep value={websiteType} onChange={handleSelectWebsiteType} onNext={next} />
          )}

          {currentStepName === 'details' && (
            <PortfolioDetailsStep
              details={details}
              onChange={(d) => {
                setDetails(d);
              }}
              onBack={back}
              onNext={() => {
                track('details_completed');
                next();
              }}
            />
          )}

          {currentStepName === 'assets' && (
            <AssetsStep
              assets={assets}
              onChange={setAssets}
              onBack={back}
              onNext={() => {
                track('assets_uploaded', {
                  count: (assets.profileImage ? 1 : 0) + (assets.resume ? 1 : 0) + assets.projectImages.length,
                });
                next();
              }}
            />
          )}

          {currentStepName === 'design' && (
            <DesignPreferencesStep
              design={design}
              onChange={setDesign}
              onBack={back}
              onNext={() => {
                track('design_completed', { style: design.style, theme: design.theme });
                next();
              }}
            />
          )}

          {currentStepName === 'review' && (
            <ReviewStep
              details={details}
              design={design}
              assets={assets}
              onBack={back}
              onEditStep={goTo}
              onGenerate={startGeneration}
              generating={generating}
            />
          )}

          {currentStepName === 'generating' && (
            <GenerationProgress job={job} pollError={pollError} onRetry={handleRetry} onBackToForm={resetToStart} retrying={retrying} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
