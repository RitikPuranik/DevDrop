/**
 * Content Cleaner Utility
 * Post-process content from various sources (AI, GitHub API, etc.)
 * to ensure proper formatting and escaped characters
 * 
 * CRITICAL: This utility should ONLY clean LITERAL escape sequences.
 * Example of literal escape sequence: "Hello\\nWorld" (where \\n is TWO characters: backslash + n)
 * 
 * After JSON.parse(), quotes are already properly unescaped:
 * - JSON: {"content": "<html lang=\"en\">"}
 * - After parse: content = '<html lang="en">' (CORRECT - quotes are real " characters)
 * 
 * We should NOT clean already-proper content. Only clean when AI generates literal text like:
 * - "<!DOCTYPE html>\\n<html>\\n" (literal backslash-n that should be newlines)
 */

export interface FileContent {
  path: string;
  content: string;
}

/**
 * Unescape literal escape sequences in string content
 * Common issue: AI or JSON responses may have \\n instead of actual newlines
 * 
 * @param content - String content with potential escaped characters
 * @returns Cleaned content with actual newlines, tabs, etc.
 */
export function unescapeContent(content: string): string {
  if (typeof content !== 'string') {
    return content;
  }
  
  // Check if content has escaped characters (literal backslash + character)
  // Look for patterns like \n, \t, \" as TWO characters (backslash + n/t/quote)
  if (!content.includes('\\n') && !content.includes('\\t') && !content.includes('\\"') && !content.includes('\\r')) {
    return content; // No escaping needed
  }
  
  // IMPORTANT: Only replace if they are LITERAL escape sequences (backslash + char)
  // Not if they are already properly escaped by JSON (which they shouldn't be in content)
  return content
    .replace(/\\n/g, '\n')      // Unescape newlines: \n -> actual newline
    .replace(/\\t/g, '\t')      // Unescape tabs: \t -> actual tab
    .replace(/\\r/g, '\r')      // Unescape carriage returns: \r -> actual CR
    .replace(/\\"/g, '"')       // Unescape double quotes: \" -> "
    .replace(/\\'/g, "'")       // Unescape single quotes: \' -> '
    .replace(/\\\\/g, '\\');    // Unescape backslashes: \\ -> \ (do this LAST!)
}

/**
 * Clean file content array - unescape all files
 * 
 * @param files - Array of files with potentially escaped content
 * @returns Array of files with cleaned content
 */
export function cleanFiles(files: FileContent[]): FileContent[] {
  return files.map(file => ({
    path: file.path,
    content: unescapeContent(file.content)
  }));
}

/**
 * Normalize line endings to \n (LF) for consistency
 * 
 * @param content - String content with mixed line endings
 * @returns Content with normalized line endings
 */
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Full content cleanup pipeline
 * - Unescape literal escape sequences
 * - Normalize line endings
 * - Trim trailing whitespace from each line (optional)
 * 
 * @param content - Raw content string
 * @param options - Cleanup options
 * @returns Fully cleaned content
 */
export function cleanContent(
  content: string,
  options: {
    trimLines?: boolean;
    normalizeLineEndings?: boolean;
  } = {}
): string {
  const {
    trimLines = false,
    normalizeLineEndings: shouldNormalize = true
  } = options;
  
  let cleaned = unescapeContent(content);
  
  if (shouldNormalize) {
    cleaned = normalizeLineEndings(cleaned);
  }
  
  if (trimLines) {
    cleaned = cleaned
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n');
  }
  
  return cleaned;
}

/**
 * Detect if content has LITERAL escaped characters that need cleaning
 * This checks if the content has TWO-character escape sequences like \n (backslash + n)
 * NOT already properly escaped characters
 * 
 * @param content - String content to check
 * @returns True if content has LITERAL escaped characters
 */
export function hasEscapedCharacters(content: string): boolean {
  if (typeof content !== 'string') {
    return false;
  }
  
  // Only detect literal escape sequences: actual backslash followed by n/t/r/"
  // If the string came from JSON.parse, quotes are already unescaped
  // We only want to catch cases where AI generated literal \n text
  
  // Check for literal \n that looks like it should be a newline
  // Pattern: if we see \n but it's NOT in a context that suggests it's intentional
  // (like in a regex or string literal in code)
  
  // Simple heuristic: if we have \n followed by more \n on the same "line" (no actual newline),
  // it's likely literal escaped text that should be unescaped
  const hasLiteralNewlines = /\\n.*\\n/.test(content) && !content.includes('\n');
  const hasLiteralTabs = content.includes('\\t');
  const hasLiteralQuotes = content.includes('\\"');
  const hasLiteralReturns = content.includes('\\r');
  
  return hasLiteralNewlines || hasLiteralTabs || hasLiteralQuotes || hasLiteralReturns;
}

/**
 * Debug helper to inspect content for escape sequence issues
 * 
 * @param content - String content to inspect
 * @param label - Optional label for logging
 */
export function debugContentEscaping(content: string, label: string = 'Content'): void {
  console.log(`\n[ContentCleaner Debug] ${label}:`);
  console.log(`- Length: ${content.length} chars`);
  console.log(`- Has literal \\n: ${content.includes('\\n')}`);
  console.log(`- Has real newlines: ${content.includes('\n')}`);
  console.log(`- Has literal \\": ${content.includes('\\"')}`);
  console.log(`- Has real quotes: ${content.includes('"')}`);
  console.log(`- First 100 chars: ${content.substring(0, 100)}`);
  console.log(`- Needs cleaning: ${hasEscapedCharacters(content)}`);
}
