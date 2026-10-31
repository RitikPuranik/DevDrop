import { describe, expect, it } from 'vitest';
import { buildWebsitePrompt } from '../WebsiteBuilder';
import { animationIds, primaryAnimation, toggleAnimation, describeDesign } from '../../../config/aiStudio.config';

const TYPES = ['ecommerce', 'blog', 'landing', 'cafe', 'hotel', 'studio', 'saas', 'event', 'education', 'custom'];
// A phrase that only appears in each type's own rule.
const MARKER = { ecommerce: 'polished catalog', blog: 'editorial hierarchy', landing: 'conversion goal', cafe: 'appetizing menu', hotel: 'room cards', studio: 'case studies', saas: 'workflow visuals', event: 'speakers', education: 'curriculum', custom: 'Do not force the project' };

describe('buildWebsitePrompt', () => {
  it.each(TYPES)('%s: includes only its own type guidance, never the other types', (type) => {
    const prompt = buildWebsitePrompt(type, { businessName: 'Acme', specialRequests: 'Use a hand-drawn logo' }, { style: 'modern' });
    expect(prompt).toContain(MARKER[type]);
    for (const other of TYPES.filter((t) => t !== type)) expect(prompt).not.toContain(MARKER[other]);
    expect((prompt.match(/^- For /gm) || []).length).toBe(1);
  });
  it('still carries the user details, the custom prompt and the design with it', () => {
    const p = buildWebsitePrompt('cafe', { businessName: 'Bean There', specialRequests: 'Use a hand-drawn logo' }, { style: 'modern', customPrompt: 'Keep the hero very calm' });
    expect(p).toContain('Bean There'); expect(p).toContain('Use a hand-drawn logo'); expect(p).toContain('Keep the hero very calm');
    expect(p).toContain('GENERATION RULES'); expect(p).toContain('WEBSITE TYPE: cafe / restaurant website');
  });
  it('is much shorter than the old all-types prompt and has no stray blank rule lines', () => {
    const p = buildWebsitePrompt('hotel', {}, {});
    expect(p).not.toContain('\\n'); expect(p).not.toMatch(/\n\n\n/);
  });
});

describe('multi-select animation', () => {
  it('normalizes strings, arrays and defaults', () => {
    expect(animationIds({ animations: 'scroll' })).toEqual(['scroll']);
    expect(animationIds({ animationList: ['subtle', 'scroll', 'bogus'] })).toEqual(['subtle', 'scroll']);
    expect(animationIds({})).toEqual(['subtle']);
  });
  it('toggles several on and off and mirrors the strongest level into design.animations', () => {
    let d = { animationList: ['subtle'], animations: 'subtle' };
    d = { ...d, ...toggleAnimation(d, 'scroll') }; d = { ...d, ...toggleAnimation(d, 'kinetic') };
    expect(d.animationList).toEqual(['subtle', 'scroll', 'kinetic']); expect(d.animations).toBe('kinetic');
    d = { ...d, ...toggleAnimation(d, 'kinetic') }; expect(d.animations).toBe('scroll');
  });
  it('"none" is exclusive and the list never ends up empty', () => {
    let d = { animationList: ['subtle', 'scroll'], animations: 'scroll' };
    d = { ...d, ...toggleAnimation(d, 'none') }; expect(d.animationList).toEqual(['none']); expect(d.animations).toBe('none');
    d = { ...d, ...toggleAnimation(d, 'parallax') }; expect(d.animationList).toEqual(['parallax']);
    d = { ...d, ...toggleAnimation(d, 'parallax') }; expect(d.animationList).toEqual(['none']);
  });
  it('picks the strongest level', () => { expect(primaryAnimation(['subtle', 'dynamic', 'scroll'])).toBe('dynamic'); });
  it('describes every selected animation to the AI, plus the design notes', () => {
    const t = describeDesign({ style: 'modern', animationList: ['scroll', 'interactive'], animations: 'interactive', customPrompt: 'No parallax on mobile' });
    expect(t).toMatch(/Scroll Reveal/); expect(t).toMatch(/Interactive/); expect(t).toContain('No parallax on mobile');
    expect(describeDesign({ style: 'modern', animations: 'none' })).toMatch(/Animation: None/);
  });
});
