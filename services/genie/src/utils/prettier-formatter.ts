/**
 * Prettier Formatter Utility
 * Automatically formats code files using Prettier
 * 
 * WHY THIS EXISTS:
 * AI agents sometimes struggle with proper code formatting and line breaks in JSON responses.
 * Instead of forcing the agent to handle complex escaping (\n, \t, etc.), we:
 * 1. Ask the agent to write ALL code on a SINGLE LINE (no line breaks)
 * 2. Use this utility to automatically format the code with Prettier
 * 
 * This approach:
 * - Eliminates JSON escaping issues
 * - Reduces token usage (no formatting overhead in prompts)
 * - Results in perfectly formatted code
 * - Allows the agent to focus on correctness, not formatting
 * 
 * USAGE:
 * const files = await formatCodeFiles([
 *   { path: 'App.tsx', content: 'import React from "react"; export default function App() { return <div>Hello</div>; }' }
 * ]);
 * // Returns formatted code with proper indentation and line breaks
 */

import * as prettier from 'prettier';

interface FileToFormat {
  path: string;
  content: string;
}

/**
 * Format a single code file using Prettier
 * @param filePath - The file path (used to determine parser)
 * @param content - The code content to format (can be on single line)
 * @returns Formatted code with proper indentation and line breaks
 */
export async function formatCodeFile(filePath: string, content: string): Promise<string> {
  try {
    // Determine parser based on file extension
    const parser = getParserFromPath(filePath);
    
    if (!parser) {
      // If we can't determine the parser, return content as-is
      console.warn(`[Prettier] No parser found for ${filePath}, skipping formatting`);
      return content;
    }

    // Format using Prettier
    const formatted = await prettier.format(content, {
      parser,
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      bracketSpacing: true,
      arrowParens: 'always',
      endOfLine: 'lf',
    });

    return formatted;
  } catch (error) {
    console.error(`[Prettier] Failed to format ${filePath}:`, error);
    // Return original content if formatting fails
    return content;
  }
}

/**
 * Format multiple code files using Prettier
 * @param files - Array of files with path and content
 * @returns Array of files with formatted content
 */
export async function formatCodeFiles(files: FileToFormat[]): Promise<FileToFormat[]> {
  console.log(`[Prettier] Formatting ${files.length} files...`);
  
  const formattedFiles = await Promise.all(
    files.map(async (file) => {
      const formatted = await formatCodeFile(file.path, file.content);
      return {
        path: file.path,
        content: formatted,
      };
    })
  );

  console.log(`[Prettier] ✅ Successfully formatted ${formattedFiles.length} files`);
  return formattedFiles;
}

/**
 * Determine Prettier parser from file path
 */
function getParserFromPath(filePath: string): prettier.BuiltInParserName | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'babel';
    
    case 'ts':
    case 'tsx':
      return 'typescript';
    
    case 'json':
      return 'json';
    
    case 'html':
    case 'htm':
      return 'html';
    
    case 'css':
      return 'css';
    
    case 'scss':
      return 'scss';
    
    case 'less':
      return 'less';
    
    case 'md':
    case 'markdown':
      return 'markdown';
    
    case 'yaml':
    case 'yml':
      return 'yaml';
    
    case 'graphql':
    case 'gql':
      return 'graphql';
    
    default:
      return null;
  }
}

/**
 * Check if a file should be formatted
 * Some files like .gitignore, .env, etc. shouldn't be formatted
 */
export function shouldFormatFile(filePath: string): boolean {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';
  
  // Skip these files
  const skipFiles = [
    '.gitignore',
    '.env',
    '.env.example',
    '.dockerignore',
    'procfile',
    'dockerfile',
  ];
  
  if (skipFiles.includes(fileName)) {
    return false;
  }

  // Skip non-code files
  const skipExtensions = [
    '.txt',
    '.log',
    '.lock',
    '.gitkeep',
  ];
  
  const ext = '.' + (filePath.split('.').pop()?.toLowerCase() || '');
  if (skipExtensions.includes(ext)) {
    return false;
  }

  return true;
}
