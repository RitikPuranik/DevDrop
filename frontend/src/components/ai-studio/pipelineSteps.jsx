import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

// ONE definition of the AI Studio progress steps, used by BOTH the left
// sidebar and the preview overlay so they can never disagree. It is mode-aware:
//   generate -> full multi-agent pipeline
//   edit     -> the small targeted-edit orchestrator (relevant-files -> edit -> repair)
//   debug    -> debug-only retry
// `pipeline` is { stageName: 'started'|'processing'|'completed'|'failed' } as
// reported by the ai-service. Stage names: requirements, design, architecture,
// code:<path> (one per file), integration, build-validator, debug:<n>, deployment-readiness:<n>,
// relevant-files, edit, edit-debug:<n>, debug-only.

const ACTIVE = new Set(['started', 'processing']);
const named = (p, test) => Object.entries(p).filter(([name]) => test(name));
const isCode = (n) => n.startsWith('code:');
const anyActive = (p, test) => named(p, test).some(([, s]) => ACTIVE.has(s));
const countDone = (p, test) => named(p, test).filter(([, s]) => s === 'completed').length;

const STEP_DEFS = {
  generate: [
    {
      id: 'requirements', label: 'Analyzing Prompt & Requirements', description: 'Understanding your website requirements',
      isDone: (p) => p.requirements === 'completed',
    },
    {
      id: 'design', label: 'Wireframing & Responsive Grid', description: 'Creating the design system and planning pages & components',
      isDone: (p) => p.design === 'completed' && p.architecture === 'completed',
    },
    {
      id: 'code', label: 'Generating Code (Tailwind UI)', description: 'Writing and connecting the React files',
      // Code generation emits one stage PER FILE, so "one file finished" must
      // not mean "coding is done": this step is only done once the integration
      // stage (which runs after every file) -- or the build -- has been reached.
      isDone: (p) => p.integration === 'completed' || Boolean(p['build-validator']),
      detail: (p) => {
        const written = countDone(p, isCode);
        if (p.integration && ACTIVE.has(p.integration)) return 'Connecting files…';
        return written > 0 ? `${written} file${written === 1 ? '' : 's'} written` : null;
      },
    },
    {
      id: 'validation', label: 'Asset Loading & Validation', description: 'Running final syntax and build checks',
      isDone: (p) => p['build-validator'] === 'completed' && !anyActive(p, (n) => n.startsWith('debug:') || n.startsWith('deployment-readiness')),
      detail: (p) => {
        if (anyActive(p, (n) => n.startsWith('debug:'))) return 'Fixing an issue…';
        if (anyActive(p, (n) => n.startsWith('deployment-readiness'))) return 'Checking it will work on Vercel…';
        return null;
      },
    },
  ],
  edit: [
    {
      id: 'relevant-files', label: 'Finding affected files', description: 'Locating the files your change touches',
      isDone: (p) => p['relevant-files'] === 'completed',
    },
    {
      id: 'edit', label: 'Applying your change', description: 'Making the smallest safe change',
      isDone: (p) => p.edit === 'completed',
    },
    {
      // Validation here is a fast local check with no stage event of its own;
      // this step simply completes together with the job.
      id: 'edit-validate', label: 'Validating the result', description: 'Checking the edited code still builds',
      isDone: () => false,
      detail: (p) => (anyActive(p, (n) => n.startsWith('edit-debug')) ? 'Repairing an issue…' : null),
    },
  ],
  debug: [
    {
      id: 'debug-only', label: 'Debugging existing code', description: 'Repairing the last failed generation',
      isDone: (p) => p['debug-only'] === 'completed',
    },
    {
      id: 'build-validator', label: 'Re-validating build', description: 'Running final syntax and build checks',
      isDone: (p) => p['build-validator'] === 'completed',
    },
  ],
};

export const PIPELINE_TITLES = {
  generate: 'AI is building your website',
  edit: 'AI is applying your change',
  debug: 'AI is repairing your website',
};

/**
 * @param {{mode:'generate'|'edit'|'debug', pipeline:object, isGenerating:boolean, complete:boolean, currentStage?:string}} args
 * @returns {{steps: Array, percent: number, queued: boolean}}
 */
export function computePipeline({ mode = 'generate', pipeline = {}, isGenerating, complete, currentStage }) {
  const defs = STEP_DEFS[mode] || STEP_DEFS.generate;
  const queued = Boolean(isGenerating) && (!currentStage || currentStage === 'queued') && Object.keys(pipeline).length === 0;
  let liveAssigned = false;
  const steps = defs.map((def) => {
    let state = 'pending';
    if (complete) state = 'done';
    else if (def.isDone(pipeline)) state = 'done';
    else if (isGenerating && !liveAssigned) { state = 'active'; liveAssigned = true; } // first unfinished step is the live one
    let detail = state === 'active' && def.detail ? def.detail(pipeline) : null;
    if (state === 'active' && queued && !detail) detail = 'Queued — starting…';
    return { id: def.id, label: def.label, description: def.description, state, detail };
  });

  const done = steps.filter((s) => s.state === 'done').length;
  const hasLive = steps.some((s) => s.state === 'active');
  let percent;
  if (complete) percent = 100;
  else if (!isGenerating) percent = Math.round((done / steps.length) * 100);
  else percent = Math.min(99, Math.round(((done + (hasLive && !queued ? 0.4 : 0)) / steps.length) * 100));
  return { steps, percent, queued };
}

/** Same data in the sidebar ("compact", a connected timeline) and elsewhere ("detailed"). */
export function PipelineSteps({ steps, variant = 'compact' }) {
  const detailed = variant === 'detailed';
  return (
    <ol className="relative">
      {steps.map((step, idx) => {
        const { state } = step;
        const last = idx === steps.length - 1;
        return (
          <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && (
              <span className="absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px overflow-hidden bg-white/10" aria-hidden="true">
                <motion.span
                  className="block w-full bg-gradient-to-b from-[var(--s-ok)] to-[var(--s-hi)]"
                  initial={false}
                  animate={{ height: state === 'done' ? '100%' : '0%' }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </span>
            )}
            <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center">
              {state === 'active' && <span className="sg-orb-pulse !border-[var(--s-hi)]/60" />}
              <AnimatePresence mode="wait" initial={false}>
                {state === 'done' ? (
                  <motion.span key="d" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }} className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--s-ok)]/15 ring-1 ring-[var(--s-ok)]/40">
                    <Check className="h-3.5 w-3.5 text-[var(--s-ok)]" strokeWidth={3} />
                  </motion.span>
                ) : state === 'active' ? (
                  <motion.span key="a" initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--s-hi)]/15 ring-1 ring-[var(--s-hi)]/50">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--s-hi)]" />
                  </motion.span>
                ) : (
                  <motion.span key="p" className="flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-white/10">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <div className="min-w-0 flex-1 pt-[3px]">
              <div className={`text-[12.5px] font-medium leading-tight transition-colors ${state === 'pending' ? 'text-[var(--s-faint)]' : 'text-[var(--s-text)]'}`}>
                {step.label}
              </div>
              {step.detail && <p className="mt-1 text-[11px] text-[var(--s-hi)]">{step.detail}</p>}
              {detailed && <p className="mt-0.5 text-[10px] text-[var(--s-faint)]">{step.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
