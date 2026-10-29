# Accessibility Review (DevDrop original)

Build-time checklist that matches DevDrop's deterministic quality review.

## Structure
Use landmarks: header, nav, main, footer. One h1 per page and headings in order. Use button for actions and a with href for navigation, never a clickable div.

## Names and labels
Every form control has a visible label or aria-label. Icon-only buttons have aria-label. Images have meaningful alt text, or alt="" when decorative. Decorative SVG icons use aria-hidden="true".

## Keyboard and focus
All interactive elements are reachable and operable by keyboard. Never remove the outline without a visible :focus-visible replacement. Menus and dialogs close on Escape and return focus.

## Color and motion
Text contrast is at least 4.5:1 (3:1 for large text and UI boundaries). Information is never conveyed by color alone. Provide a prefers-reduced-motion path for any animation and avoid transition: all.

## Responsive
Include the viewport meta tag. Targets are about 44px. Content reflows at 320px without horizontal scrolling.

## Links
External links that open a new tab use rel="noopener noreferrer". Link text describes the destination.
