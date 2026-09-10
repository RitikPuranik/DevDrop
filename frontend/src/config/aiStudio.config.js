import { User } from 'lucide-react';

// Adding a new website type later means adding an entry here + a
// matching *DetailsStep component — not rewriting the wizard (Section 5).
export const WEBSITE_TYPES = [
  {
    id: 'portfolio',
    title: 'Portfolio',
    description: 'A personal site showcasing who you are, your skills, and your projects.',
    icon: User,
    enabled: true,
  },
  // Future: 'saas', 'landing-page', 'ecommerce', 'blog', 'agency',
  // 'dashboard', 'restaurant', 'documentation' — deliberately not added
  // in Phase 6 (Section 4).
];

// Mirrors backend/src/modules/ai/ai.validators.js SUPPORTED_THEMES /
// SUPPORTED_STYLES exactly, so the frontend can never submit a value the
// AI service doesn't accept (Section 9).
export const DESIGN_STYLES = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'modern', label: 'Modern' },
  { id: 'professional', label: 'Professional' },
  { id: 'creative', label: 'Creative' },
];

export const DESIGN_THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'auto', label: 'Auto' },
];

// The AI-service schema only accepts a boolean `animations` flag today,
// so "Rich" isn't offered — it would silently collapse to `true` anyway.
export const ANIMATION_OPTIONS = [
  { id: false, label: 'None' },
  { id: true, label: 'Subtle' },
];

export const ASSET_TYPES = {
  PROFILE_IMAGE: 'profile-image',
  PROJECT_IMAGE: 'project-image',
  RESUME: 'resume',
};

export const AI_STUDIO_STEPS = ['websiteType', 'details', 'assets', 'design', 'review', 'generating'];
