/**
 * Prompt Sanitizer - Escape template variables to prevent ADK conflicts
 * ADK uses {variable} syntax for context injection, so we need to escape
 * any curly braces in our prompts that are meant to be literal text
 */

/**
 * Sanitize a prompt string to escape template variables
 * Replaces {variable} with {{variable}} to prevent ADK from treating them as context variables
 */
export function sanitizePrompt(prompt: string): string {
  // Replace single { with {{ and single } with }} 
  // but preserve existing {{ and }} (already escaped)
  
  // First, temporarily replace existing {{ and }} with placeholders
  const temp1 = '___DOUBLE_OPEN___';
  const temp2 = '___DOUBLE_CLOSE___';
  
  let sanitized = prompt
    .replace(/\{\{/g, temp1)
    .replace(/\}\}/g, temp2);
  
  // Now escape all remaining single braces
  sanitized = sanitized
    .replace(/\{/g, '{{')
    .replace(/\}/g, '}}');
  
  // Restore the originally doubled braces (keep them doubled)
  sanitized = sanitized
    .replace(new RegExp(temp1, 'g'), '{{')
    .replace(new RegExp(temp2, 'g'), '}}');
  
  return sanitized;
}

/**
 * Alternative approach: Replace {variable} patterns with safe text
 * This is more conservative and only targets variable-like patterns
 */
export function sanitizeTemplateVariables(prompt: string): string {
  // Replace patterns like {variableName} with VARIABLE_variableName
  // This preserves the meaning while avoiding ADK template processing
  return prompt.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, 'VARIABLE_$1');
}

/**
 * Check if a prompt contains unescaped template variables
 */
export function hasUnescapedTemplateVars(prompt: string): boolean {
  // Look for single { followed by alphanumeric/underscore, followed by single }
  // that isn't part of {{ or }}
  const pattern = /(?<!\{)\{[a-zA-Z_][a-zA-Z0-9_]*\}(?!\})/;
  return pattern.test(prompt);
}

/**
 * Get a list of all potential template variables in a prompt
 */
export function findTemplateVariables(prompt: string): string[] {
  const pattern = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  const matches = [...prompt.matchAll(pattern)];
  return matches.map(m => m[1]);
}
