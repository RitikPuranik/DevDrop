import React, { useRef, useState } from 'react';
import { Plus, X, Search, ChevronDown, ChevronUp, FileText, Upload, ArrowLeft, ArrowRight } from 'lucide-react';
import { Card, Field, StepHeader, MediaDrop, SpecialRequestsCard } from './studioUi';
import { INPUT, LABEL, GRAD, formatFileSize } from './studioStyles';

const URL_RE = /^https?:\/\/.+/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ─── Skill categories ─────────────────────────────────────── */
const SKILL_CATEGORIES = [
  {
    label: 'Frontend',
    color: '#60a5fa',
    skills: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Vue.js', 'Angular', 'Next.js', 'Nuxt.js', 'Svelte', 'SvelteKit', 'Remix', 'Astro', 'Tailwind CSS', 'Bootstrap', 'SASS/SCSS', 'Framer Motion', 'Three.js', 'WebGL', 'Redux', 'Zustand', 'Jotai', 'Recoil', 'Apollo Client', 'React Query', 'Storybook', 'Vite', 'Webpack'],
  },
  {
    label: 'Backend',
    color: '#34d399',
    skills: ['Node.js', 'Express.js', 'NestJS', 'FastAPI', 'Django', 'Flask', 'Laravel', 'Ruby on Rails', 'Spring Boot', 'ASP.NET Core', 'Go (Golang)', 'Rust', 'PHP', 'Python', 'Java', 'C#', 'GraphQL', 'REST API', 'gRPC', 'WebSockets', 'tRPC', 'Hono'],
  },
  {
    label: 'Databases',
    color: '#f97316',
    skills: ['PostgreSQL', 'MySQL', 'SQLite', 'MongoDB', 'Redis', 'Supabase', 'Firebase Firestore', 'DynamoDB', 'Cassandra', 'Elasticsearch', 'PlanetScale', 'CockroachDB', 'Prisma', 'Drizzle ORM', 'Sequelize', 'TypeORM', 'SQLAlchemy'],
  },
  {
    label: 'Mobile',
    color: '#a78bfa',
    skills: ['React Native', 'Flutter', 'Swift', 'SwiftUI', 'Kotlin', 'Jetpack Compose', 'Ionic', 'Expo', 'Android Development', 'iOS Development', 'Capacitor'],
  },
  {
    label: 'Cloud & DevOps',
    color: '#38bdf8',
    skills: ['AWS', 'Google Cloud', 'Azure', 'Vercel', 'Netlify', 'Railway', 'Render', 'Fly.io', 'Docker', 'Kubernetes', 'Terraform', 'GitHub Actions', 'GitLab CI/CD', 'CircleCI', 'Jenkins', 'Nginx', 'Linux', 'Bash / Shell', 'CI/CD', 'Serverless'],
  },
  {
    label: 'AI & ML',
    color: '#fb923c',
    skills: ['TensorFlow', 'PyTorch', 'Scikit-learn', 'Pandas', 'NumPy', 'Keras', 'Hugging Face', 'LangChain', 'OpenAI API', 'Stable Diffusion', 'Computer Vision', 'NLP', 'LLM Fine-tuning', 'RAG', 'Prompt Engineering', 'Jupyter', 'Matplotlib', 'Data Analysis'],
  },
  {
    label: 'Design & UI/UX',
    color: '#f472b6',
    skills: ['Figma', 'Adobe XD', 'Sketch', 'InVision', 'Framer', 'Photoshop', 'Illustrator', 'After Effects', 'Premiere Pro', 'Prototyping', 'Wireframing', 'User Research', 'Accessibility (a11y)', 'Design Systems', 'Motion Design', 'Brand Identity', 'Typography', 'Canva'],
  },
  {
    label: 'Blockchain & Web3',
    color: '#facc15',
    skills: ['Solidity', 'Ethereum', 'Hardhat', 'Foundry', 'Web3.js', 'Ethers.js', 'Wagmi', 'IPFS', 'Smart Contracts', 'DeFi', 'NFTs', 'MetaMask', 'Polygon', 'Solana'],
  },
  {
    label: 'Testing & QA',
    color: '#86efac',
    skills: ['Jest', 'Vitest', 'Playwright', 'Cypress', 'Testing Library', 'Selenium', 'Postman', 'k6', 'Unit Testing', 'Integration Testing', 'E2E Testing', 'TDD', 'BDD'],
  },
  {
    label: 'Tools & Practices',
    color: '#94a3b8',
    skills: ['Git', 'GitHub', 'GitLab', 'Agile / Scrum', 'Jira', 'Notion', 'Linear', 'VSCode', 'Vim / Neovim', 'Monorepo', 'Turborepo', 'pnpm', 'Open Source', 'Code Review', 'Technical Writing', 'System Design', 'API Design'],
  },
  {
    label: 'Embedded & IoT',
    color: '#6ee7b7',
    skills: ['C', 'C++', 'Arduino', 'Raspberry Pi', 'ESP32', 'RTOS', 'MQTT', 'Embedded Linux', 'FreeRTOS', 'STM32'],
  },
  {
    label: 'Soft Skills',
    color: '#cbd5e1',
    skills: ['Leadership', 'Mentoring', 'Public Speaking', 'Problem Solving', 'Documentation', 'Project Management', 'Communication', 'Entrepreneurship', 'Product Thinking', 'Teaching', 'Community Building'],
  },
];

/* ─── Validation ─────────────────────────────────────────────── */
export function validate(details) {
  const errors = {};
  if (!details.name.trim()) errors.name = 'Name is required.';
  if (!details.role.trim()) errors.role = 'Professional title / role is required.';
  if (details.bio.length > 2000) errors.bio = 'Bio must be under 2000 characters.';
  if (details.contactEmail && !EMAIL_RE.test(details.contactEmail)) errors.contactEmail = 'Enter a valid email address.';


  ['github', 'linkedin', 'twitter', 'instagram', 'kaggle'].forEach((key) => {
    const value = details.socialLinks[key];
    if (value && !URL_RE.test(value)) errors[`socialLinks.${key}`] = 'Must start with http:// or https://.';
  });

  details.projects.forEach((project, i) => {
    if (!project.title.trim()) errors[`project.${i}.title`] = 'Project title is required.';
    if (project.link && !URL_RE.test(project.link)) errors[`project.${i}.link`] = 'Must be a valid URL.';
  });
  return errors;
}

/* ─── SkillPicker ────────────────────────────────────────────── */
function SkillPicker({ selected, onChange }) {
  const [query, setQuery] = useState('');
  const [openCats, setOpenCats] = useState(() => new Set([SKILL_CATEGORIES[0].label]));
  const [customValue, setCustomValue] = useState('');

  const toggle = (skill) => onChange(selected.includes(skill) ? selected.filter((s) => s !== skill) : [...selected, skill]);
  const toggleCat = (label) => setOpenCats((prev) => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });
  const addCustom = () => {
    const skill = customValue.trim();
    if (!skill || selected.includes(skill)) return;
    onChange([...selected, skill]);
    setCustomValue('');
  };

  const lowerQuery = query.toLowerCase();
  const filtered = SKILL_CATEGORIES.map((cat) => ({ ...cat, skills: cat.skills.filter((s) => s.toLowerCase().includes(lowerQuery)) })).filter((cat) => cat.skills.length > 0);
  const known = new Set(SKILL_CATEGORIES.flatMap((c) => c.skills));
  const customSelected = selected.filter((s) => !known.has(s));

  return (
    <div>
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--s-faint)]" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (e.target.value) setOpenCats(new Set(SKILL_CATEGORIES.map((c) => c.label))); }}
          placeholder="Skills"
          aria-label="Search skills"
          className={`${INPUT} pl-9`}
        />
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
        {filtered.map((cat) => (
          <div key={cat.label}>
            <button type="button" onClick={() => toggleCat(cat.label)} className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-[12px] font-semibold text-[var(--s-text)] hover:text-[var(--s-text)]">
              <span>{cat.label}</span>
              {openCats.has(cat.label) ? <ChevronUp size={13} className="text-[var(--s-faint)]" /> : <ChevronDown size={13} className="text-[var(--s-faint)]" />}
            </button>
            {openCats.has(cat.label) && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {cat.skills.map((skill) => {
                  const on = selected.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggle(skill)}
                      style={on ? { borderColor: `${cat.color}99`, background: `${cat.color}26`, color: cat.color } : undefined}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${on ? '' : 'border-[var(--s-line)] bg-[var(--s-surface)] text-[var(--s-muted)] hover:border-[var(--s-line)] hover:text-[var(--s-text)]'}`}
                    >
                      {on ? '✓ ' : ''}{skill}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="py-4 text-center text-xs text-[var(--s-faint)]">No skills match &quot;{query}&quot;</p>}
      </div>

      {customSelected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {customSelected.map((skill) => (
            <button key={skill} type="button" onClick={() => toggle(skill)} className="inline-flex items-center gap-1 rounded-full border border-[var(--s-accent)] bg-[var(--s-raised)] px-2.5 py-1 text-[11px] font-medium text-[var(--s-accent)]">
              {skill} <X size={10} />
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
          placeholder="+ Add custom skill"
          className={`${INPUT} min-w-0 flex-1`}
        />
        <button type="button" onClick={addCustom} className={`rounded-xl px-4 text-xs font-semibold ${GRAD}`}>Add</button>
      </div>
      {selected.length > 0 && <p className="mt-2 text-right text-[11px] text-[var(--s-faint)]">{selected.length} selected</p>}
    </div>
  );
}

/* ─── ResumeUpload ───────────────────────────────────────────── */
const ACCEPTED_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const ACCEPTED_EXT = '.pdf,.doc,.docx';
const MAX_RESUME_BYTES = 10 * 1024 * 1024;

function ResumeUpload({ file, onChange }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const handleFile = (f) => {
    if (!f) return;
    if (!ACCEPTED_TYPES.includes(f.type) && !/\.(pdf|docx?)$/i.test(f.name)) { setError('Use a PDF, DOC or DOCX file.'); return; }
    if (f.size > MAX_RESUME_BYTES) { setError('File is larger than 10 MB.'); return; }
    setError('');
    onChange(f);
  };

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[var(--s-line)] bg-[var(--s-bg)] px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--s-raised)]"><FileText size={18} className="text-[var(--s-accent)]" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--s-text)]">{file.name}</p>
          <p className="text-[11px] text-[var(--s-faint)]">{formatFileSize(file.size)}</p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="rounded-lg p-1.5 text-[var(--s-faint)] hover:bg-[var(--s-surface)] hover:text-[var(--s-text)]" aria-label="Remove resume"><X size={16} /></button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={`flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors ${dragging ? 'border-[var(--s-accent)] bg-[var(--s-raised)]' : 'border-[var(--s-line)] bg-[var(--s-bg)]'}`}
      >
        <Upload size={26} strokeWidth={1.4} className={dragging ? 'text-[var(--s-accent)]' : 'text-[var(--s-muted)]'} />
        <p className="text-[13px] font-semibold text-[var(--s-text)]">{dragging ? 'Drop your resume here' : 'Drag & drop your resume here'}</p>
        <button type="button" onClick={() => inputRef.current?.click()} className={`rounded-lg px-4 py-1.5 text-xs font-semibold ${GRAD}`}>Browse files</button>
        <p className="text-[10px] text-[var(--s-faint)]">PDF, DOC, or DOCX • Max 10 MB</p>
        <input ref={inputRef} type="file" accept={ACCEPTED_EXT} onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} className="hidden" />
      </div>
      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

/* ─── StringList ─────────────────────────────────────────────── */
function StringList({ label, items, onChange, placeholder, addLabel = 'Add' }) {
  const [value, setValue] = useState('');
  const add = () => {
    const item = value.trim();
    if (!item || items.includes(item)) return;
    onChange([...items, item]);
    setValue('');
  };
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex gap-2">
        <input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder={placeholder} className={`${INPUT} min-w-0 flex-1`} />
        <button type="button" onClick={add} className={`inline-flex items-center gap-1 rounded-xl px-3.5 text-xs font-semibold ${GRAD}`}><Plus size={13} />{addLabel}</button>
      </div>
      {items.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span key={item} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--s-line)] bg-[var(--s-surface)] px-3 py-1 text-[11px] text-[var(--s-text)]">
              {item}
              <button type="button" onClick={() => onChange(items.filter((x) => x !== item))} aria-label={`Remove ${item}`} className="text-[var(--s-faint)] hover:text-[var(--s-text)]"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Repeatable ─────────────────────────────────────────────── */
function Repeatable({ items, onChange, fields, addLabel }) {
  const add = () => onChange([...items, Object.fromEntries(fields.map((field) => [field.key, '']))]);
  const update = (index, key, value) => onChange(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  return (
    <div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="rounded-xl border border-[var(--s-line)] bg-[var(--s-bg)] p-4">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={`Remove item ${index + 1}`} className="text-[var(--s-faint)] hover:text-[var(--s-text)]"><X size={15} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.key} className={field.multiline ? 'sm:col-span-2' : ''}>
                  <Field label={field.label} value={item[field.key]} onChange={(value) => update(index, field.key, value)} placeholder={field.placeholder} multiline={field.multiline} rows={3} error={field.errorFor?.(index)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--s-line)] py-2.5 text-xs font-semibold text-[var(--s-muted)] transition-colors hover:border-[var(--s-accent)] hover:text-[var(--s-text)]">
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  );
}

/* ─── Social ─────────────────────────────────────────────────── */
// Original brand marks (simple-icons paths; Kaggle "K" from Font Awesome), drawn bare with no tile.
const SOCIALS = [
  { key: 'github', label: 'GitHub', path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12", viewBox: '0 0 24 24', fill: '#ffffff' },
  { key: 'linkedin', label: 'LinkedIn', path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z", viewBox: '0 0 24 24', fill: '#0A66C2', knockout: true },
  { key: 'twitter', label: 'Twitter / X', path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z", viewBox: '0 0 24 24', fill: '#ffffff' },
  { key: 'instagram', label: 'Instagram', path: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077", viewBox: '0 0 24 24', fill: 'url(#igGrad)', gradient: true },
  { key: 'kaggle', label: 'Kaggle', path: "M304.2 501.5L158.4 320.3 298.2 185c2.6-2.7 1.7-10.5-5.3-10.5h-69.2c-3.5 0-7 1.8-10.5 5.3L80.9 313.5V7.5q0-7.5-7.5-7.5H21.5Q14 0 14 7.5v497q0 7.5 7.5 7.5h51.9q7.5 0 7.5-7.5v-109l30.8-29.3 110.5 140.6c3 3.5 6.5 5.3 10.5 5.3h66.9q5.25 0 6-3z", viewBox: '0 0 320 512', fill: '#20BEFF' },
];

function BrandMark({ s }) {
  return (
    <svg viewBox={s.viewBox} className="h-8 w-8 shrink-0" role="img" aria-label={s.label}>
      {s.gradient && <defs><linearGradient id="igGrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#feda75" /><stop offset=".3" stopColor="#fa7e1e" /><stop offset=".55" stopColor="#d62976" /><stop offset=".8" stopColor="#962fbf" /><stop offset="1" stopColor="#4f5bd5" /></linearGradient></defs>}
      {s.knockout && <rect x="2" y="2" width="20" height="20" fill="#ffffff" />}
      <path d={s.path} fill={s.fill} />
    </svg>
  );
}


/* ─── Main step ──────────────────────────────────────────────── */
export default function PortfolioDetailsStep({ details, onChange, onBack, onNext }) {
  const [errors, setErrors] = useState({});
  const update = (patch) => onChange({ ...details, ...patch });
  const socials = details.socialLinks || {};

  const handleNext = () => {
    const nextErrors = validate(details);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
      return;
    }
    onNext();
  };

  const projectTitleError = (i) => errors[`project.${i}.title`];
  const projectLinkError = (i) => errors[`project.${i}.link`];

  return (
    <div>
      <StepHeader accent="portfolio profile" subtitle="Provide the AI enough real info to create a portfolio that actually feels like yours." />

      <div className="grid gap-4 lg:grid-cols-12">
        <Card title="Basic Information" className="lg:col-span-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name *" value={details.name} onChange={(v) => update({ name: v })} placeholder="e.g. Ritik Puranik" error={errors.name} />
            <Field label="Professional title / role *" value={details.role} onChange={(v) => update({ role: v })} placeholder="e.g. Full Stack Developer" error={errors.role} />
            <Field label="Location" value={details.location} onChange={(v) => update({ location: v })} placeholder="e.g. Bhopal, India" />
            <Field label="Contact email" type="email" value={details.contactEmail} onChange={(v) => update({ contactEmail: v })} placeholder="you@example.com" error={errors.contactEmail} />
            <Field label="Phone" value={details.phone} onChange={(v) => update({ phone: v })} placeholder="Optional" />
          </div>
        </Card>

        <Card title="About You" className="lg:col-span-4">
          <Field label="Short bio" value={details.bio} onChange={(v) => update({ bio: v })} placeholder="A concise introduction that should appear in your hero/about content." multiline rows={4} error={errors.bio} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Target audience" value={details.targetAudience} onChange={(v) => update({ targetAudience: v })} placeholder="Recruiters, clients, ..." />
            <Field label="Primary goal" value={details.primaryGoal} onChange={(v) => update({ primaryGoal: v })} placeholder="Get hired, attract clients..." />
          </div>
        </Card>

        <Card title="Resume / CV" className="lg:col-span-4">
          <ResumeUpload file={details.resumeFile} onChange={(file) => update({ resumeFile: file })} />
        </Card>

        <Card title="Skills" className="lg:col-span-4">
          <SkillPicker selected={details.skills} onChange={(skills) => update({ skills })} />
        </Card>

        <Card title="Achievements & Awards" className="lg:col-span-4">
          <div className="space-y-4">
            <StringList label="Achievements / awards" items={details.achievements} onChange={(achievements) => update({ achievements })} placeholder="e.g. Hackathon winner" />
            <StringList label="Interests" items={details.interests} onChange={(interests) => update({ interests })} placeholder="e.g. Open source, photography" />
          </div>
        </Card>

        <Card title="Social Profiles" className="lg:col-span-4">
          <div className="space-y-2.5">
            {SOCIALS.map((s) => (
              <div key={s.key}>
                <div className="flex items-center gap-2.5">
                  <BrandMark s={s} />
                  <input
                    value={socials[s.key] || ''}
                    onChange={(e) => update({ socialLinks: { ...socials, [s.key]: e.target.value } })}
                    placeholder="https://..."
                    aria-label={s.label}
                    aria-invalid={errors[`socialLinks.${s.key}`] ? 'true' : undefined}
                    className={`${INPUT} min-w-0 flex-1 ${errors[`socialLinks.${s.key}`] ? '!border-red-500/60' : ''}`}
                  />
                </div>
                {errors[`socialLinks.${s.key}`] && <p className="mt-1 pl-[46px] text-[11px] text-red-400">{errors[`socialLinks.${s.key}`]}</p>}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Media Assets" className="lg:col-span-5">
          <p className="-mt-2 mb-3 text-[11px] text-[var(--s-faint)]">Optional. The AI can use these in your website.</p>
          <div className="grid grid-cols-2 gap-3">
            <MediaDrop kind="image" list={details.images || []} onChange={(images) => update({ images })} />
            <MediaDrop kind="video" list={details.videos || []} onChange={(videos) => update({ videos })} />
          </div>
        </Card>

        <Card title="Projects" className="lg:col-span-7">
          <Repeatable items={details.projects} onChange={(projects) => update({ projects })} addLabel="Add project" fields={[
            { key: 'title', label: 'Project title', placeholder: 'Project name', errorFor: projectTitleError },
            { key: 'link', label: 'Project URL', placeholder: 'https://...', errorFor: projectLinkError },
            { key: 'description', label: 'Description', placeholder: 'What did you build and why?', multiline: true },
          ]} />
        </Card>

        <Card title="Experience" className="lg:col-span-6">
          <Repeatable items={details.experience} onChange={(experience) => update({ experience })} addLabel="Add experience" fields={[
            { key: 'role', label: 'Role', placeholder: 'Software Engineer' },
            { key: 'company', label: 'Company / organization', placeholder: 'Company name' },
            { key: 'period', label: 'Period', placeholder: '2024 - Present' },
            { key: 'description', label: 'What you did', placeholder: 'Responsibilities and impact', multiline: true },
          ]} />
        </Card>

        <Card title="Education" className="lg:col-span-6">
          <Repeatable items={details.education} onChange={(education) => update({ education })} addLabel="Add education" fields={[
            { key: 'degree', label: 'Degree / course', placeholder: 'B.Tech Computer Science' },
            { key: 'institution', label: 'Institution', placeholder: 'University / college' },
            { key: 'period', label: 'Period', placeholder: '2022 - 2026' },
          ]} />
        </Card>

        <SpecialRequestsCard className="lg:col-span-12" value={details.specialRequests || ''} onChange={(v) => update({ specialRequests: v })} placeholder="Tell the AI about any specific section, layout, animation, wording, reference, feature, or preference you want." side={<>
          <Field label="Main CTA text" value={details.ctaText} onChange={(v) => update({ ctaText: v })} placeholder="Let's work together" />
          <Field label="Main CTA link" value={details.ctaLink} onChange={(v) => update({ ctaLink: v })} placeholder="mailto:you@example.com or https://..." />
        </>} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-[var(--s-line)] bg-[var(--s-surface)] px-5 py-3 text-[13px] font-semibold text-[var(--s-muted)] transition-colors hover:text-[var(--s-text)]">
          <ArrowLeft size={14} /> Previous Step
        </button>
        <div className="flex items-center gap-3">
          {Object.keys(errors).length > 0 && <span className="text-xs text-red-400">Fix the highlighted fields to continue.</span>}
          <button type="button" onClick={handleNext} className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[13px] font-semibold  transition-opacity hover:opacity-90 ${GRAD}`}>
            Continue to Design <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export { validate as validatePortfolioDetails };
