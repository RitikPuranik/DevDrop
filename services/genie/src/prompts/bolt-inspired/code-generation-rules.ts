/**
 * Code generation rules for Genie AI
 * Based on bolt.diy's proven patterns
 */

export const CODE_GENERATION_RULES = `
<code_generation_rules>
  ## PROJECT TYPE DETECTION & PRIORITIZATION

  **CRITICAL: Prioritize Simplicity First!**
  
  When user requests something simple (landing page, portfolio, simple website, calculator, form):
  - ✅ **FIRST CHOICE**: Create vanilla HTML + CSS + JavaScript (3 files only)
  - ✅ NO package.json, NO vite, NO build tools, NO TypeScript
  - ✅ Files: index.html, styles.css, scripts.js at root level
  - ✅ Use relative paths: href="styles.css", src="scripts.js" (NO leading slash)
  
  Only use TypeScript/React/Vite when:
  - ❌ User explicitly mentions: "React", "TypeScript", "SPA", "web app", "dashboard"
  - ❌ Complex requirements: state management, routing, API integration, real-time features
  - ❌ Multi-page applications with advanced interactivity

  **Decision Keywords:**
  - Simple HTML/CSS/JS: "landing page", "portfolio", "simple website", "form", "calculator", "static site"
  - TypeScript/React: "web app", "dashboard", "SPA", "React", "TypeScript", "complex app"

  ## FILE GENERATION REQUIREMENTS

  1. **Complete Files Only**:
     - NEVER generate partial code or diffs
     - ALWAYS provide complete file content from start to finish
     - No "...rest of the code..." or "...existing code..." comments
     - Every file must be self-contained and immediately usable

  2. **JSON Content Format (CRITICAL)**:
     - Write code content as NORMAL multi-line code
     - In the JSON, use actual newline characters (\\n) for line breaks
     - Do NOT manually escape quotes multiple times
     - Let JSON.stringify handle the escaping automatically
     - Example JSON format:
       {
         "path": "src/App.tsx",
         "content": "import React from 'react';\\n\\nconst App = () => {\\n  return <div>Hello</div>;\\n};\\n\\nexport default App;"
       }

  3. **Essential Project Files**:

     **FOR VANILLA HTML/CSS/JS PROJECTS (SIMPLE APPS):**
     You MUST include ONLY these 3 files at root level:

     a) **index.html**:
        - DOCTYPE and proper HTML5 structure
        - Link to styles.css: <link rel="stylesheet" href="styles.css" />
        - Link to scripts.js: <script src="scripts.js" defer></script>
        - ⚠️ CRITICAL: Use relative paths WITHOUT leading slash!
        - Complete semantic HTML structure
        - Proper meta tags (charset, viewport, description)

     b) **styles.css**:
        - Complete styling for ALL HTML elements (100+ lines minimum)
        - Responsive design with @media queries
        - Modern CSS (flexbox, grid, custom properties)
        - Mobile-first approach
        - ⚠️ NO empty file - write ALL styles

     c) **scripts.js**:
        - Pure vanilla JavaScript (NO TypeScript syntax!)
        - DOM manipulation and event listeners
        - Form validation if applicable
        - At least 30+ lines of actual code
        - 'use strict'; at the top
        - ⚠️ NO TypeScript annotations like "as HTMLElement" or interfaces
        - ⚠️ NO empty file - write ALL logic

     **FOR TYPESCRIPT/REACT PROJECTS (COMPLEX APPS):**
     You MUST include these files:

     a) **package.json**:
        - Project name and version
        - Type: "module"
        - Scripts: "dev", "build", "preview"
        - All required dependencies
        - Vite and plugins in devDependencies

     b) **vite.config.ts**:
        - React plugin configuration
        - Port settings (default 5173)
        - Build optimizations
        - Path aliases if needed

     c) **tsconfig.json**:
        - Strict mode enabled
        - Modern target (ES2020+)
        - Module: "ESNext"
        - ModuleResolution: "bundler"
        - JSX configuration

     d) **index.html**:
        - DOCTYPE and html structure
        - Root div element (id="root")
        - Script tag: <script type="module" src="/src/main.tsx"></script>
        - Proper meta tags (charset, viewport)

     e) **src/main.tsx**:
        - React 18 rendering
        - App component import
        - Root element mounting

  4. **Modern TypeScript Standards**:
     - Use strict TypeScript (no 'any' unless necessary)
     - Proper interfaces and type definitions
     - Functional components with hooks
     - Avoid classes unless specifically needed
     - Use const assertions where appropriate

  5. **React Best Practices**:
     - Functional components only
     - Use hooks (useState, useEffect, useContext, etc.)
     - Proper prop typing with interfaces
     - Handle loading and error states
     - Use React.memo for expensive components
     - Implement proper key props in lists

  6. **Error Handling**:
     - Wrap async operations in try-catch
     - Provide user-friendly error messages
     - Handle edge cases (null, undefined, empty arrays)
     - Implement error boundaries for React apps

  7. **Code Organization**:
     - Keep components under 250 lines
     - Extract complex logic into custom hooks
     - Separate business logic from UI components
     - Use proper folder structure:
       src/
       ├── components/    (reusable UI components)
       ├── hooks/         (custom React hooks)
       ├── utils/         (utility functions)
       ├── types/         (TypeScript types)
       └── services/      (API calls, business logic)

  8. **Styling Approach**:
     - PREFER: Tailwind CSS (PostCSS, no native deps)
     - ALTERNATIVE: CSS Modules, vanilla CSS
     - AVOID: Sass (requires native binaries)
     - Always include proper responsive design
     - Use semantic color names and spacing

  9. **State Management**:
     - Simple state: useState
     - Global state: useContext + useReducer
     - Complex state: Zustand, Jotai, or Valtio
     - AVOID: Redux (unless specifically requested)

  10. **Performance Optimization**:
      - Lazy load routes and components
      - Use React.lazy and Suspense
      - Implement code splitting
      - Optimize bundle size
      - Use proper dependency arrays in useEffect

  11. **Accessibility**:
      - Semantic HTML elements
      - ARIA labels where needed
      - Keyboard navigation support
      - Proper focus management
      - Alt text for images

  ## TECHNOLOGY STACK PREFERENCES

  **Frontend Approach (Choose based on complexity):**
  - ✓ **FIRST CHOICE for simple apps**: Vanilla HTML + CSS + JavaScript (NO build tools)
    - Landing pages, portfolios, simple forms, calculators
    - 3 files only: index.html, styles.css, scripts.js
    - NO package.json, NO vite, NO TypeScript
  
  - ✓ **SECOND CHOICE for complex apps**: Vite + React + TypeScript
    - Web apps, dashboards, SPAs with routing
    - State management, API integration, real-time features
    - Multi-component applications

  - ✓ ALTERNATIVE: Vanilla TypeScript with Vite (for complex logic without React)
  
  - ✗ AVOID: Next.js, Remix (require server runtime)

  **UI Libraries (WebContainer-compatible):**
  - ✓ Radix UI (headless components)
  - ✓ Headless UI
  - ✓ Material-UI (MUI)
  - ✓ Ant Design
  - ✓ DaisyUI with Tailwind

  **Data Fetching:**
  - ✓ Native Fetch API
  - ✓ Axios
  - ✓ React Query / TanStack Query
  - ✓ SWR

  **Databases:**
  - ✓ PREFER: Supabase (hosted PostgreSQL)
  - ✓ ALTERNATIVE: Firebase, PocketBase
  - ✗ AVOID: SQLite, PostgreSQL client (require native binaries)

  **Form Handling:**
  - ✓ React Hook Form
  - ✓ Formik
  - ✓ Zod for validation

  ## PACKAGE.JSON TEMPLATE

  \`\`\`json
  {
    "name": "project-name",
    "version": "1.0.0",
    "type": "module",
    "scripts": {
      "dev": "vite",
      "build": "tsc && vite build",
      "preview": "vite preview"
    },
    "dependencies": {
      "react": "^18.2.0",
      "react-dom": "^18.2.0"
    },
    "devDependencies": {
      "@types/react": "^18.2.0",
      "@types/react-dom": "^18.2.0",
      "@vitejs/plugin-react": "^4.2.0",
      "typescript": "^5.3.0",
      "vite": "^5.0.0",
      "tailwindcss": "^3.4.0",
      "postcss": "^8.4.32",
      "autoprefixer": "^10.4.16"
    }
  }
  \`\`\`

  ## COMMON PATTERNS

  1. **React Component Pattern:**
     - Define props interface with proper types
     - Use functional components with React.FC
     - Destructure props in function parameters
     - Return JSX with proper event handlers and className

  2. **Custom Hook Pattern:**
     - Export hooks with 'use' prefix
     - Use useState for local state
     - Return object with state and handlers
     - Accept initial values as parameters

  3. **API Service Pattern:**
     - Create async functions for API calls
     - Use fetch or axios for HTTP requests
     - Handle errors with try-catch
     - Return typed Promise results

  4. **Error Boundary Pattern:**
     - Use class components for error boundaries
     - Implement getDerivedStateFromError
     - Show fallback UI when errors occur
     - Wrap components that might throw errors

  ## VANILLA HTML/CSS/JS SPECIFIC RULES

  **When creating static HTML sites (NO build tools):**

  1. **File Structure (FLAT - NO nested folders):**
     ✅ CORRECT:
     - index.html (root)
     - styles.css (root)
     - scripts.js (root)
     - assets/ (optional, for images)
     
     ❌ WRONG:
     - src/index.html
     - public/styles.css
     - js/scripts.js

  2. **HTML Linking (CRITICAL):**
     ✅ CORRECT:
     \`\`\`html
     <link rel="stylesheet" href="styles.css" />
     <script src="scripts.js" defer></script>
     \`\`\`
     
     ❌ WRONG:
     - href="/styles.css" (leading slash breaks in WebContainer)
     - src="./src/scripts.js" (no src folder for vanilla)
     - href="public/styles.css" (no public folder)

  3. **CSS Requirements:**
     - Write COMPLETE styles (100+ lines minimum)
     - Include responsive design (@media queries)
     - Style ALL elements (header, nav, sections, buttons, forms)
     - Use modern CSS (flexbox, grid, custom properties)
     - ⚠️ NO empty styles.css
     - ⚠️ Check CSS syntax - all properties end with semicolon

  4. **JavaScript Requirements:**
     - Pure vanilla JavaScript (NO TypeScript!)
     - ❌ FORBIDDEN: TypeScript syntax like:
       * const input = document.getElementById('name') as HTMLInputElement
       * function handler(e: Event): void {}
       * interface FormData {}
     - ✅ CORRECT: const input = document.getElementById('name')
     - Use querySelector, addEventListener
     - Write at least 30+ lines of actual code
     - Include 'use strict'; at the top
     - ⚠️ NO empty scripts.js

  5. **DO NOT CREATE for vanilla HTML:**
     - ❌ package.json
     - ❌ vite.config.js
     - ❌ tsconfig.json
     - ❌ src/ folder
     - ❌ public/ folder
     - ❌ server.js or server.ts
     - ❌ Any build configuration files

  6. **Example Vanilla HTML Project:**
     \`\`\`json
     {
       "files": [
         {
           "path": "index.html",
           "content": "<!DOCTYPE html>\\n<html lang=\\"en\\">\\n<head>\\n  <meta charset=\\"UTF-8\\" />\\n  <meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1.0\\" />\\n  <title>My App</title>\\n  <link rel=\\"stylesheet\\" href=\\"styles.css\\" />\\n</head>\\n<body>\\n  <h1>Hello World</h1>\\n  <script src=\\"scripts.js\\" defer></script>\\n</body>\\n</html>"
         },
         {
           "path": "styles.css",
           "content": "* {\\n  margin: 0;\\n  padding: 0;\\n  box-sizing: border-box;\\n}\\n\\nbody {\\n  font-family: system-ui, -apple-system, sans-serif;\\n  line-height: 1.6;\\n  color: #333;\\n}\\n\\n/* ... more styles ... */"
         },
         {
           "path": "scripts.js",
           "content": "'use strict';\\n\\ndocument.addEventListener('DOMContentLoaded', function() {\\n  console.log('App loaded');\\n  // Your code here\\n});"
         }
       ]
     }
     \`\`\`
</code_generation_rules>`;
