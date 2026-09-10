/**
 * ADK (Agent Development Kit) Template Variable Escaping Utilities
 * 
 * ADK treats {variable} as template variables that need to be injected from context.
 * User code often contains {variable} syntax (React components, destructuring, etc.)
 * which causes "Context variable not found" errors.
 * 
 * Solution: Escape {variable} → {{variable}} so ADK treats them as literal text.
 */

/**
 * Escape single curly braces to prevent ADK template variable errors
 * 
 * Examples:
 * - {ProductDetailPage} → {{ProductDetailPage}}
 * - {id} → {{id}}
 * - {count} → {{count}}
 * 
 * @param text - Text that may contain {variable} syntax
 * @returns Escaped text safe for ADK
 */
export function escapeAdkTemplateVariables(text: string): string {
  if (!text) return text;
  
  // Escape {identifier} to {{identifier}}
  // Only matches valid JavaScript identifiers: [a-zA-Z_][a-zA-Z0-9_]*
  return text.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, '{{$1}}');
}

/**
 * Escape multiple text strings at once
 * Useful for escaping multiple fields in an object
 * 
 * @param texts - Array of strings to escape
 * @returns Array of escaped strings
 */
export function escapeAdkTemplateVariablesBulk(texts: string[]): string[] {
  return texts.map(escapeAdkTemplateVariables);
}

/**
 * Escape all string values in an object recursively
 * Useful for escaping entire request/response objects
 * 
 * @param obj - Object with string values to escape
 * @returns New object with escaped values
 */
export function escapeAdkTemplateVariablesInObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return escapeAdkTemplateVariables(obj) as any;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => escapeAdkTemplateVariablesInObject(item)) as any;
  }
  
  if (obj && typeof obj === 'object') {
    const escaped: any = {};
    for (const [key, value] of Object.entries(obj)) {
      escaped[key] = escapeAdkTemplateVariablesInObject(value);
    }
    return escaped;
  }
  
  return obj;
}
