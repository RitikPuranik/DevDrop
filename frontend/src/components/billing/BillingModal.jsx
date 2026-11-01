import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './billing.css';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/** Accessible modal: portal, focus trap, Escape, scroll lock, focus restore. Self-styled (works outside the workspace). */
export default function BillingModal({ open, onClose, title, size, dismissible = true, children, labelledBy }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const node = ref.current;
    const first = node?.querySelector('[data-autofocus]') || node?.querySelector(FOCUSABLE);
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const a = items[0]; const z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; previous?.focus?.(); };
  }, [open, dismissible, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="bl-modal-root">
      <div className="bl-scrim" onClick={dismissible ? onClose : undefined} aria-hidden="true" />
      <div ref={ref} className="bl-modal" data-size={size} role="dialog" aria-modal="true" aria-labelledby={labelledBy || titleId} aria-label={title ? undefined : 'Dialog'}>
        {dismissible && (
          <button type="button" className="bl-x" onClick={onClose} aria-label="Close"><X size={16} /></button>
        )}
        {typeof children === 'function' ? children({ titleId }) : children}
      </div>
    </div>,
    document.body
  );
}
