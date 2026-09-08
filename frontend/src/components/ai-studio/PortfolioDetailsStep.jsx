import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import StepShell from './StepShell';

const URL_RE = /^https?:\/\/.+/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(details) {
  const errors = {};
  if (!details.name.trim()) errors.name = 'Name is required.';
  else if (details.name.trim().length > 100) errors.name = 'Keep it under 100 characters.';

  if (!details.role.trim()) errors.role = 'Professional title / role is required.';

  if (details.bio.length > 2000) errors.bio = 'Bio must be under 2000 characters.';

  if (details.contactEmail && !EMAIL_RE.test(details.contactEmail)) {
    errors.contactEmail = 'Enter a valid email address.';
  }

  ['github', 'linkedin'].forEach((key) => {
    const v = details.socialLinks[key];
    if (v && !URL_RE.test(v)) errors[`socialLinks.${key}`] = 'Must be a valid URL (starting with http:// or https://).';
  });

  details.projects.forEach((p, i) => {
    if (!p.title.trim()) errors[`project.${i}.title`] = 'Project title is required.';
    if (p.link && !URL_RE.test(p.link)) errors[`project.${i}.link`] = 'Must be a valid URL.';
  });

  return errors;
}

export default function PortfolioDetailsStep({ details, onChange, onBack, onNext }) {
  const [errors, setErrors] = useState({});
  const [skillInput, setSkillInput] = useState('');

  const update = (patch) => onChange({ ...details, ...patch });

  const addSkill = () => {
    const skill = skillInput.trim();
    if (!skill || details.skills.includes(skill)) return;
    update({ skills: [...details.skills, skill] });
    setSkillInput('');
  };

  const removeSkill = (skill) => update({ skills: details.skills.filter((s) => s !== skill) });

  const addProject = () => update({ projects: [...details.projects, { title: '', description: '', link: '' }] });
  const updateProject = (i, patch) =>
    update({ projects: details.projects.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  const removeProject = (i) => update({ projects: details.projects.filter((_, idx) => idx !== i) });

  const handleNext = () => {
    const validationErrors = validate(details);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length === 0) onNext();
  };

  const inputClass = (hasError) =>
    `w-full px-4 py-3 rounded-xl bg-white/[0.03] border text-sm focus:outline-none transition-colors ${
      hasError ? 'border-red-500/50' : 'border-white/10 focus:border-[#8b7355]/50'
    }`;

  return (
    <StepShell stepIndex={1} title="Tell us about yourself" subtitle="Enough for the AI to write real, specific content — not filler.">
      <div className="space-y-6">
        <div>
          <label htmlFor="ai-name" className="block text-[13px] font-semibold text-[#c9a876] mb-2">Name</label>
          <input
            id="ai-name"
            value={details.name}
            onChange={(e) => update({ name: e.target.value })}
            className={inputClass(errors.name)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'ai-name-error' : undefined}
          />
          {errors.name && <p id="ai-name-error" className="text-red-400 text-xs mt-1">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="ai-role" className="block text-[13px] font-semibold text-[#c9a876] mb-2">Professional title / role</label>
          <input
            id="ai-role"
            value={details.role}
            onChange={(e) => update({ role: e.target.value })}
            placeholder="e.g. Full Stack Developer"
            className={inputClass(errors.role)}
            aria-invalid={Boolean(errors.role)}
            aria-describedby={errors.role ? 'ai-role-error' : undefined}
          />
          {errors.role && <p id="ai-role-error" className="text-red-400 text-xs mt-1">{errors.role}</p>}
        </div>

        <div>
          <label htmlFor="ai-bio" className="block text-[13px] font-semibold text-[#c9a876] mb-2">Bio</label>
          <textarea
            id="ai-bio"
            value={details.bio}
            onChange={(e) => update({ bio: e.target.value })}
            rows={4}
            placeholder="A couple of sentences about your background and what you're looking for."
            className={inputClass(errors.bio)}
          />
          <p className="text-white/25 text-[11px] mt-1">{details.bio.length}/2000</p>
          {errors.bio && <p className="text-red-400 text-xs mt-1">{errors.bio}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ai-audience" className="block text-[13px] font-semibold text-[#c9a876] mb-2">Target audience</label>
            <input
              id="ai-audience"
              value={details.targetAudience}
              onChange={(e) => update({ targetAudience: e.target.value })}
              placeholder="e.g. Recruiters, clients"
              className={inputClass(false)}
            />
          </div>
          <div>
            <label htmlFor="ai-goal" className="block text-[13px] font-semibold text-[#c9a876] mb-2">Primary goal</label>
            <input
              id="ai-goal"
              value={details.primaryGoal}
              onChange={(e) => update({ primaryGoal: e.target.value })}
              placeholder="e.g. Land a job, get freelance clients"
              className={inputClass(false)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="ai-skill-input" className="block text-[13px] font-semibold text-[#c9a876] mb-2">Skills</label>
          <div className="flex gap-2 mb-3">
            <input
              id="ai-skill-input"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSkill();
                }
              }}
              placeholder="e.g. TypeScript"
              className={inputClass(false)}
            />
            <button type="button" onClick={addSkill} className="px-4 rounded-xl bg-white/5 border border-white/10 text-xs font-bold">
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {details.skills.map((skill) => (
              <span key={skill} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs">
                {skill}
                <button type="button" onClick={() => removeSkill(skill)} aria-label={`Remove ${skill}`} className="text-white/40 hover:text-white">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="block text-[13px] font-semibold text-[#c9a876]">Projects</span>
            <button type="button" onClick={addProject} className="inline-flex items-center gap-1 text-xs font-bold text-white/60 hover:text-white">
              <Plus size={14} /> Add project
            </button>
          </div>
          <div className="space-y-3">
            {details.projects.map((project, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-[#0b0b0b] p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={project.title}
                    onChange={(e) => updateProject(i, { title: e.target.value })}
                    placeholder="Project title"
                    className={inputClass(errors[`project.${i}.title`])}
                    aria-label={`Project ${i + 1} title`}
                  />
                  <button type="button" onClick={() => removeProject(i)} aria-label={`Remove project ${i + 1}`} className="p-2 text-white/30 hover:text-white shrink-0">
                    <X size={16} />
                  </button>
                </div>
                {errors[`project.${i}.title`] && <p className="text-red-400 text-xs">{errors[`project.${i}.title`]}</p>}
                <textarea
                  value={project.description}
                  onChange={(e) => updateProject(i, { description: e.target.value })}
                  placeholder="Short description"
                  rows={2}
                  className={inputClass(false)}
                  aria-label={`Project ${i + 1} description`}
                />
                <input
                  value={project.link}
                  onChange={(e) => updateProject(i, { link: e.target.value })}
                  placeholder="Link (GitHub, live demo, etc.)"
                  className={inputClass(errors[`project.${i}.link`])}
                  aria-label={`Project ${i + 1} link`}
                />
                {errors[`project.${i}.link`] && <p className="text-red-400 text-xs">{errors[`project.${i}.link`]}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ai-github" className="block text-[13px] font-semibold text-[#c9a876] mb-2">GitHub</label>
            <input
              id="ai-github"
              value={details.socialLinks.github}
              onChange={(e) => update({ socialLinks: { ...details.socialLinks, github: e.target.value } })}
              placeholder="https://github.com/you"
              className={inputClass(errors['socialLinks.github'])}
            />
            {errors['socialLinks.github'] && <p className="text-red-400 text-xs mt-1">{errors['socialLinks.github']}</p>}
          </div>
          <div>
            <label htmlFor="ai-linkedin" className="block text-[13px] font-semibold text-[#c9a876] mb-2">LinkedIn</label>
            <input
              id="ai-linkedin"
              value={details.socialLinks.linkedin}
              onChange={(e) => update({ socialLinks: { ...details.socialLinks, linkedin: e.target.value } })}
              placeholder="https://linkedin.com/in/you"
              className={inputClass(errors['socialLinks.linkedin'])}
            />
            {errors['socialLinks.linkedin'] && <p className="text-red-400 text-xs mt-1">{errors['socialLinks.linkedin']}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="ai-email" className="block text-[13px] font-semibold text-[#c9a876] mb-2">Contact email</label>
          <input
            id="ai-email"
            type="email"
            value={details.contactEmail}
            onChange={(e) => update({ contactEmail: e.target.value })}
            placeholder="you@example.com"
            className={inputClass(errors.contactEmail)}
          />
          {errors.contactEmail && <p className="text-red-400 text-xs mt-1">{errors.contactEmail}</p>}
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <button type="button" onClick={onBack} className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[13px] font-bold">
          Back
        </button>
        <button type="button" onClick={handleNext} className="flex-1 sm:flex-none px-8 py-3 rounded-xl bg-white text-black text-[13px] font-bold tracking-wide">
          Continue
        </button>
      </div>
    </StepShell>
  );
}

export { validate as validatePortfolioDetails };
