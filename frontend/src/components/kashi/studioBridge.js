/**
 * Small bridge between Kashi (floating assistant) and the AI Studio forms.
 *
 *  - Forms register a snapshot getter so Kashi knows which website type / step / fields are on screen.
 *  - Kashi queues a validated "fill" (website type + details + design). Whichever form is able to use it takes it.
 *    A fill queued while the user is still on the type picker (or on another page) waits briefly for the
 *    matching builder to mount, then expires so it can never surprise the user later.
 */
const FILL_KEY = '__kashiStudioFill';
const SNAPSHOT_KEY = '__kashiStudioSnapshot';
const FILL_TTL_MS = 2 * 60 * 1000;
export const FILL_EVENT = 'kashi-studio-fill';

export function setStudioSnapshot(getter) {
  if (typeof window === 'undefined') return () => {};
  const previous = window[SNAPSHOT_KEY] || null;
  window[SNAPSHOT_KEY] = getter;
  // Builders nest inside the studio page: when one unmounts, the page's own snapshot (type picker) comes back.
  return () => { if (window[SNAPSHOT_KEY] === getter) window[SNAPSHOT_KEY] = previous; };
}

export function getStudioSnapshot() {
  try {
    return (typeof window !== 'undefined' && window[SNAPSHOT_KEY]?.()) || null;
  } catch {
    return null;
  }
}

export function queueStudioFill(fill) {
  if (typeof window === 'undefined' || !fill) return;
  window[FILL_KEY] = { ...fill, at: Date.now() };
  window.dispatchEvent(new CustomEvent(FILL_EVENT));
}

/** Returns the pending fill if it is fresh and `accepts(fill)` is true, and removes it. */
export function takeStudioFill(accepts = () => true) {
  if (typeof window === 'undefined') return null;
  const fill = window[FILL_KEY];
  if (!fill) return null;
  if (Date.now() - fill.at > FILL_TTL_MS) { window[FILL_KEY] = null; return null; }
  if (!accepts(fill)) return null;
  window[FILL_KEY] = null;
  return fill;
}

export function peekStudioFill() {
  const fill = typeof window !== 'undefined' ? window[FILL_KEY] : null;
  return fill && Date.now() - fill.at <= FILL_TTL_MS ? fill : null;
}
