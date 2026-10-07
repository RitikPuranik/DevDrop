import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, Field, StepHeader, MediaDrop, SpecialRequestsCard } from './studioUi';
import { GRAD, PAGE_BG } from './studioStyles';
import DesignPreferencesStep from './DesignPreferencesStep';
import StudioTopBar from './StudioTopBar';
import { describeDesign } from '../../config/aiStudio.config';

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
  cafe: {
    title: 'Build your cafe / restaurant website',
    subtitle: 'Define the venue, menu, atmosphere, ordering and visit experience.',
    sections: [
      ['Venue identity', [
        ['venueName','Cafe / restaurant name','e.g. Brew & Bloom'],
        ['cuisine','Cuisine / concept','e.g. specialty coffee, North Indian, bakery, fine dining'],
        ['story','Story / positioning','What makes this place special?',true],
        ['ambience','Ambience & vibe','Cozy, rooftop, family, premium, casual...'],
      ]],
      ['Menu', [
        ['menuCategories','Menu categories','e.g. Coffee, Breakfast, Mains, Desserts'],
        ['menuItems','Menu items & prices','List dishes with prices and short descriptions. Only listed items will appear.',true],
        ['signatureDishes','Signature dishes / specials','What should be highlighted?',true],
        ['dietaryInfo','Dietary options','Veg, vegan, gluten-free, allergens info...'],
      ]],
      ['Visit & ordering', [
        ['address','Address / location','Full address or area'],
        ['hours','Opening hours','e.g. Mon-Sun 8am-11pm',true],
        ['reservations','Reservations / booking','Phone, WhatsApp, form, third-party link...'],
        ['ordering','Online ordering / delivery','Zomato, Swiggy, own ordering, none...'],
        ['contact','Phone / email / socials','Contact details to show',true],
      ]],
      ['Extras', [
        ['events','Events / offers','Live music, happy hours, private parties, catering...',true],
        ['sections','Required sections','Hero, menu, gallery, about, reviews, contact, map...',true],
      ]],
    ],
  },
  hotel: {
    title: 'Build your hotel / stay website',
    subtitle: 'Define the property, rooms, amenities, location and booking flow.',
    sections: [
      ['Property', [
        ['hotelName','Hotel / property name','e.g. The Lakeview Residency'],
        ['propertyType','Property type','Hotel, resort, homestay, villa, boutique stay...'],
        ['story','Description / positioning','What makes this stay different?',true],
        ['starRating','Category / star rating','Only if applicable'],
        ['targetGuests','Target guests','Families, couples, business, backpackers...'],
      ]],
      ['Rooms & pricing', [
        ['roomTypes','Room types','Name, size, bed type, capacity, view for each room',true],
        ['pricing','Pricing info','Per-night rates or "on request"'],
        ['amenities','Amenities & services','Wi-Fi, pool, spa, breakfast, parking, restaurant...',true],
        ['policies','Policies','Check-in/out, cancellation, pets, ID requirements...',true],
      ]],
      ['Location & experience', [
        ['address','Address / location','Full address or area'],
        ['nearby','Nearby attractions','Landmarks, distances, travel tips',true],
        ['diningActivities','Dining & activities','On-site restaurant, tours, experiences...',true],
      ]],
      ['Booking & contact', [
        ['bookingMethod','Booking method','Enquiry form, WhatsApp, phone, external booking link...'],
        ['contact','Phone / email / socials','Contact details to show',true],
        ['sections','Required sections','Hero, rooms, amenities, gallery, reviews, location, FAQ...',true],
      ]],
    ],
  },
  studio: {
    title: 'Build your freelancing studio website',
    subtitle: 'Define your services, process, proof of work and how clients reach you.',
    sections: [
      ['Studio identity', [
        ['studioName','Studio / freelancer name','e.g. Pixel & Pine Studio'],
        ['tagline','Tagline / one-liner','What you do in one sentence'],
        ['niche','Specialty / niche','Web development, branding, video editing, UI/UX...'],
        ['about','About / story','Who you are and how you work',true],
        ['targetClients','Target clients','Startups, local businesses, creators, agencies...'],
      ]],
      ['Services & pricing', [
        ['services','Services offered','Each service with a short description',true],
        ['packages','Packages / pricing','Tiers, starting prices, or "custom quote"',true],
        ['process','Work process','e.g. Discovery, Design, Build, Launch, Support',true],
        ['techStack','Tools / tech stack','Figma, React, Webflow, Premiere...'],
      ]],
      ['Proof of work', [
        ['caseStudies','Case studies / projects','Client, problem, solution, result for each. Only real work.',true],
        ['testimonials','Testimonials','Real client quotes with names',true],
        ['clients','Clients / logos','Companies you have worked with'],
        ['stats','Key numbers','Years of experience, projects delivered, etc.'],
      ]],
      ['Client inquiry', [
        ['primaryGoal','Primary goal','Get inquiries, book calls, sell packages...'],
        ['ctaText','Primary CTA','e.g. Book a free call'],
        ['availability','Availability','Open for projects, booking from next month...'],
        ['contact','Email / WhatsApp / socials','Contact details to show',true],
        ['sections','Required sections','Hero, services, work, process, pricing, testimonials, FAQ, contact...',true],
      ]],
    ],
  },
  saas: {
    title: 'Build your SaaS / web app website',
    subtitle: 'Define the product, users, feature story, conversion path and app-facing requirements.',
    sections: [
      ['Product', [
        ['productName','Product / app name','e.g. Flowbase AI'],
        ['productDescription','What does it do?','Explain the product in plain language.',true],
        ['problem','Problem it solves','What is difficult or slow today?',true],
        ['solution','Core solution','How does your product solve it?',true],
        ['targetUsers','Target users','Founders, developers, teams, students...'],
      ]],
      ['Features & value', [
        ['keyFeatures','Key features','List the most important features and what each does.',true],
        ['differentiators','What makes it different?','Unique workflow, technology, UX, pricing model...'],
        ['integrations','Integrations','GitHub, Slack, Stripe, APIs, devices, etc.'],
        ['securityNotes','Security / compliance notes','Only include claims you provide.',true],
      ]],
      ['Conversion', [
        ['primaryGoal','Primary goal','Signup, demo, waitlist, install, contact, purchase...'],
        ['primaryCTA','Primary CTA','e.g. Start building free'],
        ['pricing','Pricing / plans','Plans, price, limits or "contact sales"',true],
        ['proof','Proof / trust content','Real customers, testimonials, metrics, certifications...',true],
      ]],
      ['Website structure', [
        ['sections','Required sections','Hero, features, workflow, integrations, pricing, FAQ, footer...',true],
        ['appScreens','App screens / dashboard ideas','Describe screens that should appear in product visuals.',true],
        ['brandNotes','Brand direction','Colors, typography, imagery, references...',true],
      ]],
    ],
  },
  event: {
    title: 'Build your event / conference website',
    subtitle: 'Define the event identity, schedule, speakers, venue and attendee journey.',
    sections: [
      ['Event identity', [
        ['eventName','Event name','e.g. BuildNext 2027'],
        ['tagline','Event tagline','Short theme or positioning line'],
        ['description','Event description','What is the event about?',true],
        ['eventType','Event type','Conference, meetup, workshop, launch, festival...'],
        ['targetAudience','Target attendees','Developers, founders, students, creators...'],
      ]],
      ['Schedule & speakers', [
        ['dateTime','Date & time','Exact dates and time zone if known'],
        ['schedule','Agenda / schedule','Sessions, timings, tracks, breaks...',true],
        ['speakers','Speakers / guests','Names, roles and bios. Only supplied information.',true],
        ['tracks','Tracks / categories','e.g. AI, Web, Product, Career'],
      ]],
      ['Venue & tickets', [
        ['venue','Venue / location','Address, city, online platform, or hybrid details'],
        ['ticketing','Tickets / registration','Prices, tiers, limits or registration method',true],
        ['sponsors','Sponsors / partners','Real organizations only.'],
        ['contact','Contact / socials','Email, phone, social links',true],
      ]],
      ['Attendee experience', [
        ['sections','Required sections','Hero, countdown, speakers, schedule, tickets, venue, FAQ...',true],
        ['attendeeInfo','Attendee information','What visitors need to know before registering',true],
        ['specialRequests','Special interactions','Countdown, schedule filters, calendar add, maps, animations...',true],
      ]],
    ],
  },
  education: {
    title: 'Build your education / course website',
    subtitle: 'Define the learning offer, curriculum, instructors, enrollment path and student experience.',
    sections: [
      ['Learning offer', [
        ['academyName','Academy / course name','e.g. CodeCraft Academy'],
        ['courseTopic','What is taught?','Subject, skill or learning outcome'],
        ['description','Course / program description','What will students learn?',true],
        ['level','Level / format','Beginner, advanced, live, self-paced, cohort...'],
        ['targetStudents','Target students','Students, professionals, career switchers...'],
      ]],
      ['Curriculum & instructors', [
        ['curriculum','Curriculum / modules','Modules, lessons, projects or weeks',true],
        ['instructors','Instructor information','Names, roles, bios and credentials you provide.',true],
        ['learningFeatures','Learning features','Quizzes, projects, certificates, community, mentoring...'],
        ['outcomes','Learning outcomes','What students should be able to do after completion.',true],
      ]],
      ['Enrollment', [
        ['price','Pricing / plans','Course price, plans, scholarship info, or "on request"'],
        ['enrollmentMethod','Enrollment method','Checkout, application, WhatsApp, form, external platform...'],
        ['startDate','Start date / schedule','Cohort dates or self-paced availability'],
        ['ctaText','Primary CTA','e.g. Enroll now'],
      ]],
      ['Website structure', [
        ['sections','Required sections','Hero, curriculum, instructors, outcomes, pricing, FAQ, contact...',true],
        ['studentProof','Proof / social proof','Real testimonials, student projects, outcomes...',true],
        ['brandNotes','Brand direction','Colors, visual references, typography, imagery...',true],
      ]],
    ],
  },
  custom: {
    title: 'Build your custom website',
    subtitle: 'Start with the idea in your head. Give DevDrop enough context to turn it into a complete website brief.',
    sections: [
      ['Your idea', [
        ['siteName','Website / brand name','What should appear in the navbar?'],
        ['siteType','What kind of website is it?','Describe it in your own words: community, marketplace, directory, personal tool, booking site...'],
        ['purpose','What should the website achieve?','The main outcome you want from visitors.',true],
        ['targetAudience','Who is it for?','Describe the people who will use or visit it.',true],
      ]],
      ['Content & structure', [
        ['pages','Pages you want','Home, about, pricing, dashboard, contact, etc.',true],
        ['sections','Sections / content','Describe the sections, content blocks and information hierarchy.',true],
        ['features','Features / interactions','Forms, search, filters, calculators, dashboards, auth, bookings, animations...',true],
        ['contentProvided','Content you already have','Copy, data, documents, links, product info, etc.',true],
      ]],
      ['Brand & experience', [
        ['brandDirection','Visual direction','Style, colors, typography, mood, references, competitors...',true],
        ['references','Reference websites / inspiration','URLs or descriptions of websites whose feel you like.',true],
        ['responsiveNeeds','Responsive / device needs','Mobile-first, desktop-heavy, tablet, kiosk, etc.'],
        ['integrations','Integrations / external tools','APIs, payments, analytics, forms, maps, CRMs...',true],
      ]],
      ['Final instructions', [
        ['successCriteria','What would make this website feel complete?','List the details that must be right.',true],
        ['constraints','Constraints','Technology, performance, accessibility, content, compliance, or things to avoid.',true],
      ]],
    ],
  },
};

function splitTitle(title, lead = 'Build your ') {
  return title.startsWith(lead) ? [lead, title.slice(lead.length)] : ['', title];
}

function DetailsStep({ type, details, onChange, onBack, onNext }) {
  const schema = SCHEMAS[type];
  const update = (key, value) => onChange({ ...details, [key]: value });
  const [lead, accent] = splitTitle(schema.title);

  return (
    <div>
      <StepHeader lead={lead} accent={accent} subtitle={schema.subtitle} />

      <div className="grid gap-4 lg:grid-cols-12">
        {schema.sections.map(([sectionTitle, fields]) => (
          <Card key={sectionTitle} title={sectionTitle} className="lg:col-span-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map(([key, label, placeholder, multiline]) => (
                <div key={key} className={multiline ? 'sm:col-span-2' : ''}>
                  <Field label={label} value={details[key] || ''} onChange={(value) => update(key, value)} placeholder={placeholder} multiline={multiline} rows={3} />
                </div>
              ))}
            </div>
          </Card>
        ))}

        <Card title="Media Assets" className="lg:col-span-12">
          <p className="-mt-2 mb-3 text-[11px] text-white/35">Optional. The AI can use these in your website.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <MediaDrop kind="image" list={details.images || []} onChange={(images) => update('images', images)} />
            <MediaDrop kind="video" list={details.videos || []} onChange={(videos) => update('videos', videos)} />
          </div>
        </Card>

        <SpecialRequestsCard className="lg:col-span-12" value={details.specialRequests || ''} onChange={(value) => update('specialRequests', value)} placeholder="Add any specific idea, section, behavior, animation, reference, wording, feature, constraint, or anything else you want the AI to know." />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-5 py-3 text-[13px] font-semibold text-white/70 transition-colors hover:text-white"><ArrowLeft size={14} /> Previous Step</button>
        <button type="button" onClick={onNext} className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[13px] font-semibold shadow-[0_0_28px_rgba(139,92,246,.35)] transition-opacity hover:opacity-90 ${GRAD}`}>Continue to Design <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}

export default function WebsiteBuilder({ type, onBack, onGenerate }) {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState({});
  const [design, setDesign] = useState({ style: 'modern', theme: 'dark', animations: 'subtle', primaryColor: '#b8935a', paletteId: 'amber', palette: '#b8935a, #e8d9bf, #b4583a, #2f3436, #f1f1f1', typography: 'grotesk', themeTouched: false, paletteTouched: false });
  const [generating, setGenerating] = useState(false);
  const schema = SCHEMAS[type];

  const generate = async () => {
    setGenerating(true);
    try { await onGenerate(type, details, design); } finally { setGenerating(false); }
  };

  if (step === 1) {
    return (
      <DesignPreferencesStep
        design={design}
        onChange={setDesign}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        topBar={<div className="pt-24 md:pt-28"><StudioTopBar title={schema?.title || 'Website builder'} step={step} /></div>}
      />
    );
  }

  const reviewEntries = Object.entries(details).filter(([key, value]) => !['specialRequests', 'images', 'videos'].includes(key) && value !== '' && value !== null && value !== undefined);

  return (
    <div className={`min-h-full ${PAGE_BG} text-white`}>
      <div className={`mx-auto px-5 pb-12 pt-24 md:px-8 md:pt-28 ${step === 0 ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <div className="mb-8 flex items-center justify-between">
          <button type="button" onClick={onBack} disabled={generating} className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white disabled:opacity-40"><ArrowLeft size={16} /> Website types</button>
          <div className="inline-flex items-center gap-2 text-sm text-violet-200/80"><Sparkles size={15} className="text-violet-400" /> {schema?.title || 'AI Studio'}</div>
        </div>

        <div className="mb-8 flex gap-4">
          {['Details', 'Design', 'Review'].map((label, index) => (
            <div key={label} className="flex-1">
              <div className={`h-1.5 rounded-full ${index <= step ? 'bg-[linear-gradient(90deg,#7c3aed,#a78bfa)]' : 'bg-white/10'}`} />
              <div className={`mt-2 flex justify-between text-[11px] ${index === step ? 'text-white' : 'text-white/35'}`}><span>{label}</span><span>Step {String(index + 1).padStart(2, '0')}</span></div>
            </div>
          ))}
        </div>

        <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {step === 0 && <DetailsStep type={type} details={details} onChange={setDetails} onBack={onBack} onNext={() => setStep(1)} />}

          {step === 2 && (
            <div>
              <StepHeader lead="Review your " accent="website" subtitle="Review everything before sending it to the AI builder." />
              <div className="grid gap-3 md:grid-cols-2">
                {reviewEntries.map(([key, value]) => (
                  <div key={key} className="rounded-2xl border border-white/10 bg-[linear-gradient(150deg,rgba(255,255,255,.05),rgba(12,12,18,.92))] p-4">
                    <p className="text-[11px] uppercase tracking-wider text-white/35">{key.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">{String(value)}</p>
                  </div>
                ))}
                {((details.images || []).length > 0 || (details.videos || []).length > 0) && (
                  <div className="rounded-2xl border border-white/10 bg-[linear-gradient(150deg,rgba(255,255,255,.05),rgba(12,12,18,.92))] p-4">
                    <p className="text-[11px] uppercase tracking-wider text-white/35">Media assets</p>
                    <p className="mt-1 text-sm text-white/80">{(details.images || []).length} image(s), {(details.videos || []).length} video(s)</p>
                  </div>
                )}
              </div>
              <div className="mt-4 rounded-2xl border border-fuchsia-400/30 bg-[linear-gradient(135deg,rgba(124,58,237,.16),rgba(192,38,211,.10)_60%,rgba(12,12,18,.9))] p-4">
                <p className="text-xs font-semibold text-violet-200">Anything else you want?</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-white/65">{details.specialRequests || 'Nothing extra provided.'}</p>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={() => setStep(1)} disabled={generating} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-5 py-3 text-[13px] font-semibold text-white/70 hover:text-white disabled:opacity-40"><ArrowLeft size={14} /> Previous Step</button>
                <button type="button" onClick={generate} disabled={generating} className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[13px] font-semibold shadow-[0_0_28px_rgba(139,92,246,.35)] transition-opacity hover:opacity-90 disabled:opacity-60 ${GRAD}`}>{generating ? 'Generating…' : `Generate ${schema?.title?.replace(/^Build your /, '') || 'Website'}`} <Sparkles size={14} /></button>
              </div>
            </div>
          )}
        </motion.div>

        {generating && <div className="mt-5 flex items-center justify-center gap-2 text-xs text-white/40"><Check size={14} className="text-violet-400" /> Questionnaire locked while generation runs…</div>}
      </div>
    </div>
  );
}

export function buildWebsitePrompt(type, details, design) {
  const labels = { ecommerce: 'e-commerce store', blog: 'blog / magazine', landing: 'marketing landing page', cafe: 'cafe / restaurant website', hotel: 'hotel / stay website', studio: 'freelancing studio / agency website', saas: 'SaaS / web app website', event: 'event / conference website', education: 'education / course website', custom: 'custom website' };
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
- For cafes/restaurants, build an appetizing menu (by category), ambience/gallery, hours, location, reservation/order CTA and contact sections using only the supplied menu items and prices.
- For hotels, build clear room cards, amenities, gallery, location/nearby highlights, policies and an enquiry/booking CTA without inventing rates, ratings, reviews or availability.
- For freelancing studios, build services, packages, process, case studies, testimonials and a strong inquiry/booking CTA using only real supplied work, clients and quotes.
- For SaaS/web apps, prioritize product clarity, feature storytelling, workflow visuals, pricing, integrations and signup/demo conversion without inventing product capabilities, customer metrics or security claims.
- For events/conferences, prioritize event identity, date/time, schedule, speakers, venue, tickets/registration, sponsors and attendee information using only supplied facts.
- For education/course sites, prioritize curriculum, instructor credibility, outcomes, format, pricing/enrollment and student proof using only supplied information.
- For custom websites, treat the user's description as the source of truth and infer only information architecture, layout and interaction patterns. Do not force the project into a predefined category when the brief describes something different.
- Check all JSX component references before returning the structured file-generation JSON.

WEBSITE TYPE: ${title}

USER SPECIFICATION:
${specification || 'No detailed content supplied. Create a sensible structure without inventing factual claims.'}

DESIGN:
${describeDesign(design)}

Return the website using DevDrop's existing structured file-generation contract. Include every file required for the preview to run. Do not return commentary outside the required JSON contract.`;
}
