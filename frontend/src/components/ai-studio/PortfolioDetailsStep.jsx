import React, { useRef, useState } from 'react';
import { Plus, X, Search, ChevronDown, ChevronUp, FileText, Upload } from 'lucide-react';
import StepShell from './StepShell';

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


  ['github', 'linkedin', 'twitter', 'instagram'].forEach((key) => {
    const value = details.socialLinks[key];
    if (value && !URL_RE.test(value)) errors[`socialLinks.${key}`] = 'Must start with http:// or https://.';
  });

  details.projects.forEach((project, i) => {
    if (!project.title.trim()) errors[`project.${i}.title`] = 'Project title is required.';
    if (project.link && !URL_RE.test(project.link)) errors[`project.${i}.link`] = 'Must be a valid URL.';
  });
  return errors;
}

/* ─── Field ──────────────────────────────────────────────────── */
function Field({ label, value, onChange, placeholder, multiline = false, error, type = 'text' }) {
  const Component = multiline ? 'textarea' : 'input';
  return (
    <div>
      <label className="mb-2 block text-[13px] font-semibold text-[#c9a876]">{label}</label>
      <Component
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? 4 : undefined}
        className={`w-full rounded-xl border bg-white/[0.03] px-4 py-3 text-sm focus:outline-none ${error ? 'border-red-500/50' : 'border-white/10 focus:border-[#8b7355]/50'}`}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

/* ─── SkillPicker ────────────────────────────────────────────── */
function SkillPicker({ selected, onChange }) {
  const [query, setQuery] = useState('');
  const [openCats, setOpenCats] = useState(() => new Set([SKILL_CATEGORIES[0].label]));
  const [customValue, setCustomValue] = useState('');

  const toggle = (skill) => {
    if (selected.includes(skill)) onChange(selected.filter((s) => s !== skill));
    else onChange([...selected, skill]);
  };

  const toggleCat = (label) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const addCustom = () => {
    const skill = customValue.trim();
    if (!skill || selected.includes(skill)) return;
    onChange([...selected, skill]);
    setCustomValue('');
  };

  const lowerQuery = query.toLowerCase();
  const filtered = SKILL_CATEGORIES.map((cat) => ({
    ...cat,
    skills: cat.skills.filter((s) => s.toLowerCase().includes(lowerQuery)),
  })).filter((cat) => cat.skills.length > 0);

  return (
    <div>
      <label className="mb-1 block text-[13px] font-semibold text-[#c9a876]">Skills</label>
      <p className="mb-3 text-[11px] text-white/40">Click to select • Browse categories or search • Add custom skills below.</p>

      {/* Selected pills */}
      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {selected.map((skill) => (
            <span
              key={skill}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-violet-600/30 border border-violet-500/40 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-600/50 transition-colors"
              onClick={() => toggle(skill)}
            >
              {skill} <X size={10} />
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value) setOpenCats(new Set(SKILL_CATEGORIES.map((c) => c.label)));
          }}
          placeholder="Search skills…"
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:border-violet-500/50"
        />
      </div>

      {/* Category list */}
      <div className="space-y-1 rounded-xl border border-white/8 bg-[#080808] p-3 max-h-72 overflow-y-auto">
        {filtered.map((cat) => (
          <div key={cat.label}>
            <button
              type="button"
              onClick={() => toggleCat(cat.label)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[12px] font-bold hover:bg-white/5 transition-colors"
              style={{ color: cat.color }}
            >
              <span>{cat.label}</span>
              {openCats.has(cat.label) ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {openCats.has(cat.label) && (
              <div className="mt-1.5 mb-2 flex flex-wrap gap-1.5 pl-2">
                {cat.skills.map((skill) => {
                  const isSelected = selected.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggle(skill)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                        isSelected
                          ? 'border-violet-500/60 bg-violet-600/30 text-violet-200'
                          : 'border-white/8 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white/80'
                      }`}
                    >
                      {isSelected ? '✓ ' : ''}{skill}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="py-4 text-center text-xs text-white/30">No skills match "{query}"</p>
        )}
      </div>

      {/* Add custom skill */}
      <div className="mt-3 flex gap-2">
        <input
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
          placeholder="Add a custom skill…"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm focus:outline-none"
        />
        <button type="button" onClick={addCustom} className="rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold hover:bg-white/10 transition-colors">
          Add
        </button>
      </div>

      {selected.length > 0 && (
        <p className="mt-2 text-right text-[11px] text-white/30">{selected.length} skill{selected.length !== 1 ? 's' : ''} selected</p>
      )}
    </div>
  );
}

/* ─── ResumeUpload ───────────────────────────────────────────── */
const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ACCEPTED_EXT = '.pdf,.doc,.docx';

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ResumeUpload({ file, onChange }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (f) => {
    if (!f) return;
    if (!ACCEPTED_TYPES.includes(f.type) && !/\.(pdf|docx?)$/i.test(f.name)) return;
    onChange(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    handleFile(f);
  };

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const onInputChange = (e) => {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const remove = () => onChange(null);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <FileText size={14} className="text-[#c9a876]" />
        <label className="text-[13px] font-semibold text-[#c9a876]">Resume / CV</label>
      </div>

      {!file ? (
        /* ── Dropzone ── */
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all ${
            dragging
              ? 'border-violet-500 bg-violet-500/10'
              : 'border-white/12 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
          }`}
        >
          <div className={`rounded-full p-3 transition-colors ${dragging ? 'bg-violet-500/20' : 'bg-white/5'}`}>
            <Upload size={20} className={dragging ? 'text-violet-400' : 'text-white/40'} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white/70">
              {dragging ? 'Drop your resume here' : 'Drag & drop your resume here'}
            </p>
            <p className="mt-1 text-[11px] text-white/35">or <span className="text-violet-400 underline underline-offset-2">browse files</span></p>
          </div>
          <p className="text-[10px] text-white/25">PDF, DOC, or DOCX • Max 10 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXT}
            onChange={onInputChange}
            className="hidden"
          />
        </div>
      ) : (
        /* ── Uploaded file preview ── */
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/20">
            <FileText size={18} className="text-violet-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white/80">{file.name}</p>
            <p className="text-[11px] text-white/35">{formatFileSize(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={remove}
            className="shrink-0 rounded-lg p-1.5 text-white/30 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Remove resume"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── StringList ─────────────────────────────────────────────── */
function StringList({ label, items, onChange, placeholder }) {
  const [value, setValue] = useState('');
  const add = () => {
    const item = value.trim();
    if (!item || items.includes(item)) return;
    onChange([...items, item]);
    setValue('');
  };
  return (
    <div>
      <label className="mb-2 block text-[13px] font-semibold text-[#c9a876]">{label}</label>
      <div className="flex gap-2">
        <input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder={placeholder} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm focus:outline-none" />
        <button type="button" onClick={add} className="rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold">Add</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => <span key={item} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs">{item}<button type="button" onClick={() => onChange(items.filter((x) => x !== item))} aria-label={`Remove ${item}`}><X size={12} /></button></span>)}
      </div>
    </div>
  );
}

/* ─── Repeatable ─────────────────────────────────────────────── */
function Repeatable({ label, items, onChange, fields, addLabel }) {
  const add = () => onChange([...items, Object.fromEntries(fields.map((field) => [field.key, '']))]);
  const update = (index, key, value) => onChange(items.map((item, i) => i === index ? { ...item, [key]: value } : item));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><span className="text-[13px] font-semibold text-[#c9a876]">{label}</span><button type="button" onClick={add} className="inline-flex items-center gap-1 text-xs font-bold text-white/60 hover:text-white"><Plus size={14} /> {addLabel}</button></div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="rounded-xl border border-white/8 bg-[#0b0b0b] p-4">
            <div className="mb-3 flex justify-end"><button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={`Remove ${label} ${index + 1}`} className="text-white/30 hover:text-white"><X size={16} /></button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => <Field key={field.key} label={field.label} value={item[field.key]} onChange={(value) => update(index, field.key, value)} placeholder={field.placeholder} multiline={field.multiline} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main step ──────────────────────────────────────────────── */
export default function PortfolioDetailsStep({ details, onChange, onBack, onNext }) {
  const [errors, setErrors] = useState({});
  const update = (patch) => onChange({ ...details, ...patch });
  const handleNext = () => {
    const nextErrors = validate(details);
    setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) onNext();
  };
  const socials = details.socialLinks || {};

  return (
    <StepShell stepIndex={1} title="Build your portfolio profile" subtitle="Give the AI enough real information to create a portfolio that actually feels like yours.">
      <div className="space-y-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *" value={details.name} onChange={(value) => update({ name: value })} placeholder="e.g. Ritik Puranik" error={errors.name} />
          <Field label="Professional title / role *" value={details.role} onChange={(value) => update({ role: value })} placeholder="e.g. Full Stack Developer" error={errors.role} />
          <Field label="Location" value={details.location} onChange={(value) => update({ location: value })} placeholder="e.g. Bhopal, India" />
          <Field label="Contact email" type="email" value={details.contactEmail} onChange={(value) => update({ contactEmail: value })} placeholder="you@example.com" error={errors.contactEmail} />
          <Field label="Phone" value={details.phone} onChange={(value) => update({ phone: value })} placeholder="Optional" />
        </div>

        <Field label="Short bio" value={details.bio} onChange={(value) => update({ bio: value })} placeholder="A concise introduction that should appear in your hero/about content." multiline error={errors.bio} />

        {/* Resume / CV file upload */}
        <ResumeUpload file={details.resumeFile} onChange={(file) => update({ resumeFile: file })} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target audience" value={details.targetAudience} onChange={(value) => update({ targetAudience: value })} placeholder="Recruiters, clients, founders..." />
          <Field label="Primary goal" value={details.primaryGoal} onChange={(value) => update({ primaryGoal: value })} placeholder="Get hired, attract clients, showcase work..." />
        </div>

        <SkillPicker selected={details.skills} onChange={(skills) => update({ skills })} />
        <StringList label="Achievements / awards" items={details.achievements} onChange={(achievements) => update({ achievements })} placeholder="e.g. Hackathon winner" />
        <StringList label="Interests" items={details.interests} onChange={(interests) => update({ interests })} placeholder="e.g. Open source, photography" />

        <Repeatable label="Projects" items={details.projects} onChange={(projects) => update({ projects })} addLabel="Add project" fields={[
          { key: 'title', label: 'Project title', placeholder: 'Project name' },
          { key: 'link', label: 'Project URL', placeholder: 'https://...' },
          { key: 'description', label: 'Description', placeholder: 'What did you build and why?', multiline: true },
        ]} />

        <Repeatable label="Experience" items={details.experience} onChange={(experience) => update({ experience })} addLabel="Add experience" fields={[
          { key: 'role', label: 'Role', placeholder: 'Software Engineer' },
          { key: 'company', label: 'Company / organization', placeholder: 'Company name' },
          { key: 'period', label: 'Period', placeholder: '2024 - Present' },
          { key: 'description', label: 'What you did', placeholder: 'Responsibilities and impact', multiline: true },
        ]} />

        <Repeatable label="Education" items={details.education} onChange={(education) => update({ education })} addLabel="Add education" fields={[
          { key: 'degree', label: 'Degree / course', placeholder: 'B.Tech Computer Science' },
          { key: 'institution', label: 'Institution', placeholder: 'University / college' },
          { key: 'period', label: 'Period', placeholder: '2022 - 2026' },
        ]} />

        <div>
          <p className="mb-3 text-[13px] font-semibold text-[#c9a876]">Social profiles</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {['github', 'linkedin', 'twitter', 'instagram'].map((key) => <Field key={key} label={key === 'twitter' ? 'Twitter / X' : key[0].toUpperCase() + key.slice(1)} value={socials[key] || ''} onChange={(value) => update({ socialLinks: { ...socials, [key]: value } })} placeholder="https://..." error={errors[`socialLinks.${key}`]} />)}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Main CTA text" value={details.ctaText} onChange={(value) => update({ ctaText: value })} placeholder="Let's work together" />
          <Field label="Main CTA link" value={details.ctaLink} onChange={(value) => update({ ctaLink: value })} placeholder="mailto:you@example.com or https://..." />
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <button type="button" onClick={onBack} className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-[13px] font-bold">Back</button>
        <button type="button" onClick={handleNext} className="flex-1 rounded-xl bg-white px-8 py-3 text-[13px] font-bold tracking-wide text-black sm:flex-none">Continue</button>
      </div>
    </StepShell>
  );
}

export { validate as validatePortfolioDetails };
