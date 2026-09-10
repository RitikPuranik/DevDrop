/**
 * Pre-Validation Rules - Prevent common AI mistakes BEFORE generation
 * 
 * These rules should be embedded in the AI prompt to guide better code generation
 */

export const VALIDATION_RULES = {
  typescript: {
    imports: [
      "Always import hooks at the top of React components: import useState and useEffect from 'react'",
      "Always import Next.js routing hook from 'next/router' package",
      "Never access routing hook as a property, import and call it directly",
      "Never use require() for hooks, always use ES6 imports"
    ],
    
    syntax: [
      "Use template strings carefully - avoid nested backticks in map functions",
      "For sitemap.xml or similar XML generation, use String.raw or escape properly",
      "Always use className={...} not className{...} in JSX",
      "Always add semicolons at the end of statements"
    ],
    
    modules: [
      'If package.json has "type": "module", use ES modules (export default, import)',
      "Never mix CommonJS (module.exports, require) with ES modules",
      "For Next.js config in ESM projects, name it next.config.cjs or use export default"
    ],
    
    dependencies: [
      "Always include all required dependencies in package.json",
      "For React projects: react, react-dom, @types/react, @types/react-dom",
      "For Next.js: next, @types/node",
      "For data fetching: swr or react-query",
      "Always specify version numbers like ^18.3.1, never use 'latest'"
    ],
    
    nextjs: [
      "In Next.js 13+, use App Router (app/) or Pages Router (pages/), not both",
      "API routes go in pages/api/ or app/api/",
      "Dynamic imports should use next/dynamic",
      "Use next/link for navigation, next/image for images"
    ],
    
    hooks: [
      "React hooks must be called at the top level of components",
      "Next.js routing hook returns router object with push(), query, etc. methods",
      "Never call hooks inside loops, conditions, or nested functions",
      "Custom hooks must start with 'use' prefix"
    ]
  },
  
  javascript: {
    common: [
      "Prefer const over let when variables don't change",
      "Use async/await instead of .then() chains",
      "Always handle errors with try/catch in async functions"
    ]
  },
  
  react: {
    components: [
      "Functional components are preferred over class components",
      "Always export components: export default function ComponentName()",
      "Props should be typed in TypeScript: function MyComponent(props: Props)",
      "Use meaningful component names in PascalCase"
    ],
    
    state: [
      "Initialize useState with proper types, example: const [count, setCount] = useState with type number and initial value 0",
      "Never mutate state directly, always use setState function",
      "For complex state, consider useReducer"
    ]
  },
  
  html: {
    linking: [
      "NEVER use leading slash in href/src attributes: use 'styles.css' NOT '/styles.css'",
      "Leading slash (/) means 'from domain root' - breaks static hosting",
      "Use relative paths: href='styles.css' or href='assets/logo.png'",
      "Browser will get HTML 404 page instead of CSS/JS if path is wrong",
      "This causes: 'Uncaught SyntaxError: Unexpected token <' in scripts.js"
    ],
    
    structure: [
      "Static sites: index.html, styles.css, scripts.js at ROOT level",
      "NO nested folders like public/, src/, dist/ for static landing pages",
      "Place images/icons in assets/ subdirectory if needed",
      "NO package.json, tsconfig.json, or build tools for simple static sites"
    ],
    
    javascript: [
      "Use VANILLA JavaScript - NO TypeScript syntax in .js files",
      "NO type annotations: (e: Event), (el: HTMLElement), etc.",
      "NO 'as' type assertions: document.getElementById('id') as HTMLElement",
      "Use 'use strict'; at the top of scripts.js",
      "Include actual functional code - no empty files"
    ]
  },
  
  common: {
    files: [
      "Always include package.json with name, version, scripts, dependencies",
      "Include tsconfig.json for TypeScript projects",
      "Include .gitignore to exclude node_modules, .env, build files",
      "README.md should have setup instructions"
    ],
    
    structure: [
      "Organize code: src/components/, src/pages/, src/utils/, src/types/",
      "Keep components small and focused on one responsibility",
      "Extract reusable logic into custom hooks or utility functions"
    ]
  }
};

/**
 * Generate a prompt addition that includes validation rules
 * Skip validation for vanilla HTML projects (simplicity first)
 */
export function generateValidationPrompt(language: string = 'typescript'): string {
  // Skip validation rules for vanilla HTML/CSS/JS projects
  // These are simple projects that don't need strict validation
  if (language === 'html' || language === 'vanilla') {
    return '\n\n## VANILLA HTML/CSS/JS - Keep it simple!\n' +
           'Create clean, simple code. No strict validation needed.\n';
  }
  
  const rules = VALIDATION_RULES[language as keyof typeof VALIDATION_RULES] || VALIDATION_RULES.common;
  
  let prompt = '\n\n## CRITICAL CODE QUALITY RULES - MUST FOLLOW:\n\n';
  
  for (const [category, ruleList] of Object.entries(rules)) {
    prompt += `### ${category.toUpperCase()}:\n`;
    for (const rule of ruleList as string[]) {
      prompt += `- ${rule}\n`;
    }
    prompt += '\n';
  }
  
  // Add HTML-specific rules for static sites (but only for TypeScript projects with HTML)
  if (language === 'static') {
    prompt += '### ⚠️ STATIC HTML SITES - CRITICAL RULES:\n';
    for (const [category, ruleList] of Object.entries(VALIDATION_RULES.html)) {
      prompt += `\n#### ${category.toUpperCase()}:\n`;
      for (const rule of ruleList as string[]) {
        prompt += `- ${rule}\n`;
      }
    }
    prompt += '\n';
  }
  
  // Add React-specific rules for React projects
  if (language === 'typescript' || language === 'javascript') {
    prompt += '### REACT COMPONENTS:\n';
    for (const rule of VALIDATION_RULES.react.components) {
      prompt += `- ${rule}\n`;
    }
    prompt += '\n';
    
    prompt += '### REACT STATE:\n';
    for (const rule of VALIDATION_RULES.react.state) {
      prompt += `- ${rule}\n`;
    }
    prompt += '\n';
  }
  
  prompt += '### COMMON BEST PRACTICES:\n';
  for (const [_category, ruleList] of Object.entries(VALIDATION_RULES.common)) {
    for (const rule of ruleList as string[]) {
      prompt += `- ${rule}\n`;
    }
  }
  
  prompt += '\n⚠️ IMPORTANT: Follow these rules strictly to ensure the generated code compiles and runs without errors.\n\n';
  
  return prompt;
}

/**
 * Get specific rules for error prevention
 */
export function getErrorPreventionRules(): string[] {
  return [
    // From your actual deployment errors:
    "1. NEVER access routing hook as property of Router object - Import routing hook directly from 'next/router' and call it",
    "2. ALWAYS include 'swr' in package.json if using useSWR hook",
    "3. AVOID nested template strings with backticks - use String.raw or concatenation for XML/HTML generation",
    "4. CHECK all imports are listed in package.json dependencies or devDependencies",
    "5. USE proper TypeScript syntax - no 'require' for hooks, no module.exports in ESM",
    "6. VERIFY all React hooks like useState, useEffect, routing hooks are imported before use",
    "7. TEST template strings for proper escaping - especially in sitemap.xml.ts or similar files",
    "8. ENSURE package.json has correct 'type' field matching the module system used",
    "9. INCLUDE @types/* packages for all non-TypeScript dependencies",
    "10. VALIDATE JSX syntax - use className={...} not className{...}",
    "11. 🚨 STATIC HTML: NEVER use leading slash in href/src - use 'styles.css' NOT '/styles.css' (causes 'Uncaught SyntaxError: Unexpected token <')",
    "12. 🚨 STATIC HTML: Files must be at ROOT - index.html, styles.css, scripts.js (NO src/, public/, dist/ folders)",
    "13. 🚨 STATIC HTML: Use vanilla JavaScript ONLY - NO TypeScript syntax in .js files"
  ];
}

/**
 * Validate static HTML files for common issues
 */
export function validateStaticHtmlFiles(files: Array<{ path: string; content: string }>): { 
  isValid: boolean; 
  errors: string[]; 
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check if this is a static HTML project
  const hasIndexHtml = files.some(f => f.path === 'index.html');
  const hasStylesCss = files.some(f => f.path === 'styles.css');
  const hasScriptsJs = files.some(f => f.path === 'scripts.js');
  const hasPackageJson = files.some(f => f.path === 'package.json');
  const hasTsFiles = files.some(f => f.path.endsWith('.ts') || f.path.endsWith('.tsx'));
  
  const isStaticHtml = hasIndexHtml && hasStylesCss && !hasPackageJson && !hasTsFiles;
  
  if (!isStaticHtml) {
    return { isValid: true, errors: [], warnings: [] };
  }
  
  console.log('🔍 Validating static HTML files...');
  
  // Find index.html
  const indexHtml = files.find(f => f.path === 'index.html');
  if (indexHtml) {
    const content = indexHtml.content;
    
    // Check for leading slashes in href/src attributes
    const leadingSlashMatches = content.match(/(href|src)=["']\/[^/][^"']*["']/g);
    if (leadingSlashMatches) {
      errors.push(`❌ CRITICAL: index.html contains leading slashes in href/src attributes: ${leadingSlashMatches.join(', ')}`);
      errors.push(`   This will cause "Uncaught SyntaxError: Unexpected token '<'" errors`);
      errors.push(`   Fix: Remove leading slashes - use 'styles.css' not '/styles.css'`);
    }
    
    // Check for wrong paths (src/, public/, dist/)
    const wrongPaths = content.match(/(href|src)=["'](src|public|dist)\//g);
    if (wrongPaths) {
      errors.push(`❌ CRITICAL: index.html references non-existent folders: ${wrongPaths.join(', ')}`);
      errors.push(`   Static sites don't have src/, public/, or dist/ folders`);
      errors.push(`   Fix: Use direct file references - 'styles.css' not 'src/styles.css'`);
    }
  }
  
  // Check styles.css
  const stylesCss = files.find(f => f.path === 'styles.css');
  if (stylesCss) {
    const content = stylesCss.content.trim();
    const lineCount = content.split('\n').length;
    
    if (lineCount < 50) {
      warnings.push(`⚠️ styles.css has only ${lineCount} lines - should have 100+ lines of complete styling`);
    }
    
    if (content.length === 0) {
      errors.push(`❌ CRITICAL: styles.css is empty`);
    }
    
    if (content.includes('/* More styles */') || content.includes('// More styles')) {
      warnings.push(`⚠️ styles.css contains placeholder comments - needs actual complete styles`);
    }
    
    // Check for common CSS typos/errors
    const cssErrors = [];
    
    // Check for ". nine" or similar spacing typos in property values
    if (/\.\s+[a-z]+(?=;|\s)/i.test(content)) {
      cssErrors.push('Spacing typo in CSS values (e.g., ". nine" should be ".9rem")');
    }
    
    // Check for incomplete property values
    if (/:\s*;/.test(content)) {
      cssErrors.push('Empty CSS property values found');
    }
    
    // Check for missing semicolons - ONLY for single-line properties
    // Skip this check for minified/compressed CSS (one-liners are valid)
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      
      // Skip comments, braces, empty lines, media queries
      if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('//') || 
          trimmed === '{' || trimmed === '}' || trimmed.includes('@media') ||
          trimmed.startsWith('@')) {
        return;
      }
      
      // Skip lines with closing brace (they might be one-liners like "{ ... }")
      if (trimmed.includes('}')) {
        return;
      }
      
      // If line has SINGLE property:value but no semicolon
      // Count colons to detect single vs multiple properties
      const colonCount = (trimmed.match(/:/g) || []).length;
      const semicolonCount = (trimmed.match(/;/g) || []).length;
      
      // If exactly one colon and no semicolon at end
      if (colonCount === 1 && !trimmed.endsWith(';') && !trimmed.endsWith('{')) {
        const nextLine = lines[idx + 1]?.trim();
        // Only warn if next line is a closing brace or another property
        if (nextLine && (nextLine === '}' || (nextLine.includes(':') && !nextLine.startsWith('@')))) {
          cssErrors.push(`Line ${idx + 1}: Missing semicolon - "${trimmed.substring(0, 50)}"`);
        }
      }
      
      // If multiple colons, check each should have matching semicolons
      // (for one-liner styles like "{ prop: val; prop: val; }")
      if (colonCount > 1 && semicolonCount < colonCount) {
        // This is a potential error, but let's be lenient for now
        // Many minified CSS files are valid without perfect semicolon matching
      }
    });
    
    if (cssErrors.length > 0) {
      errors.push(`❌ CRITICAL: CSS syntax errors detected:`);
      cssErrors.forEach(err => errors.push(`   - ${err}`));
    }
  }
  
  // Check scripts.js
  if (hasScriptsJs) {
    const scriptsJs = files.find(f => f.path === 'scripts.js');
    if (scriptsJs) {
      const content = scriptsJs.content.trim();
      
      if (content.length === 0) {
        errors.push(`❌ CRITICAL: scripts.js is empty`);
      }
      
      // Check for TypeScript syntax in JS file
      const tsPatterns = [
        /:\s*(string|number|boolean|any|void|HTMLElement|HTMLInputElement|Event)\b/,
        /\bas\s+HTML/,
        /interface\s+\w+/,
        /type\s+\w+\s*=/
      ];
      
      for (const pattern of tsPatterns) {
        if (pattern.test(content)) {
          errors.push(`❌ CRITICAL: scripts.js contains TypeScript syntax: ${pattern.toString()}`);
          errors.push(`   Use vanilla JavaScript only - no type annotations`);
          break;
        }
      }
    }
  }
  
  const isValid = errors.length === 0;
  
  if (!isValid) {
    console.error('❌ Static HTML validation failed:', errors);
  } else if (warnings.length > 0) {
    console.warn('⚠️ Static HTML validation warnings:', warnings);
  } else {
    console.log('✅ Static HTML validation passed');
  }
  
  return { isValid, errors, warnings };
}

/**
 * Get checklist for AI to verify before returning code
 * Only applies to TypeScript/React projects, not vanilla HTML
 */
export function getAIChecklistPrompt(language: string = 'typescript'): string {
  // Skip checklist for vanilla HTML projects (keep it simple)
  if (language === 'html' || language === 'vanilla') {
    return `
## VANILLA HTML/CSS/JS - Simple Guidelines:

Just create clean, working code:
- ✅ Use relative paths: "styles.css" not "/styles.css"
- ✅ Pure JavaScript (no TypeScript syntax)
- ✅ Files at root: index.html, styles.css, scripts.js

No strict checklist needed - keep it simple and functional!
`;
  }

  // Full checklist for TypeScript/React projects
  return `
## BEFORE RETURNING CODE - CHECKLIST:

Please verify ALL of these before generating the final code:

✅ 1. All React hooks like useState, useEffect, routing hooks are imported at the top
✅ 2. Routing hooks are imported directly from their package, not accessed as properties
✅ 3. All packages used in imports are listed in package.json
✅ 4. Template strings don't have problematic nested backticks
✅ 5. No module.exports if package.json has "type": "module"
✅ 6. All JSX attributes use = sign with curly braces properly
✅ 7. TypeScript types are properly defined for components and functions
✅ 8. No hardcoded values that should be environment variables
✅ 9. All async functions have proper error handling
✅ 10. Code follows consistent formatting (semicolons, indentation)

If ANY item is unchecked, fix it before returning the code.
`;
}
