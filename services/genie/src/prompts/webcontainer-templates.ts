/**
 * WebContainer-optimized prompt template for TypeScript/JavaScript projects
 * Based on bolt.diy's proven prompt engineering
 */

import BOLT_INSPIRED_PROMPT from './bolt-inspired';

export const WEBCONTAINER_TYPESCRIPT_TEMPLATE = BOLT_INSPIRED_PROMPT;

export const detectLanguage = (prompt: string): string | null => {
  const lowerPrompt = prompt.toLowerCase();
  
  // Check for EXPLICIT complex requirements (use TypeScript/React)
  const complexIndicators = [
    'react app',
    'react component',
    'typescript app',
    'spa with',
    'single page app',
    'dashboard with',
    'web application with',
    'state management',
    'api integration',
    'real-time features',
    'websocket',
    'authentication system',
    'user management',
    'database connection',
    'backend integration',
    'multi-page app',
    'routing system'
  ];
  
  // Check for SIMPLE app indicators (use vanilla HTML/CSS/JS)
  const simpleIndicators = [
    'landing page',
    'portfolio',
    'simple website',
    'static site',
    'contact form',
    'signup form',
    'login form',
    'calculator',
    'counter',
    'todo list',
    'timer',
    'stopwatch',
    'simple game',
    'quiz app',
    'one page',
    'single page site'
  ];
  
  // PRIORITY 1: Check for explicit simple indicators
  const simpleMatches = simpleIndicators.filter(indicator => lowerPrompt.includes(indicator));
  if (simpleMatches.length > 0) {
    console.log('[detectLanguage] Found simple indicators:', simpleMatches);
    return 'html';
  }
  
  // PRIORITY 2: Check for complex indicators (must be explicit)
  const complexMatches = complexIndicators.filter(indicator => lowerPrompt.includes(indicator));
  if (complexMatches.length > 0) {
    console.log('[detectLanguage] Found complex indicators:', complexMatches);
    return 'typescript';
  }
  
  // PRIORITY 3: Default to vanilla HTML for short, simple requests
  // Favor simplicity unless explicitly asked for complexity
  if (lowerPrompt.length < 150) {
    console.log('[detectLanguage] Short prompt - defaulting to vanilla HTML');
    return 'html';
  }
  
  // PRIORITY 4: For longer requests without clear indicators, use TypeScript
  console.log('[detectLanguage] Long/ambiguous prompt - defaulting to TypeScript');
  return 'typescript';
};

export const getLanguagePrompt = (language: string): string => {
  // Check if vanilla HTML/CSS/JS is requested
  if (language === 'html' || language === 'vanilla') {
    // Return the same base prompt but will be interpreted as vanilla HTML
    // The prompt already contains rules for vanilla HTML in code-generation-rules
    return WEBCONTAINER_TYPESCRIPT_TEMPLATE;
  }
  
  // TypeScript/JavaScript for WebContainer
  if (language === 'typescript' || language === 'javascript' || language === 'default') {
    return WEBCONTAINER_TYPESCRIPT_TEMPLATE;
  }
  
  // Fallback to TypeScript
  return WEBCONTAINER_TYPESCRIPT_TEMPLATE;
};
