import { useEffect, useState, useCallback } from 'react';

// A small, tasteful set of accent palettes — muted, professional tones.
// Deliberately avoids saturated/neon colors.
export const ACCENT_THEMES = {
  gold: {
    id: 'gold',
    label: 'Gold',
    accent: '#8b7355',
    accentHover: '#9a8265',
    accentActive: '#725e46',
    accentSoft: 'rgba(139, 115, 85, 0.14)',
  },
  emerald: {
    id: 'emerald',
    label: 'Emerald',
    accent: '#3f7a5f',
    accentHover: '#4c8f70',
    accentActive: '#33654e',
    accentSoft: 'rgba(63, 122, 95, 0.14)',
  },
  slate: {
    id: 'slate',
    label: 'Slate',
    accent: '#5b6b7c',
    accentHover: '#6b7d90',
    accentActive: '#495566',
    accentSoft: 'rgba(91, 107, 124, 0.16)',
  },
  clay: {
    id: 'clay',
    label: 'Clay',
    accent: '#a6603f',
    accentHover: '#b8734f',
    accentActive: '#8a4e33',
    accentSoft: 'rgba(166, 96, 63, 0.14)',
  },
};

const STORAGE_KEY = 'devdrop_accent_theme';
const DEFAULT_THEME = 'gold';

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return ACCENT_THEMES[stored] ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

// Scoped accent-color preference for the account area (Profile / Dashboard).
// Applies via CSS custom properties on a wrapper element so the rest of the
// site's styling is completely untouched.
export function useAccentTheme() {
  const [themeId, setThemeId] = useState(readStoredTheme);

  const setTheme = useCallback((id) => {
    if (!ACCENT_THEMES[id]) return;
    setThemeId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
  }, []);

  useEffect(() => {
    const sync = () => setThemeId(readStoredTheme());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const theme = ACCENT_THEMES[themeId] || ACCENT_THEMES[DEFAULT_THEME];

  const cssVars = {
    '--accent': theme.accent,
    '--accent-hover': theme.accentHover,
    '--accent-active': theme.accentActive,
    '--accent-soft': theme.accentSoft,
  };

  return { theme, themeId, setTheme, cssVars, themes: Object.values(ACCENT_THEMES) };
}
