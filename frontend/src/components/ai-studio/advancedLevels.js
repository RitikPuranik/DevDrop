export const ADVANCED_LEVELS = [
  { id: 'low', label: 'Low', tagline: 'Fast', blurb: 'Essential pages, clean structure, build-checked and auto-repaired. Quickest advanced option.', checks: 'Structure + build checks' },
  { id: 'moderate', label: 'Moderate', tagline: 'Balanced', blurb: 'Every requested page plus helpful supporting pages, tested in a real browser on phone, tablet and desktop.', checks: 'Adds browser functional + responsive tests' },
  { id: 'max', label: 'Max', tagline: 'Best quality', blurb: 'The most complete, polished build: richer pages and features, deepest testing and an AI visual review. Takes longest.', checks: 'Adds AI visual review + most repair rounds' },
];
export const DEFAULT_ADVANCED_LEVEL = 'moderate';
export const levelLabel = (id) => ADVANCED_LEVELS.find((l) => l.id === id)?.label || null;
