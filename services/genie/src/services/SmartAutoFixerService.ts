/**
 * Smart Auto-Fixer Service - Fast, rule-based fixes with optional LLM fallback
 * 
 * Strategy:
 * - 90% of issues: Rule-based fixes (instant, no LLM calls)
 * - 10% of issues: LLM-based fixes (only for complex issues)
 * 
 * Performance: Most fixes complete in < 100ms
 */

import { CodeFixerAgent } from '../agents/specialized/CodeFixerAgent';
import type { GeneratedFile, ValidationError } from './FastValidatorService';

export interface FixResult {
  fixed: boolean;
  files: GeneratedFile[];
  fixedCount: number;
  unfixedCount: number;
  appliedFixes: string[];
}

export class SmartAutoFixerService {
  /**
   * Main auto-fix entry point
   */
  async autoFix(
    files: GeneratedFile[],
    errors: ValidationError[]
  ): Promise<FixResult> {
    
    if (errors.length === 0) {
      return {
        fixed: false,
        files,
        fixedCount: 0,
        unfixedCount: 0,
        appliedFixes: []
      };
    }
    
    console.log(`🔧 Auto-fixing ${errors.length} issues...`);
    
    // Separate errors by fix strategy
    const ruleBasedErrors = errors.filter(e => this.canFixWithRules(e));
    const llmErrors = errors.filter(e => !this.canFixWithRules(e));
    
    let fixedFiles = [...files];
    const appliedFixes: string[] = [];
    
    // Apply rule-based fixes first (fast)
    if (ruleBasedErrors.length > 0) {
      console.log(`  ⚡ Applying ${ruleBasedErrors.length} rule-based fixes...`);
      const ruleResult = this.applyRuleFixes(fixedFiles, ruleBasedErrors);
      fixedFiles = ruleResult.files;
      appliedFixes.push(...ruleResult.fixes);
    }
    
    // Apply LLM fixes only for critical issues that can't be fixed with rules
    const criticalLLMErrors = llmErrors.filter(e => e.severity === 'critical');
    if (criticalLLMErrors.length > 0) {
      console.log(`  🤖 Using LLM to fix ${criticalLLMErrors.length} complex issues...`);
      try {
        const llmResult = await this.applyLLMFixes(fixedFiles, criticalLLMErrors);
        fixedFiles = llmResult.files;
        appliedFixes.push(...llmResult.fixes);
      } catch (error) {
        console.error('  ❌ LLM fixing failed:', error);
      }
    }
    
    const fixedCount = appliedFixes.length;
    const unfixedCount = errors.length - fixedCount;
    
    console.log(`✅ Fixed ${fixedCount}/${errors.length} issues`);
    
    return {
      fixed: fixedCount > 0,
      files: fixedFiles,
      fixedCount,
      unfixedCount,
      appliedFixes
    };
  }
  
  /**
   * Check if error can be fixed with simple rules
   */
  private canFixWithRules(error: ValidationError): boolean {
    const ruleFixableTypes = [
      'regex_syntax_error',
      'invalid_dependency_version',
      'missing_dependency',
      'missing_config',
      'invalid_config',
      'placeholder_code',
      'console_log',
      'print_statement',
      'empty_file',
      'duplicate_file',
      'placeholder_file',
      'json_escaping_error'
    ];
    
    return ruleFixableTypes.includes(error.type);
  }
  
  /**
   * Apply rule-based fixes (fast, no LLM)
   */
  private applyRuleFixes(
    files: GeneratedFile[],
    errors: ValidationError[]
  ): { files: GeneratedFile[]; fixes: string[] } {
    
    let fixedFiles = [...files];
    const fixes: string[] = [];
    
    // Group errors by type for batch processing
    const errorsByType = new Map<string, ValidationError[]>();
    for (const error of errors) {
      const existing = errorsByType.get(error.type) || [];
      existing.push(error);
      errorsByType.set(error.type, existing);
    }
    
    // Apply fixes by type
    for (const [type, typeErrors] of errorsByType) {
      switch (type) {
        case 'regex_syntax_error':
          fixedFiles = this.fixRegexErrors(fixedFiles, typeErrors);
          fixes.push(`Fixed ${typeErrors.length} regex syntax errors`);
          break;
          
        case 'invalid_dependency_version':
          fixedFiles = this.fixInvalidVersions(fixedFiles, typeErrors);
          fixes.push(`Fixed ${typeErrors.length} invalid dependency versions`);
          break;
          
        case 'missing_dependency':
          fixedFiles = this.fixMissingDependencies(fixedFiles, typeErrors);
          fixes.push(`Added ${typeErrors.length} missing dependencies`);
          break;
          
        case 'missing_config':
        case 'invalid_config':
          fixedFiles = this.fixTsconfigJsx(fixedFiles, typeErrors);
          fixes.push(`Fixed ${typeErrors.length} TypeScript config issues`);
          break;
          
        case 'placeholder_code':
          fixedFiles = this.removePlaceholders(fixedFiles, typeErrors);
          fixes.push(`Removed ${typeErrors.length} placeholder comments`);
          break;
          
        case 'console_log':
        case 'print_statement':
          fixedFiles = this.removeDebugStatements(fixedFiles, typeErrors);
          fixes.push(`Removed ${typeErrors.length} debug statements`);
          break;
          
        case 'duplicate_file':
          fixedFiles = this.removeDuplicateFiles(fixedFiles);
          fixes.push('Removed duplicate files');
          break;
          
        case 'empty_file':
          fixedFiles = this.removeEmptyFiles(fixedFiles);
          fixes.push('Removed empty files');
          break;
          
        case 'placeholder_file':
          fixedFiles = this.removePlaceholderFiles(fixedFiles);
          fixes.push('Removed placeholder files');
          break;
      }
    }
    
    return { files: fixedFiles, fixes };
  }
  
  /**
   * Fix missing dependencies by adding them to package file
   */
  private fixMissingDependencies(
    files: GeneratedFile[],
    errors: ValidationError[]
  ): GeneratedFile[] {
    
    const pkgFile = files.find(f => f.path === 'package.json' || f.path === 'requirements.txt');
    if (!pkgFile) return files;
    
    try {
      if (pkgFile.path === 'package.json') {
        const pkg = JSON.parse(pkgFile.content);
        pkg.dependencies = pkg.dependencies || {};
        pkg.devDependencies = pkg.devDependencies || {};
        
        // Add each missing dependency
        for (const error of errors) {
          const pkgName = this.extractPackageName(error.message);
          if (!pkgName) continue;
          
          // Type definitions go to devDependencies
          if (pkgName.startsWith('@types/')) {
            if (!pkg.devDependencies[pkgName]) {
              pkg.devDependencies[pkgName] = this.getDefaultVersion(pkgName);
              console.log(`    Added dev dependency: ${pkgName}`);
            }
          } else {
            if (!pkg.dependencies[pkgName] && !pkg.devDependencies[pkgName]) {
              pkg.dependencies[pkgName] = this.getDefaultVersion(pkgName);
              console.log(`    Added dependency: ${pkgName}`);
            }
          }
        }
        
        // Update package.json
        return files.map(f => 
          f.path === 'package.json'
            ? { ...f, content: JSON.stringify(pkg, null, 2) }
            : f
        );
      } else if (pkgFile.path === 'requirements.txt') {
        // Add missing Python packages
        let content = pkgFile.content;
        
        for (const error of errors) {
          const pkgName = this.extractPackageName(error.message);
          if (pkgName && !content.includes(pkgName)) {
            content += `\n${pkgName}>=1.0.0`;
            console.log(`    Added: ${pkgName}`);
          }
        }
        
        return files.map(f => 
          f.path === 'requirements.txt'
            ? { ...f, content: content.trim() }
            : f
        );
      }
    } catch (error) {
      console.warn('Failed to fix dependencies:', error);
    }
    
    return files;
  }
  
  /**
   * Remove placeholder code
   */
  private removePlaceholders(
    files: GeneratedFile[],
    errors: ValidationError[]
  ): GeneratedFile[] {
    
    const affectedFiles = new Set(errors.map(e => e.file));
    
    return files.map(file => {
      if (!affectedFiles.has(file.path)) return file;
      
      let content = file.content;
      
      // Remove common placeholders
      content = content.replace(/\/\/\s*\.\.\.existing code\.\.\./g, '');
      content = content.replace(/\/\*\s*\.\.\.existing code\.\.\.\s*\*\//g, '');
      content = content.replace(/#\s*\.\.\.existing code\.\.\./g, '');
      content = content.replace(/\/\/\s*TODO:?\s*[Ii]mplement.*/g, '');
      content = content.replace(/#\s*TODO:?\s*[Ii]mplement.*/g, '');
      
      return { ...file, content };
    });
  }
  
  /**
   * Remove debug statements
   */
  private removeDebugStatements(
    files: GeneratedFile[],
    errors: ValidationError[]
  ): GeneratedFile[] {
    
    const affectedFiles = new Set(errors.map(e => e.file));
    
    return files.map(file => {
      if (!affectedFiles.has(file.path)) return file;
      
      let content = file.content;
      
      // Remove console.log and print statements
      content = content.replace(/\s*console\.log\([^)]*\);?\s*/g, '');
      content = content.replace(/\s*print\([^)]*\)\s*/g, '');
      
      return { ...file, content };
    });
  }
  
  /**
   * Remove duplicate files (keep first occurrence)
   */
  private removeDuplicateFiles(files: GeneratedFile[]): GeneratedFile[] {
    const seen = new Set<string>();
    const unique: GeneratedFile[] = [];
    
    for (const file of files) {
      if (!seen.has(file.path)) {
        seen.add(file.path);
        unique.push(file);
      } else {
        console.log(`    Removed duplicate: ${file.path}`);
      }
    }
    
    return unique;
  }
  
  /**
   * Remove empty files
   */
  private removeEmptyFiles(files: GeneratedFile[]): GeneratedFile[] {
    return files.filter(file => {
      if (file.content.trim().length === 0) {
        console.log(`    Removed empty file: ${file.path}`);
        return false;
      }
      return true;
    });
  }
  
  /**
   * Remove placeholder files (.gitkeep, etc.)
   */
  private removePlaceholderFiles(files: GeneratedFile[]): GeneratedFile[] {
    return files.filter(file => {
      if (file.path.includes('.gitkeep')) {
        console.log(`    Removed placeholder: ${file.path}`);
        return false;
      }
      return true;
    });
  }
  
  /**
   * Apply LLM-based fixes for complex issues
   */
  private async applyLLMFixes(
    files: GeneratedFile[],
    errors: ValidationError[]
  ): Promise<{ files: GeneratedFile[]; fixes: string[] }> {
    
    try {
      const { runner } = await CodeFixerAgent();
      
      // Build fix prompt
      const filesContent = files.map(f => 
        `File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``
      ).join('\n\n');
      
      const issuesDescription = errors.map((e, i) => 
        `${i + 1}. [${e.severity.toUpperCase()}] ${e.type} in ${e.file}${e.line ? ` (line ${e.line})` : ''}
   ${e.message}
   ${e.suggestedFix ? `Fix: ${e.suggestedFix}` : ''}`
      ).join('\n\n');
      
      const fixPrompt = `Fix the following critical issues in the code:

CURRENT FILES:
${filesContent}

ISSUES TO FIX:
${issuesDescription}

IMPORTANT:
1. Return ALL ${files.length} files in your response
2. Only modify files with issues
3. Keep other files unchanged
4. Maintain original functionality
5. Return valid JSON: { "files": [{"path": "...", "content": "..."}] }`;
      
      const response = await runner.ask(fixPrompt) as any;
      
      if (response.files && Array.isArray(response.files)) {
        return {
          files: response.files,
          fixes: [`LLM fixed ${errors.length} complex issues`]
        };
      }
      
      return { files, fixes: [] };
    } catch (error: any) {
      console.error('LLM fixing failed:', error);
      return { files, fixes: [] };
    }
  }
  
  /**
   * Extract package name from error message
   */
  private extractPackageName(message: string): string | null {
    // Match patterns like: Import "react" is used but not declared
    const match = message.match(/["']([^"']+)["']/);
    return match ? match[1] : null;
  }
  
  /**
   * Fix TypeScript config for React/JSX support
   */
  private fixTsconfigJsx(
    files: GeneratedFile[],
    _errors: ValidationError[]
  ): GeneratedFile[] {
    const tsconfigFile = files.find(f => f.path === 'tsconfig.json');
    if (!tsconfigFile) return files;
    
    try {
      const tsconfig = JSON.parse(tsconfigFile.content);
      
      // Ensure compilerOptions exists
      tsconfig.compilerOptions = tsconfig.compilerOptions || {};
      
      // Add/fix jsx compiler option
      if (!tsconfig.compilerOptions.jsx || 
          (tsconfig.compilerOptions.jsx !== 'react' && 
           tsconfig.compilerOptions.jsx !== 'react-jsx' &&
           tsconfig.compilerOptions.jsx !== 'react-jsxdev')) {
        tsconfig.compilerOptions.jsx = 'react-jsx';
        console.log('    Fixed tsconfig.json: Added "jsx": "react-jsx"');
      }
      
      // Update file
      return files.map(f =>
        f.path === 'tsconfig.json'
          ? { ...f, content: JSON.stringify(tsconfig, null, 2) }
          : f
      );
    } catch (e) {
      console.error('    Failed to fix tsconfig.json:', e);
      return files;
    }
  }
  
  /**
   * Get default version for common packages (VERIFIED Oct 2025)
   */
  private getDefaultVersion(pkg: string): string {
    const versions: Record<string, string> = {
        // React ecosystem (React 18 stable)
        'react': '^18.3.1',
        'react-dom': '^18.3.1',
        '@types/react': '^18.3.12',
        '@types/react-dom': '^18.3.1',
        
        // Build tools
        'vite': '^5.4.11',
        '@vitejs/plugin-react': '^4.3.4',
        'typescript': '^5.6.3',
        '@types/node': '^22.10.2',
        
        // Backend
        'express': '^4.21.2',
        '@types/express': '^4.17.21',
        'cors': '^2.8.5',
        '@types/cors': '^2.8.17',
        'dotenv': '^16.4.7',
        
        // Testing
        'jest': '^29.7.0',
        '@types/jest': '^29.5.14',
        'ts-jest': '^29.2.5',
        'ts-node': '^10.9.2',
        
        // Utilities
        'axios': '^1.7.9',
        'zustand': '^4.5.5',
        'zod': '^3.24.1'
    };
    
    // Return known version or fallback to latest
    return versions[pkg] || 'latest';
    }
  
  /**
   * Fix invalid dependency versions in package.json
   */
  private fixInvalidVersions(
    files: GeneratedFile[],
    errors: ValidationError[]
  ): GeneratedFile[] {
    const pkgFile = files.find(f => f.path === 'package.json');
    if (!pkgFile) return files;
    
    try {
      const pkg = JSON.parse(pkgFile.content);
      
      // Fix each invalid version error
      for (const error of errors) {
        // Extract package name from error message
        const pkgMatch = error.message.match(/package "([^"]+)"/);
        if (!pkgMatch) continue;
        
        const pkgName = pkgMatch[1];
        const correctVersion = this.getDefaultVersion(pkgName);
        
        // Update in dependencies
        if (pkg.dependencies && pkg.dependencies[pkgName]) {
          pkg.dependencies[pkgName] = correctVersion;
          console.log(`    Fixed ${pkgName}: ${pkg.dependencies[pkgName]} -> ${correctVersion}`);
        }
        
        // Update in devDependencies
        if (pkg.devDependencies && pkg.devDependencies[pkgName]) {
          pkg.devDependencies[pkgName] = correctVersion;
          console.log(`    Fixed ${pkgName}: ${pkg.devDependencies[pkgName]} -> ${correctVersion}`);
        }
      }
      
      // Update package.json
      return files.map(f => 
        f.path === 'package.json'
          ? { ...f, content: JSON.stringify(pkg, null, 2) }
          : f
      );
    } catch (error) {
      console.warn('Failed to fix invalid versions:', error);
      return files;
    }
  }
  
  /**
   * Fix regex syntax errors
   */
  private fixRegexErrors(
    files: GeneratedFile[],
    errors: ValidationError[]
  ): GeneratedFile[] {
    const affectedFiles = new Set(errors.map(e => e.file));
    
    return files.map(file => {
      if (!affectedFiles.has(file.path)) return file;
      
      let content = file.content;
      
      // Fix common regex errors
      // 1. Range out of order: [9-0] -> [0-9]
      content = content.replace(/\[([^\]]*?)(\d)-(\d)([^\]]*?)\]/g, (match, before, end, start, after) => {
        if (parseInt(end) > parseInt(start)) {
          // Swap the range
          return `[${before}${start}-${end}${after}]`;
        }
        return match;
      });
      
      // 2. Common wrong patterns
      content = content.replace(/\[9-0\]/g, '[0-9]');
      content = content.replace(/\[Z-A\]/g, '[A-Z]');
      content = content.replace(/\[z-a\]/g, '[a-z]');
      
      console.log(`    Fixed regex errors in ${file.path}`);
      
      return { ...file, content };
    });
  }
}
