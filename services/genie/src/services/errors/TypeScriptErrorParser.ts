/**
 * TypeScript Error Parser
 * Parses TypeScript compiler errors and provides structured information
 * for automatic error fixing
 */

export interface ParsedTSError {
  code: string;           // e.g., "TS2345"
  file: string;           // File path
  line: number;           // Line number
  column: number;         // Column number
  message: string;        // Full error message
  category: TSErrorCategory;
  fixHint: string;        // Suggested fix approach
}

export type TSErrorCategory =
  | 'type_mismatch'
  | 'missing_property'
  | 'undefined_variable'
  | 'wrong_argument_type'
  | 'missing_import'
  | 'type_inference_failed'
  | 'generic_constraint'
  | 'union_intersection'
  | 'other';

export class TypeScriptErrorParser {
  /**
   * Parse TypeScript errors from build logs
   */
  static parseErrors(logs: string): ParsedTSError[] {
    const errors: ParsedTSError[] = [];
    const lines = logs.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match pattern: src/path/file.ts(line,col): error TSxxxx: message
      const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/);
      
      if (match) {
        const [, file, lineNum, colNum, code, message] = match;
        
        // Collect multi-line error message
        let fullMessage = message;
        let j = i + 1;
        while (j < lines.length && lines[j].match(/^\s{2,}/)) {
          fullMessage += '\n' + lines[j];
          j++;
        }
        
        const category = this.categorizeError(code, fullMessage);
        const fixHint = this.getFixHint(code, fullMessage, category);
        
        errors.push({
          code,
          file: file.trim(),
          line: parseInt(lineNum, 10),
          column: parseInt(colNum, 10),
          message: fullMessage.trim(),
          category,
          fixHint
        });
        
        i = j - 1; // Skip already processed lines
      }
    }

    return errors;
  }

  /**
   * Categorize error by code and message
   */
  private static categorizeError(code: string, message: string): TSErrorCategory {
    const msgLower = message.toLowerCase();

    // Type mismatch errors
    if (code === 'TS2345' || msgLower.includes('not assignable to')) {
      return 'type_mismatch';
    }

    // Missing property errors
    if (code === 'TS2339' || msgLower.includes('does not exist on type')) {
      return 'missing_property';
    }

    // Undefined variable errors
    if (code === 'TS2304' || msgLower.includes('cannot find name')) {
      return 'undefined_variable';
    }

    // Wrong argument errors
    if (code === 'TS2554' || code === 'TS2556' || msgLower.includes('expected') && msgLower.includes('arguments')) {
      return 'wrong_argument_type';
    }

    // Import errors
    if (code === 'TS2305' || code === 'TS2307' || msgLower.includes('cannot find module')) {
      return 'missing_import';
    }

    // Type inference errors
    if (code === 'TS7006' || msgLower.includes('implicitly has')) {
      return 'type_inference_failed';
    }

    // Generic constraint errors
    if (code === 'TS2344' || msgLower.includes('does not satisfy the constraint')) {
      return 'generic_constraint';
    }

    // Union/intersection errors
    if (msgLower.includes('union') || msgLower.includes('intersection')) {
      return 'union_intersection';
    }

    return 'other';
  }

  /**
   * Get specific fix hint based on error category
   */
  private static getFixHint(_code: string, message: string, category: TSErrorCategory): string {
    switch (category) {
      case 'type_mismatch':
        return this.getTypeMismatchHint(message);
      
      case 'missing_property':
        return 'Add the missing property to the type definition or check for typos in property names.';
      
      case 'undefined_variable':
        return 'Import the missing variable/type or declare it. Check for typos in the name.';
      
      case 'wrong_argument_type':
        return 'Adjust function call arguments to match the function signature. Check parameter types and count.';
      
      case 'missing_import':
        return 'Add the missing import statement or install the required package.';
      
      case 'type_inference_failed':
        return 'Add explicit type annotations to help TypeScript infer the correct type.';
      
      case 'generic_constraint':
        return 'Ensure the generic type parameter satisfies the constraint. Add necessary properties or extend the correct type.';
      
      case 'union_intersection':
        return 'Use type guards or type assertions to narrow down union types. Ensure all branches are handled.';
      
      default:
        return 'Review the error message carefully and adjust the code accordingly.';
    }
  }

  /**
   * Specific hints for type mismatch errors
   */
  private static getTypeMismatchHint(message: string): string {
    const msgLower = message.toLowerCase();

    // Detect intersection type issues (most common in complex type scenarios)
    if (msgLower.includes('&') && msgLower.includes('is not assignable to')) {
      return `CRITICAL TYPE MISMATCH FIX:
This is an intersection type issue. The variable being assigned has conflicting type requirements.

Solutions:
1. SIMPLIFY THE TYPE: Instead of complex intersections like (A & B), define a single clear type
2. USE TYPE CASTING: Cast to the expected type explicitly: 'as ExpectedType'
3. CREATE AN INTERMEDIATE TYPE: Define a new type that properly combines the needed properties
4. REMOVE CONFLICTING PROPERTIES: Ensure the type doesn't have properties with incompatible types (e.g., value: string & value: number)

Example fix for array push with intersection types:
❌ const arr: (TypeA & {prop?: X})[] = [];
   arr.push(itemOfTypeA); // Error!

✅ const arr: TypeA[] = []; // Simplified
   arr.push(itemOfTypeA); // Works!

OR

✅ arr.push(itemOfTypeA as (TypeA & {prop?: X})); // Explicit cast`;
    }

    if (msgLower.includes('string') && msgLower.includes('number')) {
      return 'Type mismatch between string and number. Convert the value using Number() or String(), or adjust the type definition.';
    }

    if (msgLower.includes('undefined') || msgLower.includes('null')) {
      return 'Add optional chaining (?.) or null checks, or adjust the type to include undefined/null.';
    }

    if (msgLower.includes('array')) {
      return 'Ensure array item types match. Use proper generic types for arrays (e.g., Array<T> or T[]).';
    }

    return 'The types are incompatible. Ensure the assigned value matches the expected type. Consider using type assertions (as Type) if you\'re certain of the type, or refactor the types to be compatible.';
  }

  /**
   * Generate a detailed fix guide for ChatAgent
   */
  static generateFixGuide(errors: ParsedTSError[]): string {
    if (errors.length === 0) {
      return 'No TypeScript errors found in logs.';
    }

    let guide = `🔍 TYPESCRIPT ERROR ANALYSIS (${errors.length} error${errors.length > 1 ? 's' : ''}):\n\n`;

    // Group errors by file
    const errorsByFile = new Map<string, ParsedTSError[]>();
    for (const error of errors) {
      if (!errorsByFile.has(error.file)) {
        errorsByFile.set(error.file, []);
      }
      errorsByFile.get(error.file)!.push(error);
    }

    let errorNum = 1;
    for (const [file, fileErrors] of errorsByFile) {
      guide += `📄 File: ${file}\n`;
      guide += `   ${fileErrors.length} error${fileErrors.length > 1 ? 's' : ''} found\n\n`;

      for (const error of fileErrors) {
        guide += `   ${errorNum}. Line ${error.line}, Col ${error.column} - ${error.code}\n`;
        guide += `      Category: ${error.category}\n`;
        guide += `      Message: ${error.message.split('\n')[0]}\n`;
        guide += `      \n`;
        guide += `      💡 FIX STRATEGY:\n`;
        const fixLines = error.fixHint.split('\n');
        for (const fixLine of fixLines) {
          guide += `      ${fixLine}\n`;
        }
        guide += `\n`;
        errorNum++;
      }
    }

    guide += `\n⚠️ CRITICAL INSTRUCTIONS FOR FIXING:\n`;
    guide += `1. Focus on the EXACT line and column numbers mentioned above\n`;
    guide += `2. Read the full error message including all continuation lines\n`;
    guide += `3. Apply the fix strategy for each error category\n`;
    guide += `4. For type_mismatch errors with intersections, SIMPLIFY the types - don't make them more complex\n`;
    guide += `5. Test that the fix doesn't introduce new errors\n`;
    guide += `6. Return ALL files in the codebase, even if you only modified one file\n`;

    return guide;
  }

  /**
   * Quick check if logs contain TypeScript errors
   */
  static hasTypeScriptErrors(logs: string): boolean {
    return /error TS\d+:/i.test(logs);
  }

  /**
   * Extract just the error codes from logs
   */
  static extractErrorCodes(logs: string): string[] {
    const codes: string[] = [];
    const matches = logs.matchAll(/error (TS\d+):/g);
    for (const match of matches) {
      if (!codes.includes(match[1])) {
        codes.push(match[1]);
      }
    }
    return codes;
  }
}
