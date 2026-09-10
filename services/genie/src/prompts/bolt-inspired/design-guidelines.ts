/**
 * Design guidelines for Genie AI
 * Based on bolt.diy's design excellence standards
 */

export const DESIGN_GUIDELINES = `
<design_guidelines>
  ## DESIGN PHILOSOPHY

  Create visually stunning, unique, highly interactive, content-rich, and production-ready applications. Avoid generic templates at all costs.

  ## VISUAL IDENTITY & BRANDING

  1. **Distinctive Art Direction**:
     - Use unique shapes, grids, and layouts
     - Incorporate custom illustrations or 3D elements
     - Create brand-specific visual signatures
     - Avoid generic "startup" aesthetics

  2. **Premium Typography**:
     - Use refined font hierarchies
     - Pair modern sans-serif with elegant serif
     - Minimum sizes: 18px body, 40px+ headlines
     - Proper line height and letter spacing
     - Examples: Inter + Playfair Display, Poppins + Lora

  3. **Microbranding**:
     - Custom icons aligned with brand voice
     - Unique button styles and hover effects
     - Branded animations and transitions
     - Consistent visual language

  4. **High-Quality Assets**:
     - Use optimized, relevant images from Pexels
     - NEVER download images, only link to them
     - Use appropriate image dimensions
     - Implement lazy loading

  ## LAYOUT & STRUCTURE

  1. **Spacing System**:
     - Use 8pt grid system
     - Design tokens for consistent spacing
     - Minimum touch targets: 44×44px
     - Proper whitespace for focus and balance

  2. **Responsive Grids**:
     - Mobile-first approach
     - CSS Grid and Flexbox
     - Breakpoints: 640px (sm), 768px (md), 1024px (lg), 1280px (xl)
     - Graceful degradation

  3. **Component Architecture**:
     - Atomic design principles
     - Atoms (buttons, inputs)
     - Molecules (forms, cards)
     - Organisms (headers, sections)

  ## COLOR SYSTEM

  1. **Palette Structure**:
     - Primary color (brand identity)
     - Secondary color (complementary)
     - Accent color (CTAs, highlights)
     - Neutral scale (grays)
     - Semantic colors (success, warning, error, info)

  2. **Color Usage**:
     - 4.5:1 minimum contrast ratio (WCAG AA)
     - Dark mode support
     - Consistent color application
     - Avoid pure black (#000) - use dark gray (#0f172a)

  3. **Example Palette**:
     Use a color palette with primary, secondary, accent, and neutral colors.
     Each color should have shades from 50 (lightest) to 900 (darkest).
     Example: primary-500 for main brand color, neutral-50 for light backgrounds.

  ## INTERACTION DESIGN

  1. **Animations & Transitions**:
     - Smooth, purposeful animations
     - Hover states with scale/color changes
     - Loading states with skeletons
     - Page transitions
     - Scroll-triggered animations
     - Duration: 150-300ms for interactions

  2. **Microinteractions**:
     - Button press feedback
     - Form input focus
     - Toggle switches
     - Progress indicators
     - Toast notifications
     - Modal enter/exit

  3. **User Feedback**:
     - Loading spinners
     - Success confirmations
     - Error messages inline
     - Empty states with illustrations
     - Skeleton screens

  ## ACCESSIBILITY (WCAG 2.1 AA)

  1. **Semantic HTML**:
     - Proper heading hierarchy (h1-h6)
     - nav, main, article, aside tags
     - Form labels and fieldsets
     - Alt text for images

  2. **ARIA Attributes**:
     - aria-label for icon buttons
     - aria-describedby for form errors
     - aria-live for dynamic content
     - role attributes where needed

  3. **Keyboard Navigation**:
     - Tab order logical
     - Focus visible indicators
     - Skip to main content link
     - Escape closes modals
     - Enter/Space activates buttons

  4. **Screen Reader Support**:
     - Meaningful alt text
     - Hidden labels for context
     - Announce dynamic changes
     - Proper table markup

  ## COMPONENT PATTERNS

  1. **Navigation**:
     - Clear, consistent navigation
     - Mobile hamburger menu
     - Active state indicators
     - Dropdown menus with hover/click
     - Breadcrumbs for deep navigation

  2. **Forms**:
     - Inline validation
     - Error messages near inputs
     - Success states
     - Loading states on submit
     - Accessible labels

  3. **Cards**:
     - Consistent padding and spacing
     - Hover effects (lift, shadow)
     - Clear hierarchy
     - Action buttons

  4. **Modals/Dialogs**:
     - Backdrop overlay
     - Close button
     - Escape key closes
     - Focus trap
     - Smooth enter/exit

  5. **Tables**:
     - Sortable columns
     - Pagination
     - Row hover states
     - Mobile-responsive (cards on small screens)

  ## MODERN UI PATTERNS

  1. **Hero Sections**:
     - Large, bold headlines
     - Clear value proposition
     - Strong CTAs
     - Background images or gradients
     - Optional: parallax effects

  2. **Feature Sections**:
     - Grid layouts (3 or 4 columns)
     - Icons + Titles + Descriptions
     - Hover animations
     - Balanced spacing

  3. **Testimonials**:
     - Photos and quotes
     - Name and role
     - Carousel or grid
     - Star ratings

  4. **Pricing Tables**:
     - 3 tiers (Free, Pro, Enterprise)
     - Highlight recommended
     - Feature comparison
     - Clear CTAs

  5. **Footer**:
     - Multi-column layout
     - Links to pages
     - Social media icons
     - Copyright notice

  ## PERFORMANCE OPTIMIZATION

  1. **Images**:
     - Link to optimized Pexels URLs
     - Lazy loading
     - Proper dimensions
     - WebP format where possible

  2. **Code Splitting**:
     - Lazy load routes
     - Dynamic imports
     - Reduce initial bundle size

  3. **Critical CSS**:
     - Inline critical styles
     - Defer non-critical CSS
     - Use Tailwind's purge

  ## MOBILE RESPONSIVENESS

  1. **Mobile-First Design**:
     - Start with mobile layout
     - Progressive enhancement
     - Touch-friendly targets (44×44px min)

  2. **Breakpoints**:
     - sm: 640px (large phones)
     - md: 768px (tablets)
     - lg: 1024px (laptops)
     - xl: 1280px (desktops)
     - 2xl: 1536px (large screens)

  3. **Mobile Patterns**:
     - Hamburger menu
     - Bottom navigation
     - Swipe gestures
     - Collapsible sections
     - Stack layouts

  ## FINAL QUALITY CHECK

  Before delivering, ask yourself:
  1. ✓ Does it look professional and unique?
  2. ✓ Is it fully responsive (mobile to desktop)?
  3. ✓ Are interactions smooth and delightful?
  4. ✓ Is it accessible (WCAG 2.1 AA)?
  5. ✓ Does it have proper loading/error states?
  6. ✓ Is the code clean and maintainable?
  7. ✓ Would I be proud to show this to a design team at Apple or Stripe?

  If any answer is no, iterate until all are yes.
</design_guidelines>`;
