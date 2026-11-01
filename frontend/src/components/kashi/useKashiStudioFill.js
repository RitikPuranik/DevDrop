import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { mergeKashiDesign } from '../../config/aiStudio.config';
import { FILL_EVENT, setStudioSnapshot, takeStudioFill } from './studioBridge';

const isFilled = (v) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v !== null && v !== undefined);

/**
 * Lets Kashi see and prefill an AI Studio builder form.
 *   websiteType - the builder's type id
 *   fields      - [{ key, label, list? }] details fields that exist on this form
 *   details     - current details object
 *   setDetails / setDesign - state setters of the builder
 *   step        - 0 details | 1 design | 2 review
 */
export default function useKashiStudioFill({ websiteType, fields, details, setDetails, setDesign, step }) {
  const live = useRef({});
  live.current = { websiteType, fields, details, step };

  // What Kashi is told about this screen.
  useEffect(() => setStudioSnapshot(() => {
    const { websiteType: t, fields: f, details: d, step: s } = live.current;
    return { websiteType: t, step: ['details', 'design', 'review'][s] || 'details', fields: f, filled: f.filter((x) => isFilled(d?.[x.key])).map((x) => x.key) };
  }), []);

  // Applies a fill that is queued before mount or arrives later.
  useEffect(() => {
    const apply = () => {
      const fill = takeStudioFill((f) => !f.websiteType || f.websiteType === live.current.websiteType);
      if (!fill) return;
      const allowed = new Map(live.current.fields.map((f) => [f.key, f]));
      const incoming = {};
      for (const [key, value] of Object.entries(fill.details || {})) {
        const field = allowed.get(key);
        if (!field || !value) continue;
        incoming[key] = field.list ? String(value).split(/[,\n]/).map((x) => x.trim()).filter(Boolean) : value;
      }
      const detailCount = Object.keys(incoming).length;
      if (detailCount) setDetails((prev) => ({ ...prev, ...incoming }));
      const hasDesign = fill.design && Object.keys(fill.design).length > 0;
      if (hasDesign) setDesign((prev) => mergeKashiDesign(prev, fill.design));
      if (detailCount || hasDesign) {
        toast.success(`Kashi filled ${detailCount ? `${detailCount} detail${detailCount === 1 ? '' : 's'}` : ''}${detailCount && hasDesign ? ' and ' : ''}${hasDesign ? 'your design choices' : ''}. Review before you continue.`);
      }
    };
    apply();
    window.addEventListener(FILL_EVENT, apply);
    return () => window.removeEventListener(FILL_EVENT, apply);
  }, [setDetails, setDesign]);
}
