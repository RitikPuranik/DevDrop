import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Eye, XCircle, Clock, AlertTriangle, AlertCircle } from 'lucide-react';

export const TECH_OPTIONS = {
  frontend: ['React', 'Vue', 'Next.js', 'Nuxt.js', 'Svelte', 'Angular', 'Gatsby', 'Tailwind', 'Bootstrap', 'Material UI', 'Chakra UI', 'Framer Motion', 'Three.js', 'GSAP', 'WebGL', 'HTML', 'CSS', 'JavaScript', 'TypeScript', 'Redux', 'Zustand', 'React Query'],
  backend: ['Node.js', 'Express', 'NestJS', 'Django', 'Flask', 'FastAPI', 'Laravel', 'PHP', 'Ruby on Rails', 'Spring Boot', 'Java', 'Go', 'Rust', 'C#', '.NET', 'GraphQL', 'Apollo', 'REST API', 'tRPC'],
  database: ['MongoDB', 'PostgreSQL', 'MySQL', 'SQLite', 'Firebase', 'Supabase', 'Redis', 'Cassandra', 'DynamoDB', 'Oracle', 'SQL Server', 'Elasticsearch', 'Neo4j'],
  devops: ['Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Vercel', 'Render', 'Netlify', 'Heroku', 'DigitalOcean', 'GitHub Actions', 'GitLab CI', 'Jenkins', 'Terraform', 'Nginx', 'Apache', 'Cloudflare', 'Linux'],
};

export const LISTING_TYPES = [
  {
    id: 'free',
    label: 'Free',
    description: 'Good for open demos, lead generation, or portfolio exposure.',
  },
  {
    id: 'paid',
    label: 'Paid',
    description: 'Sell the template multiple times at a fixed price.',
  },
  {
    id: 'exclusive',
    label: 'Exclusive',
    description: 'Offer the project as a one-time premium sale.',
  },
];

export const LISTING_FIELD_LABELS = {
  name: 'Project name',
  description: 'Description',
  category: 'Category',
  price: 'Price',
  deployedUrl: 'Live URL',
  githubUrl: 'GitHub URL',
};

export function getListingIssue(error) {
  const data = error.response?.data;

  if (data?.requiresVerification) {
    return {
      tone: 'warning',
      title: 'Verify your email before listing',
      messages: [
        'Check your inbox for the verification email that was just sent.',
        'Open the link in that email, then come back and submit your project again.',
      ],
    };
  }

  if (data?.requiresBankDetails) {
    return {
      tone: 'warning',
      title: 'Bank details are required first',
      messages: [
        'Paid and exclusive listings need bank details on your account before submission.',
        'Add your bank details first, then try submitting the listing again.',
      ],
    };
  }

  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    return {
      tone: 'error',
      title: 'Please fix these fields',
      messages: data.errors.map(({ field, message }) => `${LISTING_FIELD_LABELS[field] || field}: ${message}`),
    };
  }

  if (data?.message === 'Free websites must have price 0') {
    return {
      tone: 'error',
      title: 'Price needs to stay at 0',
      messages: [
        'This form is currently submitting the project as a free listing.',
        'Set the price to 0 and submit again.',
      ],
    };
  }

  if (data?.message === 'Paid/exclusive websites must have price > 0') {
    return {
      tone: 'error',
      title: 'Paid listings need a price',
      messages: [
        'Paid or exclusive listings must have a price greater than 0.',
        'Enter a valid price, then submit again.',
      ],
    };
  }

  const serverError = data?.error || data?.message;

  return {
    tone: 'error',
    title: 'Submission failed',
    messages: [
      serverError && serverError !== 'Validation failed'
        ? serverError
        : 'Something went wrong on our end. Please check your fields and try again.',
    ],
  };
}

export function WishlistPreview({ previewVideo, fallback }) {
  const videoRef = useRef(null);

  return (
    <div
      className="group/preview aspect-square rounded-[24px] mb-4 relative overflow-hidden flex items-center justify-center border border-white/8 bg-[#1a1a1a]"
      onMouseEnter={() => videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => videoRef.current?.pause()}
    >
      {previewVideo ? (
        <video
          ref={videoRef}
          src={previewVideo}
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover transition-all duration-500 group-hover/preview:scale-[1.03]"
        />
      ) : fallback ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.05),_transparent_42%)] px-4 text-center">
          {fallback}
        </div>
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_42%),linear-gradient(180deg,_rgba(255,255,255,0.03),_rgba(0,0,0,0.35))] transition-all duration-500 group-hover/preview:blur-sm group-hover/preview:brightness-[0.45]" />
          <Eye className="text-white/45 transition-all duration-500 group-hover/preview:opacity-0" size={54} />
        </>
      )}
    </div>
  );
}

export function getListingPreviewFallback(status) {
  const config = {
    rejected: { icon: XCircle, label: 'Listing rejected', tone: 'text-red-400/70' },
    pending_review: { icon: Clock, label: 'Awaiting review', tone: 'text-amber-400/70' },
    changes_requested: { icon: AlertTriangle, label: 'Changes requested', tone: 'text-sky-400/70' },
  };
  const c = config[status];
  if (!c) return null;
  const Icon = c.icon;
  return (
    <div className={`flex flex-col items-center gap-2.5 ${c.tone}`}>
      <Icon size={30} strokeWidth={1.5} />
      <span className="text-[10px] font-bold uppercase tracking-[0.15em]">{c.label}</span>
    </div>
  );
}

export function StatusBadge({ status }) {
  const config = {
    approved: { label: 'Live', color: 'bg-emerald-500/85 text-white', pulse: true },
    pending_review: { label: 'Pending', color: 'bg-amber-500/85 text-white' },
    changes_requested: { label: 'Changes', color: 'bg-sky-500/85 text-white' },
    rejected: { label: 'Rejected', color: 'bg-red-500/85 text-white' },
    in_auction: { label: 'In Auction', color: 'bg-orange-500/85 text-white' },
    sold: { label: 'Sold', color: 'bg-white/85 text-black' },
  };
  const c = config[status] || { label: status, color: 'bg-white/15 text-white' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider backdrop-blur-md ${c.color}`}>
      {c.pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
        </span>
      )}
      {c.label}
    </span>
  );
}

// --- LOADING SKELETONS ---

export function Skeleton({ className = '' }) {
  return <div className={`skeleton-shimmer ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-[#121110] border border-white/8 rounded-[32px] p-4 flex flex-col justify-between h-full">
      <div>
        <Skeleton className="aspect-square rounded-[24px] mb-4" />
        <div className="px-2 space-y-2.5">
          <Skeleton className="h-4 w-2/3 rounded-full" />
          <Skeleton className="h-2.5 w-full rounded-full" />
          <Skeleton className="h-2.5 w-4/5 rounded-full" />
        </div>
      </div>
      <div className="flex items-center justify-between px-2 mt-5 pt-3 border-t border-white/8">
        <Skeleton className="h-4 w-14 rounded-full" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-xl" />
          <Skeleton className="h-8 w-8 rounded-xl" />
          <Skeleton className="h-8 w-8 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.35 }}>
          <CardSkeleton />
        </motion.div>
      ))}
    </div>
  );
}

export function BankDetailsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-[#121110] border border-white/8 rounded-3xl p-6 md:p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2.5">
            <Skeleton className="h-2.5 w-16 rounded-full" />
            <Skeleton className="h-[46px] w-full rounded-2xl" />
          </div>
          <div className="space-y-2.5">
            <Skeleton className="h-2.5 w-24 rounded-full" />
            <Skeleton className="h-[46px] w-full rounded-2xl" />
          </div>
        </div>
      </div>
      <Skeleton className="h-[52px] w-full rounded-3xl" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center rounded-[32px] border border-dashed border-white/10 bg-white/[0.015]">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/8 flex items-center justify-center mb-6">
        <Icon size={28} className="text-white/50" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-white/60 text-sm mb-8 max-w-xs">{description}</p>
      <button
        onClick={onAction}
        className="px-8 py-3 bg-[var(--accent)] text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[var(--accent-hover)] shadow-lg transition-all"
        style={{ boxShadow: '0 12px 30px -12px var(--accent-soft)' }}
      >
        {action}
      </button>
    </div>
  );
}

export function GuidancePanel({ tone = 'warning', title, messages, actionLabel, onAction, actionDisabled = false }) {
  const styles = {
    warning: {
      wrapper: 'border-amber-400/20 bg-amber-500/10',
      icon: 'text-amber-300',
      title: 'text-amber-200',
      text: 'text-amber-100/80',
      bullet: 'bg-amber-300',
      button: 'bg-amber-300 text-black hover:bg-amber-200',
    },
    error: {
      wrapper: 'border-red-400/20 bg-red-500/10',
      icon: 'text-red-300',
      title: 'text-red-200',
      text: 'text-red-100/80',
      bullet: 'bg-red-300',
      button: 'bg-red-300 text-black hover:bg-red-200',
    },
  };

  const palette = styles[tone] || styles.warning;

  return (
    <div className={`rounded-3xl border p-5 ${palette.wrapper}`}>
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className={`mt-0.5 shrink-0 ${palette.icon}`} />
        <div className="flex-1">
          <h3 className={`text-sm font-bold mb-2 ${palette.title}`}>{title}</h3>
          <div className="space-y-2">
            {messages.map((message) => (
              <div key={message} className={`flex items-start gap-2 text-sm leading-relaxed ${palette.text}`}>
                <span className={`mt-2 h-1.5 w-1.5 rounded-full shrink-0 ${palette.bullet}`} />
                <span>{message}</span>
              </div>
            ))}
          </div>
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
              className={`mt-4 rounded-2xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${palette.button}`}
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
