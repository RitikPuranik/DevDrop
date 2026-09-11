import { BriefcaseBusiness, ShoppingBag, Newspaper, LayoutTemplate } from 'lucide-react';

export const WEBSITE_TYPES = [
  {
    id: 'portfolio',
    title: 'Portfolio',
    description: 'Personal portfolio for developers, designers, creators, students and professionals.',
    icon: BriefcaseBusiness,
    enabled: true,
  },
  {
    id: 'ecommerce',
    title: 'E-commerce',
    description: 'Product catalog, shopping experience, cart and conversion-focused storefront.',
    icon: ShoppingBag,
    enabled: false,
  },
  {
    id: 'blog',
    title: 'Blog / Magazine',
    description: 'Editorial website for articles, stories, news and long-form content.',
    icon: Newspaper,
    enabled: false,
  },
  {
    id: 'landing',
    title: 'Landing Page',
    description: 'Focused marketing page for a product, service, startup or campaign.',
    icon: LayoutTemplate,
    enabled: false,
  },
];

export const DESIGN_STYLES = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'modern', label: 'Modern' },
  { id: 'bold', label: 'Bold' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'creative', label: 'Creative' },
];

export const DESIGN_THEMES = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'neutral', label: 'Neutral' },
];

export const ANIMATION_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'subtle', label: 'Subtle' },
  { id: 'dynamic', label: 'Dynamic' },
];
