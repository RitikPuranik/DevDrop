import React, { useState } from 'react';
import { ArrowLeft, Check, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import StepShell from './StepShell';
import DesignPreferencesStep from './DesignPreferencesStep';

const SCHEMAS = {
  ecommerce: {
    title: 'Build your e-commerce store',
    subtitle: 'Define the store, products, customers, shopping experience and conversion strategy.',
    sections: [
      ['Store identity', [
        ['storeName','Store / brand name','e.g. Urban Threads'],
        ['niche','What do you sell?','e.g. streetwear, electronics, handmade products'],
        ['brandStory','Brand story / positioning','What makes this store different?',true],
      ]],
      ['Customers & conversion', [
        ['targetAudience','Target customers','Who is the ideal buyer?'],
        ['primaryGoal','Primary goal','Sales, pre-orders, leads, subscriptions...'],
        ['valueProposition','Main value proposition','Why should someone buy from you?'],
        ['currency','Currency','e.g. INR, USD'],
        ['ctaText','Primary CTA','e.g. Shop now'],
      ]],
      ['Catalog & shopping', [
        ['productTypes','Product types / categories','e.g. T-shirts, hoodies, accessories'],
        ['productDetails','Product information','Price, variants, sizes, reviews, stock, etc.',true],
        ['shoppingFeatures','Shopping features','Cart, wishlist, search, filters, sort, quick view, etc.',true],
        ['checkoutNotes','Checkout requirements','Payment, guest checkout, shipping, coupons, etc.',true],
      ]],
      ['Store content', [
        ['pages','Required pages','Home, shop, about, contact, FAQ, policies, etc.',true],
        ['promotions','Offers / promotions','Discounts, bundles, free shipping, campaigns...'],
        ['trustSignals','Trust signals','Reviews, guarantees, certifications, secure checkout, etc.',true],
      ]],
    ],
  },
  blog: {
    title: 'Build your blog / magazine',
    subtitle: 'Define the publication, editorial voice, content structure, and reader experience.',
    sections: [
      ['Publication', [
        ['publicationName','Publication name','e.g. The Build Journal'],
        ['topic','Main topic / niche','Technology, business, travel, culture...'],
        ['description','Publication description','What is this publication about?',true],
        ['authorInfo','Author / team information','Who publishes it?'],
      ]],
      ['Readers & editorial voice', [
        ['targetAudience','Target readers','Who should read it?'],
        ['contentGoals','Content goals','Educate, grow audience, establish authority, monetize...'],
        ['tone','Writing tone','Professional, conversational, analytical, humorous...'],
        ['topics','Main topics / categories','e.g. AI, startups, web development'],
        ['featuredContent','Featured content ideas','Important articles or recurring series',true],
      ]],
      ['Reading experience', [
        ['articleFeatures','Article features','TOC, reading time, related posts, code blocks, sharing, bookmarks...',true],
        ['navigation','Navigation structure','Categories, tags, search, archives, author pages...',true],
        ['newsletter','Newsletter / subscription','Provider, CTA, placement, or desired behavior...'],
        ['comments','Comments / community','Comments, reactions, discussions, or none...'],
      ]],
      ['Growth & monetization', [
        ['socialLinks','Social / community links','X, LinkedIn, YouTube, Discord, etc.',true],
        ['monetization','Monetization','Ads, sponsorships, memberships, affiliate links, products...'],
        ['requiredPages','Required pages','About, contact, privacy, editorial policy, etc.',true],
      ]],
    ],
  },
  landing: {
    title: 'Build your landing page',
    subtitle: 'Define the offer, conversion goal, persuasion strategy and page structure.',
    sections: [
      ['Offer', [
        ['productName','Product / service name','What are you promoting?'],
        ['oneLiner','One-line value proposition','Explain the offer in one sentence.'],
        ['problem','Problem you solve','What pain point does it address?',true],
        ['solution','Your solution','How does your product/service solve it?',true],
        ['targetAudience','Target audience','Who is this for?'],
      ]],
      ['Conversion', [
        ['conversionGoal','Conversion goal','Purchase, signup, demo, booking, download, contact...'],
        ['primaryCTA','Primary CTA','e.g. Start free, Book a demo'],
        ['secondaryCTA','Secondary CTA','Optional secondary action'],
        ['offerDetails','Offer / pricing','Price, trial, guarantee, discount, or leave for AI to structure...',true],
      ]],
      ['Proof & persuasion', [
        ['features','Key features','List the most important features',true],
        ['benefits','Customer benefits','What outcomes should visitors expect?',true],
        ['socialProof','Social proof','Testimonials, customer logos, metrics, case studies...',true],
        ['trustSignals','Trust signals','Security, certifications, guarantees, partners...',true],
      ]],
      ['Page structure', [
        ['sections','Required sections','Hero, problem, solution, features, pricing, testimonials, FAQ, footer...',true],
        ['faq','FAQ questions','Questions customers commonly ask',true],
        ['integrations','Integrations / compatibility','Tools, platforms, devices, or services supported...'],
        ['brandNotes','Brand direction','Colors, visual references, imagery, typography, etc.',true],
      ]],
    ],
  },
};

function TextField({ label, value, onChange, placeholder, multiline }) {
  const Component = multiline ? 'textarea' : 'input';
  return (
    <div>
      <label className="mb-2 block text-[13px] font-semibold text-[#c9a876]">{label}</label>
      <Component value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={multiline ? 4 : undefined} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm focus:border-violet-500/50 focus:outline-none" />
      <p className="mt-1 text-[10px] text-white/25">{multiline ? 'Be specific. The AI will use this as source material.' : 'Optional unless marked required.'}</p>
    </div>
  );
}


function MediaUpload({ images = [], videos = [], onImages, onVideos }) {
  const add = (files, current, setter, prefix) => {
    const accepted = Array.from(files || []).filter((file) => file.type.startsWith(prefix));
    const next = [...current];
    accepted.forEach((file) => {
      if (!next.some((existing) => existing.name === file.name && existing.size === file.size)) next.push(file);
    });
    setter(next);
  };
  const Picker = ({ type, list, setter }) => (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center justify-between"><label className="text-[13px] font-semibold text-[#c9a876]">{type === 'image' ? 'Images' : 'Videos'} <span className="font-normal text-white/30">(optional, multiple)</span></label><span className="text-[10px] text-white/25">{list.length} selected</span></div>
      <input type="file" multiple accept={type === 'image' ? 'image/*' : 'video/*'} onChange={(e) => { add(e.target.files, list, setter, type); e.target.value = ''; }} className="block w-full cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs text-white/50 file:mr-3 file:rounded-md file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" />
      <div className="mt-3 space-y-2">{list.map((file, index) => <div key={file.name + file.size + index} className="flex items-center gap-3 rounded-lg border border-white/8 bg-black/20 px-3 py-2"><span className="min-w-0 flex-1 truncate text-xs text-white/70">{file.name}</span><span className="text-[10px] text-white/25">{(file.size / 1024 / 1024).toFixed(1)} MB</span><button type="button" onClick={() => setter(list.filter((_, i) => i !== index))} className="text-white/30 hover:text-white" aria-label={`Remove ${file.name}`}><span aria-hidden="true">×</span></button></div>)}</div>
    </div>
  );
  return <section><div className="mb-3"><p className="text-[13px] font-semibold text-[#c9a876]">Media assets</p><p className="text-[11px] text-white/35">Optional. Add multiple images and/or videos for the AI to use.</p></div><div className="grid gap-3 sm:grid-cols-2"><Picker type="image" list={images} setter={onImages} /><Picker type="video" list={videos} setter={onVideos} /></div></section>;
}

function DetailsStep({ type, details, onChange, onBack, onNext }) {
  const schema = SCHEMAS[type];
  const update = (key, value) => onChange({ ...details, [key]: value });

  return (
    <StepShell stepIndex={1} title={schema.title} subtitle={schema.subtitle}>
      <div className="space-y-8">
        {schema.sections.map(([sectionTitle, fields]) => (
          <section key={sectionTitle}>
            <h3 className="mb-4 text-sm font-semibold text-white">{sectionTitle}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map(([key, label, placeholder, multiline]) => (
                <div key={key} className={multiline ? 'sm:col-span-2' : ''}>
                  <TextField label={label} value={details[key]} onChange={(value) => update(key, value)} placeholder={placeholder} multiline={multiline} />
                </div>
              ))}
            </div>
          </section>
        ))}

        <MediaUpload images={details.images || []} videos={details.videos || []} onImages={(images) => update('images', images)} onVideos={(videos) => update('videos', videos)} />

        <section className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-5">
          <label className="mb-2 block text-[13px] font-semibold text-violet-300">
            Anything else you want? <span className="font-normal text-white/35">(optional)</span>
          </label>
          <textarea value={details.specialRequests || ''} onChange={(e) => update('specialRequests', e.target.value)} rows={5} placeholder="Add any specific idea, section, behavior, animation, reference, wording, feature, constraint, or anything else you want the AI to know." className="w-full rounded-xl border border-violet-500/20 bg-black/20 px-4 py-3 text-sm focus:border-violet-500/50 focus:outline-none" />
          <p className="mt-2 text-[11px] text-white/35">Leave it empty if you have nothing extra to add.</p>
        </section>
      </div>

      <div className="mt-8 flex gap-3">
        <button type="button" onClick={onBack} className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-[13px] font-bold">Back</button>
        <button type="button" onClick={onNext} className="flex-1 rounded-xl bg-white px-8 py-3 text-[13px] font-bold text-black sm:flex-none">Continue</button>
      </div>
    </StepShell>
  );
}

export default function WebsiteBuilder({ type, onBack, onGenerate }) {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState({});
  const [design, setDesign] = useState({ style: 'modern', theme: 'dark', animations: 'subtle', primaryColor: null });
  const [generating, setGenerating] = useState(false);
  const schema = SCHEMAS[type];

  const generate = async () => {
    setGenerating(true);
    try { await onGenerate(type, details, design); } finally { setGenerating(false); }
  };

  return (
    <div className="min-h-full bg-neutral-950 text-white">
      <div className="mx-auto max-w-4xl px-5 py-6 md:px-8">
        <div className="mb-8 flex items-center justify-between">
          <button type="button" onClick={onBack} disabled={generating} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white"><ArrowLeft size={16} /> Website types</button>
          <div className="inline-flex items-center gap-2 text-xs text-white/35"><Sparkles size={14} className="text-violet-400" /> {schema?.title || 'AI Studio'}</div>
        </div>

        <div className="mb-8 flex gap-2">
          {['Details', 'Design', 'Review'].map((label, index) => (
            <div key={label} className="flex-1">
              <div className={`h-1.5 rounded-full ${index <= step ? 'bg-violet-500' : 'bg-white/10'}`} />
              <p className={`mt-2 text-[11px] ${index === step ? 'text-white' : 'text-white/30'}`}>{label}</p>
            </div>
          ))}
        </div>

        <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {step === 0 && <DetailsStep type={type} details={details} onChange={setDetails} onBack={onBack} onNext={() => setStep(1)} />}
          {step === 1 && <DesignPreferencesStep design={design} onChange={setDesign} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
          {step === 2 && (
            <StepShell stepIndex={3} title="Review your website" subtitle="Review everything before sending it to the AI builder.">
              <div className="space-y-3">
                {Object.entries(details).filter(([, value]) => value !== '' && value !== null).map(([key, value]) => (
                  <div key={key} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                    <p className="text-[11px] uppercase tracking-wider text-white/30">{key.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-white/75">{String(value)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
                <p className="text-xs font-semibold text-violet-300">Anything else you want?</p>
                <p className="mt-1 text-sm text-white/60">{details.specialRequests || 'Nothing extra provided.'}</p>
              </div>
              <div className="mt-8 flex gap-3">
                <button type="button" onClick={() => setStep(1)} disabled={generating} className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-[13px] font-bold">Back</button>
                <button type="button" onClick={generate} disabled={generating} className="flex-1 rounded-xl bg-white px-8 py-3 text-[13px] font-bold text-black">{generating ? 'Generating…' : `Generate ${schema?.title || 'Website'}`}</button>
              </div>
            </StepShell>
          )}
        </motion.div>

        {generating && <div className="mt-5 flex items-center justify-center gap-2 text-xs text-white/40"><Check size={14} className="text-violet-400" /> Questionnaire locked while generation runs…</div>}
      </div>
    </div>
  );
}

export function buildWebsitePrompt(type, details, design) {
  const labels = { ecommerce: 'e-commerce store', blog: 'blog / magazine', landing: 'marketing landing page' };
  const title = labels[type] || 'website';
  const specification = Object.entries(details)
    .filter(([, value]) => value !== '' && value !== null && value !== undefined)
    .map(([key, value]) => `### ${key.replace(/([A-Z])/g, ' $1')}\n${value}`)
    .join('\n\n');

  return `Create a production-quality ${title} from the user's specifications below.

GENERATION RULES:
- Use supplied information as the source of truth. Never invent business facts, prices, reviews, customer counts, integrations, products, testimonials, links, or claims.
- Empty fields mean omit that content, not placeholder text.
- Build a complete responsive React website ready to preview, with semantic accessible HTML, working navigation, meaningful buttons, and no TODOs or broken imports.
- Make the design specific to the requested business/publication/product rather than a generic template.
- Respect the selected animation level and prefers-reduced-motion.
- For e-commerce, build polished catalog, product, search/filter, cart and checkout UI from supplied requirements without inventing real inventory or payment credentials.
- For blogs, build clear editorial hierarchy, article cards, article detail structure, categories/tags/search and subscription UI from supplied requirements without inventing factual claims.
- For landing pages, prioritize the supplied conversion goal and make the CTA hierarchy obvious without fabricating proof.
- Check all JSX component references before returning the structured file-generation JSON.

WEBSITE TYPE: ${title}

USER SPECIFICATION:
${specification || 'No detailed content supplied. Create a sensible structure without inventing factual claims.'}

DESIGN:
Style: ${design.style || 'modern'}
Theme: ${design.theme || 'dark'}
Animation: ${design.animations || 'subtle'}
Primary color: ${design.primaryColor || 'Choose a tasteful palette.'}

Return the website using DevDrop's existing structured file-generation contract. Include every file required for the preview to run. Do not return commentary outside the required JSON contract.`;
}
