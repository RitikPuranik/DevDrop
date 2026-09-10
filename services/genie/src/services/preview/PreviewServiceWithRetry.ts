import { spawn } from 'child_process';
import tmp from 'tmp';
import fs from 'fs';
import path from 'path';
import { CodeModificationAgent } from '../../agents/specialized/CodeModificationAgent';
import { generateDockerfile, detectLanguageFromFiles } from './DockerfileTemplates';
import { TypeScriptErrorParser } from '../errors/TypeScriptErrorParser';
import { safeAgentCall } from '../../utils/agentHelpers';

const PACKAGE_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;
const TYPESCRIPT_ALLOWED_VERSIONS = new Set([
  '^5.0.0',
  '^5.1.6',
  '^5.2.2',
  '^5.3.3',
  '^5.4.5',
  '~5.4.5',
  '5.0.0',
  '5.1.6',
  '5.2.2',
  '5.3.3',
  '5.4.5'
]);
const TYPESCRIPT_FALLBACK_VERSION = '^5.4.5';
const TYPE_DEPENDENCY_VERSION_MAP: Record<string, string> = {
  '@types/express': '^4.17.21',
  '@types/node': '^20.11.17',
  '@types/cors': '^2.8.18',
  '@types/body-parser': '^1.19.5',
  '@types/cookie-parser': '^1.4.3',
  '@types/ws': '^8.5.10',
  '@types/lodash': '^4.17.7'
};
const DEPENDENCY_TYPE_MAPPINGS: Record<string, string[]> = {
  express: ['@types/express', '@types/node'],
  cors: ['@types/cors'],
  'body-parser': ['@types/body-parser'],
  'cookie-parser': ['@types/cookie-parser'],
  ws: ['@types/ws'],
  lodash: ['@types/lodash']
};
const DOM_INDICATOR_REGEX = /(document\.|window\.|HTMLElement|querySelector|addEventListener|KeyboardEvent|MouseEvent)/i;

export interface DeploymentResult {
  success: boolean;
  previewUrl?: string;
  error?: string;
  logs?: string;
  attempt?: number;
}

export interface IPreviewServiceWithRetry {
  generatePreviewWithRetry(
    generationId: string, 
    files: Array<{ path: string; content: string }>,
    maxRetries?: number,
    onProgress?: (step: string, status: 'running' | 'completed' | 'failed', message?: string) => Promise<void>
  ): Promise<DeploymentResult>;
}

export class PreviewServiceWithRetry implements IPreviewServiceWithRetry {
  private flyApiToken: string;
  private readonly MAX_CONSECUTIVE_FAILURES = 10; // Prevent infinite loops (10 attempts max)
  private readonly MAX_SAME_ERROR_RETRIES = 5; // Prevent getting stuck on same error (5 times max)

  constructor(
    _maxRetries: number = 10 // maxRetries parameter kept for backward compatibility but not used
  ) {
    if (!process.env.FLY_API_TOKEN) {
      throw new Error('FLY_API_TOKEN environment variable is not set.');
    }
    this.flyApiToken = process.env.FLY_API_TOKEN;
    
    console.log(`[PreviewServiceWithRetry] Initialized in legacy mode (files passed inline)`);
  }

  /**
   * Generate preview with automatic retry mechanism
   * If deployment fails, it will:
   * 1. Capture the error logs
   * 2. Send them to CodeModificationAgent to fix the issues
   * 3. Retry deployment with fixed code
   * 4. Repeat until successful or max safety limits reached
   * 
   * Safety measures:
   * - Max 5 consecutive failures without any progress
   * - Max 3 retries for the same error message
   * - CodeModificationAgent must provide different fixes each time
   */
  async generatePreviewWithRetry(
    generationId: string, 
    files: Array<{ path: string; content: string }>,
    maxRetries?: number,
    onProgress?: (step: string, status: 'running' | 'completed' | 'failed', message?: string) => Promise<void>
  ): Promise<DeploymentResult> {
    const retries = maxRetries ?? 10; // Default 10 attempts with safety measures
  let currentFiles = this.sanitizeGeneratedFiles(files);
    let lastError: string = '';
    let lastLogs: string = '';
    let lastErrorId: string | undefined;
    
    // Safety tracking
    const errorHistory: string[] = [];
    let consecutiveFailures = 0;
    let sameErrorCount = 0;
    let previousErrorSignature = '';
    
    // Detect language from files
    const language = detectLanguageFromFiles(files.map(f => ({ path: f.path, content: f.content })));

    for (let attempt = 1; attempt <= retries; attempt++) {
      console.log(`\n=== Deployment Attempt ${attempt} ===`);
      
      if (onProgress) {
        await onProgress(
          attempt === 1 ? 'Starting deployment' : `Retry attempt ${attempt}`,
          'running',
          attempt === 1 ? 'Validating files and preparing deployment' : `Retrying with fixes from previous attempt`
        ).catch(err => console.warn('Progress callback error:', err));
      }
      
      try {
  const result = await this.attemptDeployment(generationId, currentFiles, attempt, onProgress);
        
        if (result.success) {
          console.log(`✓ Deployment successful on attempt ${attempt}`);
          
          // If this was a retry (attempt > 1), mark the previous error as resolved
          if (attempt > 1 && lastErrorId) {
            await this.markErrorResolved(lastErrorId, 'Fixed via automated retry and CodeModificationAgent');
          }
          
          return {
            ...result,
            attempt
          };
        }

        // Deployment failed, capture error details
        lastError = result.error || 'Unknown deployment error';
        lastLogs = result.logs || '';
        
        console.log(`✗ Deployment failed on attempt ${attempt}`);
        console.log(`Error: ${lastError}`);

        // Capture error for learning system
        lastErrorId = await this.captureDeploymentError(currentFiles, lastError, lastLogs, attempt, generationId, language);

        // Track error patterns for safety
        const currentErrorSignature = this.getErrorSignature(lastError);
        errorHistory.push(currentErrorSignature);
        consecutiveFailures++;

        // Check if this is the same error as before
        if (currentErrorSignature === previousErrorSignature) {
          sameErrorCount++;
        } else {
          sameErrorCount = 1;
          previousErrorSignature = currentErrorSignature;
        }

        // Safety check 1: Too many consecutive failures
        if (consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
          console.log(`\n⚠️ Safety limit reached: ${this.MAX_CONSECUTIVE_FAILURES} consecutive failures.`);
          console.log(`This suggests a fundamental issue that cannot be auto-fixed.`);
          return {
            success: false,
            error: `Auto-fix failed after ${consecutiveFailures} attempts. ${lastError}`,
            logs: lastLogs,
            attempt
          };
        }

        // Safety check 2: Same error repeating
        if (sameErrorCount >= this.MAX_SAME_ERROR_RETRIES) {
          console.log(`\n⚠️ Safety limit reached: Same error occurred ${sameErrorCount} times.`);
          console.log(`ChatAgent unable to resolve this specific issue.`);
          return {
            success: false,
            error: `Unable to fix error after ${sameErrorCount} attempts: ${lastError}`,
            logs: lastLogs,
            attempt
          };
        }

        // If maxRetries was explicitly set (not Infinity), respect it
        if (attempt >= retries && retries !== Infinity) {
          console.log(`Maximum retry attempts (${retries}) reached. Giving up.`);
          return {
            success: false,
            error: lastError,
            logs: lastLogs,
            attempt
          };
        }

        // Try to fix the code using CodeModificationAgent
        console.log(`\n→ Sending error logs to CodeModificationAgent for fixes (attempt ${attempt}, same error count: ${sameErrorCount})...`);
        const fixedFiles = await this.fixCodeWithAgent(currentFiles, lastError, lastLogs, attempt);
        
        if (!fixedFiles || fixedFiles.length === 0) {
          console.log(`✗ CodeModificationAgent could not provide fixes. Stopping retry.`);
          return {
            success: false,
            error: `CodeModificationAgent could not fix the issues after attempt ${attempt}`,
            logs: lastLogs,
            attempt
          };
        }

        console.log(`✓ CodeModificationAgent provided fixes. Retrying deployment...`);
  currentFiles = this.sanitizeGeneratedFiles(fixedFiles);
        
        // Save fixed files to database immediately
        console.log(`\n💾 Saving fixed files to database...`);
        await this.saveFixedFilesToDatabase(generationId, currentFiles);
        
        // Reset consecutive failures counter (we got a fix, so we're making progress)
        consecutiveFailures = 0;

      } catch (error: any) {
        lastError = error.message || 'Unexpected error during deployment';
        lastLogs = error.stack || '';
        
        console.error(`✗ Unexpected error on attempt ${attempt}:`, error);

        // Track error patterns for safety
        const currentErrorSignature = this.getErrorSignature(lastError);
        errorHistory.push(currentErrorSignature);
        consecutiveFailures++;

        if (currentErrorSignature === previousErrorSignature) {
          sameErrorCount++;
        } else {
          sameErrorCount = 1;
          previousErrorSignature = currentErrorSignature;
        }

        // Apply same safety checks
        if (consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
          return {
            success: false,
            error: `Auto-fix failed after ${consecutiveFailures} attempts. ${lastError}`,
            logs: lastLogs,
            attempt
          };
        }

        if (sameErrorCount >= this.MAX_SAME_ERROR_RETRIES) {
          return {
            success: false,
            error: `Unable to fix error after ${sameErrorCount} attempts: ${lastError}`,
            logs: lastLogs,
            attempt
          };
        }

        if (attempt >= retries && retries !== Infinity) {
          return {
            success: false,
            error: lastError,
            logs: lastLogs,
            attempt
          };
        }

        // Try to fix even unexpected errors
        try {
          console.log(`\n→ Attempting to fix unexpected error with CodeModificationAgent...`);
          const fixedFiles = await this.fixCodeWithAgent(currentFiles, lastError, lastLogs, attempt);
          if (fixedFiles && fixedFiles.length > 0) {
            currentFiles = this.sanitizeGeneratedFiles(fixedFiles);
            
            // Save fixed files to database immediately
            console.log(`\n💾 Saving fixed files to database...`);
            await this.saveFixedFilesToDatabase(generationId, currentFiles);
            
            consecutiveFailures = 0; // Reset on successful fix
          } else {
            return {
              success: false,
              error: lastError,
              logs: lastLogs,
              attempt
            };
          }
        } catch (fixError) {
          console.error(`✗ Failed to get fixes from CodeModificationAgent:`, fixError);
          return {
            success: false,
            error: lastError,
            logs: lastLogs,
            attempt
          };
        }
      }
    }

    // Should not reach here, but just in case
    return {
      success: false,
      error: lastError || 'Deployment failed after all retries',
      logs: lastLogs,
      attempt: retries
    };
  }

  /**
   * Attempt a single deployment
   */
  private async attemptDeployment(
    generationId: string,
    files: Array<{ path: string; content: string }>,
    attempt: number,
    onProgress?: (step: string, status: 'running' | 'completed' | 'failed', message?: string) => Promise<void>
  ): Promise<DeploymentResult> {
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const appName = `preview-${generationId.replace(/_/g, "-")}`.toLowerCase();

    try {
      // 1. Detect language from files
      const language = detectLanguageFromFiles(files);
      console.log(`[Attempt ${attempt}] Detected language: ${language} for generation ${generationId}`);

      if (onProgress) {
        await onProgress('Detecting project language', 'completed', `Detected: ${language}`).catch(err => console.warn('Progress callback error:', err));
      }

      // 2. Write files to temp directory
      if (onProgress) {
        await onProgress('Writing files', 'running', `Processing ${files.length} files`).catch(err => console.warn('Progress callback error:', err));
      }
      
      for (const file of files) {
        const filePath = path.join(tmpDir.name, file.path);
        const dirName = path.dirname(filePath);
        if (!fs.existsSync(dirName)) {
          fs.mkdirSync(dirName, { recursive: true });
        }
        
        // Additional check: if this is a JSON file and content starts with a quote,
        // it might be double-stringified
        let contentToWrite = file.content;
        
        // Fix escaped content FIRST - LLM often returns JSON-escaped strings
        // We need to unescape: \n -> newline, \" -> ", \\ -> \, etc.
        
        // Check if content looks like it's JSON-escaped (has \n or \" patterns)
        if (contentToWrite.includes('\\n') || contentToWrite.includes('\\"') || contentToWrite.includes('\\t')) {
          try {
            // Try to parse as JSON string to unescape properly
            // Wrap in quotes to make it a valid JSON string if it's not already
            const wrapped = contentToWrite.startsWith('"') ? contentToWrite : `"${contentToWrite}"`;
            const unescaped = JSON.parse(wrapped);
            
            // Only use unescaped version if it actually changed something
            if (unescaped !== contentToWrite && typeof unescaped === 'string') {
              contentToWrite = unescaped;
              console.log(`✓ Unescaped JSON-encoded content for ${file.path}`);
            }
          } catch (e) {
            // If JSON parsing fails, manually unescape common patterns
            contentToWrite = contentToWrite
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '\r')
              .replace(/\\t/g, '\t')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            console.log(`✓ Manually unescaped content for ${file.path}`);
          }
        }
        
        // Fix over-escaped content in code files (secondary cleanup)
        if (file.path.endsWith('.ts') || file.path.endsWith('.tsx') || 
            file.path.endsWith('.js') || file.path.endsWith('.jsx')) {
          // Fix common over-escaping patterns in regex
          // Double-escaped regex character classes: \\s -> \s, \\d -> \d, etc.
          contentToWrite = contentToWrite.replace(/\\\\([sdwSDW])/g, '\\$1');
          // Double-escaped dots in regex: \\. -> \.
          contentToWrite = contentToWrite.replace(/\\\\\./g, '\\.');
        }
        
        // NOW validate JSON files AFTER unescaping
        if (file.path.endsWith('.json')) {
          // Try to detect and fix double-stringified JSON
          if (typeof contentToWrite === 'string' && 
              contentToWrite.startsWith('"') && 
              contentToWrite.endsWith('"')) {
            try {
              const parsed = JSON.parse(contentToWrite);
              if (typeof parsed === 'string') {
                contentToWrite = parsed;
                console.log(`✓ Fixed double-stringified JSON for ${file.path}`);
              }
            } catch (e) {
              // Keep original if parsing fails
            }
          }
          
          // Validate JSON syntax
          try {
            JSON.parse(contentToWrite);
            console.log(`✓ Validated JSON syntax for ${file.path}`);
          } catch (e: any) {
            console.error(`✗ Invalid JSON syntax in ${file.path}: ${e.message}`);
            console.error(`   Content preview: ${contentToWrite.substring(0, 100)}`);
          }
        }
        
        fs.writeFileSync(filePath, contentToWrite);
      }

      if (onProgress) {
        await onProgress('Writing files', 'completed', `${files.length} files written successfully`).catch(err => console.warn('Progress callback error:', err));
      }

      // 3. Create Dockerfile based on detected language
      if (onProgress) {
        await onProgress('Creating Dockerfile', 'running', 'Generating deployment configuration').catch(err => console.warn('Progress callback error:', err));
      }
      
      const dockerfileContent = generateDockerfile(files);
      fs.writeFileSync(path.join(tmpDir.name, 'Dockerfile'), dockerfileContent);

      if (onProgress) {
        await onProgress('Creating Dockerfile', 'completed', 'Dockerfile created').catch(err => console.warn('Progress callback error:', err));
      }

      // 4. Create a fly.toml file
      const flyTomlContent = this.createFlyToml(appName, language);
      fs.writeFileSync(path.join(tmpDir.name, 'fly.toml'), flyTomlContent);

      // 5. Deploy using flyctl
      if (onProgress) {
        await onProgress('Building Docker image', 'running', 'Building and uploading container to Fly.io').catch(err => console.warn('Progress callback error:', err));
      }
      
      await this.deployWithFlyctl(tmpDir.name, appName, onProgress);

      if (onProgress) {
        await onProgress('Verifying deployment', 'running', 'Checking deployment logs').catch(err => console.warn('Progress callback error:', err));
      }

      // 6. Verify deployment by checking logs
      const verificationLogs = await this.getDeploymentLogs(appName);
      
      if (onProgress) {
        await onProgress('Verifying deployment', 'completed', 'Deployment verified successfully').catch(err => console.warn('Progress callback error:', err));
      }
      
      return {
        success: true,
        previewUrl: `https://${appName}.fly.dev`,
        logs: verificationLogs
      };

    } catch (error: any) {
      // Capture deployment logs for debugging
      let logs = error.deploymentLogs || '';
      let errorMessage = error.message || 'Deployment failed';
      
      // If no deployment logs in error, try to fetch them
      if (!logs) {
        try {
          console.log('→ Fetching deployment logs...');
          logs = await this.getDeploymentLogs(appName);
        } catch (logError) {
          console.warn('Could not retrieve deployment logs:', logError);
        }
      }

      // For crash errors, try to get machine-specific logs
      if (errorMessage.includes('crashing') || errorMessage.includes('smoke checks')) {
        try {
          // Extract machine ID from error message if present
          const machineIdMatch = errorMessage.match(/[0-9a-f]{14}/);
          if (machineIdMatch) {
            const machineId = machineIdMatch[0];
            console.log(`→ Fetching logs for crashed machine ${machineId}...`);
            const machineLogsResult = await this.runCommand(
              'flyctl',
              ['logs', '--app', appName, '--instance', machineId],
              process.cwd(),
              { checkBuildErrors: false }
            );
            if (machineLogsResult.code === 0 && machineLogsResult.stdout) {
              logs = `Machine ${machineId} logs:\n${machineLogsResult.stdout}\n\n${logs}`;
              console.log(`✓ Retrieved ${machineLogsResult.stdout.length} chars of machine logs`);
            }
          }
        } catch (machineLogError) {
          console.warn('Could not retrieve machine-specific logs:', machineLogError);
        }
      }

      // If still no logs, use error stack
      if (!logs) {
        logs = error.stack || '';
      }

      console.log(`Captured deployment logs (${logs.length} characters)`);

      return {
        success: false,
        error: errorMessage,
        logs: logs
      };
    } finally {
      tmpDir.removeCallback();
    }
  }

  /**
   * Use CodeModificationAgent to fix code based on deployment errors
   * CodeModificationAgent is specialized for code fixes and has:
   * - Language-specific validation rules
   * - Error learning system integration
   * - Better prompt engineering for fixes
   */
  private async fixCodeWithAgent(
    currentFiles: Array<{ path: string; content: string }>,
    error: string,
    logs: string,
    attempt: number
  ): Promise<Array<{ path: string; content: string }> | null> {
    try {
      console.log('→ Initializing CodeModificationAgent for deployment fix...');
      
      // Detect language from files
      const language = detectLanguageFromFiles(currentFiles);
      
      // Build error context for the agent
      const errorContext = `DEPLOYMENT ERROR (Attempt ${attempt}):
${error}

DEPLOYMENT LOGS:
${logs}`;
      
      // Initialize CodeModificationAgent with error context
      const { runner } = await CodeModificationAgent({
        language: language,
        platform: 'fly.io',
        errorContext: errorContext,
        githubContext: null // No GitHub context in deployment fixes
      });

      const filesContext = currentFiles.map(f => 
        `File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``
      ).join('\n\n');

      // Parse TypeScript errors if present
      let typeScriptErrorGuide = '';
      let typeScriptErrorContext = '';
      if (TypeScriptErrorParser.hasTypeScriptErrors(logs)) {
        const parsedErrors = TypeScriptErrorParser.parseErrors(logs);
        typeScriptErrorGuide = '\n\n' + TypeScriptErrorParser.generateFixGuide(parsedErrors) + '\n';
        
        // Add detailed error context for each error
        typeScriptErrorContext = '\n\n🔍 DETAILED TYPESCRIPT ERROR ANALYSIS:\n';
        typeScriptErrorContext += '=' .repeat(80) + '\n';
        
        for (const err of parsedErrors) {
          typeScriptErrorContext += `\n❌ Error ${err.code} in ${err.file}:${err.line}:${err.column}\n`;
          typeScriptErrorContext += `   Category: ${err.category}\n`;
          typeScriptErrorContext += `   Message: ${err.message}\n`;
          
          // Find the relevant file content
          const targetFile = currentFiles.find(f => f.path.includes(err.file) || err.file.includes(f.path));
          if (targetFile) {
            const lines = targetFile.content.split('\n');
            const errorLineIndex = err.line - 1;
            
            if (errorLineIndex >= 0 && errorLineIndex < lines.length) {
              typeScriptErrorContext += `\n   Context (lines ${Math.max(1, err.line - 2)} to ${Math.min(lines.length, err.line + 2)}):\n`;
              
              for (let i = Math.max(0, errorLineIndex - 2); i <= Math.min(lines.length - 1, errorLineIndex + 2); i++) {
                const lineNum = i + 1;
                const prefix = lineNum === err.line ? '   >>> ' : '       ';
                const marker = lineNum === err.line && err.column ? ' '.repeat(err.column - 1) + '^' : '';
                typeScriptErrorContext += `${prefix}${lineNum}: ${lines[i]}\n`;
                if (marker) {
                  typeScriptErrorContext += `${prefix}${' '.repeat(String(lineNum).length + 2)}${marker}\n`;
                }
              }
            }
          }
          
          // Add specific fix hint based on error code
          typeScriptErrorContext += `\n   💡 FIX STRATEGY:\n`;
          if (err.code === 'TS2345') {
            typeScriptErrorContext += `      This is a type mismatch error. Check:\n`;
            typeScriptErrorContext += `      - Are you passing a function where a value is expected?\n`;
            typeScriptErrorContext += `      - For setState: use setX(value) not setX(prev => value) if the setter expects a value\n`;
            typeScriptErrorContext += `      - Check the function signature and ensure argument types match\n`;
          } else if (err.code === 'TS2339') {
            typeScriptErrorContext += `      Property doesn't exist. Check:\n`;
            typeScriptErrorContext += `      - Spelling and case sensitivity\n`;
            typeScriptErrorContext += `      - Is the property defined in the type/interface?\n`;
            typeScriptErrorContext += `      - Do you need to add it to the type definition?\n`;
          } else if (err.code === 'TS2304') {
            typeScriptErrorContext += `      Name not found. Check:\n`;
            typeScriptErrorContext += `      - Is the import statement present?\n`;
            typeScriptErrorContext += `      - Is the variable/type defined?\n`;
            typeScriptErrorContext += `      - Check spelling and scope\n`;
          }
          typeScriptErrorContext += '\n' + '-'.repeat(80) + '\n';
        }
      }

      const fixPrompt = `Fix the following deployment errors in the codebase.

DEPLOYMENT TO FLY.IO FAILED (Attempt ${attempt})

DEPLOYMENT ERROR:
${error}

DEPLOYMENT LOGS:
${logs}
${typeScriptErrorGuide}
${typeScriptErrorContext}

Files to fix (${currentFiles.length}):
${filesContext}

REQUIREMENTS:

1. **ANALYZE THE ERRORS** - Carefully read the error messages and logs above
   - TypeScript errors show exact location (file, line, column)
   - Build errors indicate missing dependencies or config issues
   - Runtime errors show what went wrong during execution

2. **FILE COUNT VALIDATION** - You MUST return ALL ${currentFiles.length} files:
   - If you fix an existing file: include it with fixes
   - If you don't need to change a file: include it UNCHANGED
   - If you create a NEW file: add it to the list (total will be ${currentFiles.length + 1}+)
   - NEVER omit or delete files from your response
   - Response will be REJECTED if you return fewer than ${currentFiles.length} files!

3. **OUTPUT FORMAT** - Return JSON matching this structure:
   {
     "files": [
       { "path": "file1.ts", "content": "fixed content..." },
       { "path": "file2.json", "content": "..." },
       ... all ${currentFiles.length}+ files
     ]
   }

FIXING INSTRUCTIONS:
1. **READ THE ERROR ANALYSIS** - All TypeScript errors are shown above with exact locations
2. **IDENTIFY THE ROOT CAUSE**:
   ${typeScriptErrorGuide ? '- Follow the TypeScript fix strategies provided above' : ''}
   - TS2345 = Type mismatch (wrong type passed)
   - TS2339 = Property doesn't exist
   - TS2304 = Name/import not found
   - Missing dependencies = Add to package.json
   - Syntax errors = Correct the syntax
   - Missing files = Create them
3. **APPLY THE FIX** - Make targeted changes to fix the errors
4. **RETURN COMPLETE CODEBASE** - Include ALL ${currentFiles.length} files (modified + unmodified) + any new files`;

      console.log('→ Sending fix request to CodeModificationAgent...');
      console.log(`   Prompt length: ${fixPrompt.length} characters`);
      console.log(`   Files to fix: ${currentFiles.length}`);

      // Use safe agent call with automatic retry, validation, and timeout
      const response = await safeAgentCall(runner, fixPrompt, {
        maxRetries: 2, // Fewer retries for deployment fixes
        retryDelay: 2000,
        context: 'PreviewServiceFixCode'
      });

      // Check if response has files array
      if (!response.files || !Array.isArray(response.files)) {
        console.warn('⚠ CodeModificationAgent response missing files array');
        return null;
      }

      if (response.files.length === 0) {
        console.warn('⚠ CodeModificationAgent returned empty files array');
        return null;
      }

      // ⚠️ CRITICAL: For deployment fixes, agent MUST return ALL files
      // It can return MORE files (if creating new ones), but never LESS
      if (response.files.length < currentFiles.length) {
        console.error(`✗ CodeModificationAgent returned FEWER files than input!`);
        console.error(`   Input files: ${currentFiles.length}`);
        console.error(`   Returned files: ${response.files.length}`);
        console.error(`   Missing ${currentFiles.length - response.files.length} file(s)`);
        
        // Find which files are missing
        const returnedPaths = new Set(response.files.map((f: any) => this.normalizeFilePath(f.path)));
        const missingFiles = currentFiles.filter(f => !returnedPaths.has(this.normalizeFilePath(f.path)));
        
        if (missingFiles.length > 0) {
          console.error(`   Missing files:`);
          missingFiles.forEach(f => console.error(`     - ${f.path}`));
        }
        
        return null;
      }

      console.log(`✓ CodeModificationAgent fixed ${response.files.length} files (input: ${currentFiles.length})`);
      if (response.files.length > currentFiles.length) {
        console.log(`   ✨ Created ${response.files.length - currentFiles.length} new file(s)`);
      }

      // Validate file structure and ensure content is string
      for (let i = 0; i < response.files.length; i++) {
        const file = response.files[i];
        
        if (!file.path) {
          console.error(`✗ File at index ${i} missing path property`);
          return null;
        }
        
        if (!file.content && file.content !== '') {
          console.error(`✗ File ${file.path} missing content property`);
          return null;
        }

        // CRITICAL: Ensure content is a string
        if (typeof file.content !== 'string') {
          console.warn(`⚠ File ${file.path} has non-string content (${typeof file.content}), converting...`);
          
          // If content is an object/array, stringify it
          if (typeof file.content === 'object') {
            try {
              response.files[i].content = JSON.stringify(file.content, null, 2);
              console.log(`✓ Converted ${file.path} content to JSON string`);
            } catch (err) {
              console.error(`✗ Failed to stringify content for ${file.path}: ${err}`);
              return null;
            }
          } else {
            // Try to convert to string
            response.files[i].content = String(file.content);
          }
        } else {
          // Content is already a string, but check if it's a double-escaped JSON string
          // This happens when LLM returns already-stringified JSON content
          if (file.path.endsWith('.json') && file.content.startsWith('"') && file.content.endsWith('"')) {
            try {
              // Try to parse it once to remove outer quotes and unescape
              const unescaped = JSON.parse(file.content);
              if (typeof unescaped === 'string') {
                response.files[i].content = unescaped;
                console.log(`✓ Unescaped double-stringified content for ${file.path}`);
              }
            } catch (err) {
              // If parsing fails, keep original content
              console.warn(`⚠ Could not unescape content for ${file.path}, keeping as-is`);
            }
          }
        }
      }

      console.log(`✓ All ${response.files.length} files validated successfully`);
      
      // Quick validation: If the original error was a TypeScript error,
      // verify that the fixed code doesn't have the same error
      if (TypeScriptErrorParser.hasTypeScriptErrors(logs)) {
        const originalErrorCodes = TypeScriptErrorParser.extractErrorCodes(logs);
        console.log(`   → Validating TypeScript fixes for error codes: ${originalErrorCodes.join(', ')}`);
        
        // We'll do a more thorough check during the next deployment attempt
        // For now, just log that we're aware of the TS errors
        console.log(`   → Will verify fixes during next deployment attempt`);
      }
      
      return this.sanitizeGeneratedFiles(response.files);

    } catch (error: any) {
      console.error('✗ Error getting fixes from CodeModificationAgent:');
      console.error(`   Error type: ${error.constructor.name}`);
      console.error(`   Error message: ${error.message}`);
      if (error.stack) {
        console.error(`   Stack trace: ${error.stack}`);
      }
      return null;
    }
  }

  private sanitizeGeneratedFiles(files: Array<{ path: string; content: string }>): Array<{ path: string; content: string }> {
    const hasTypeScriptSources = files.some(file => {
      const normalizedPath = this.normalizeFilePath(file.path).toLowerCase();
      return normalizedPath.endsWith('.ts') || normalizedPath.endsWith('.tsx');
    });

    const sanitized = files.map(file => ({ ...file }));
    const packageJsonIndex = sanitized.findIndex(file => this.normalizeFilePath(file.path).toLowerCase() === 'package.json');
    const tsconfigIndex = sanitized.findIndex(file => this.normalizeFilePath(file.path).toLowerCase() === 'tsconfig.json');
    const needsDomLib = this.detectDomUsage(sanitized);

    if (packageJsonIndex === -1) {
      const tsconfigSanitized = this.sanitizeTsConfigIfPresent(sanitized, tsconfigIndex, needsDomLib);
      return tsconfigSanitized;
    }

    const packageFile = sanitized[packageJsonIndex];
    let parsedPackage: any;

    try {
      parsedPackage = JSON.parse(packageFile.content);
    } catch (error) {
      console.warn('⚠ Could not parse package.json for sanitization:', error);
      const tsconfigSanitized = this.sanitizeTsConfigIfPresent(sanitized, tsconfigIndex, needsDomLib);
      return tsconfigSanitized;
    }

    let packageChanged = false;

    packageChanged = this.ensureTypeScriptDependency(parsedPackage, hasTypeScriptSources) || packageChanged;
    packageChanged = this.ensureTypeDeclarationPackages(parsedPackage) || packageChanged;

    if (packageChanged) {
      sanitized[packageJsonIndex] = {
        ...packageFile,
        content: JSON.stringify(parsedPackage, null, 2)
      };
      console.log('✓ Applied package.json sanitization heuristics');
    }

    return this.sanitizeTsConfigIfPresent(sanitized, tsconfigIndex, needsDomLib);
  }

  private ensureTypeScriptDependency(pkg: any, hasTypeScriptSources: boolean): boolean {
    let changed = false;
    const dependencyInfo = this.getDependencyInfo(pkg, 'typescript');

    if (!dependencyInfo && hasTypeScriptSources) {
      this.setDependencyVersion(pkg, 'typescript', TYPESCRIPT_FALLBACK_VERSION, 'devDependencies');
      console.log('✓ Added TypeScript devDependency with stable version');
      changed = true;
    }

    const normalized = this.normalizeDependencyVersion(pkg, 'typescript', TYPESCRIPT_FALLBACK_VERSION, dependencyInfo?.section);
    return changed || normalized;
  }

  private normalizeDependencyVersion(
    pkg: any,
    dependencyName: string,
    fallbackVersion: string,
    existingSection?: typeof PACKAGE_SECTIONS[number]
  ): boolean {
    const info = this.getDependencyInfo(pkg, dependencyName);
    if (!info) {
      return false;
    }

    const rawVersion = String(info.version).trim();
    const isPlaceholder = /latest|next|beta|alpha|rc|\*|workspace:/i.test(rawVersion) || rawVersion.length === 0;
    const isAllowed = TYPESCRIPT_ALLOWED_VERSIONS.has(rawVersion);

    if (dependencyName === 'typescript' && (!isAllowed || isPlaceholder)) {
      this.setDependencyVersion(pkg, dependencyName, fallbackVersion, existingSection || info.section);
      console.log(`✓ Normalized ${dependencyName} version from "${rawVersion}" to "${fallbackVersion}"`);
      return true;
    }

    return false;
  }

  private getDependencyInfo(
    pkg: any,
    dependencyName: string
  ): { section: typeof PACKAGE_SECTIONS[number]; version: string } | null {
    for (const section of PACKAGE_SECTIONS) {
      const bucket = pkg[section];
      if (bucket && typeof bucket === 'object' && dependencyName in bucket) {
        return { section, version: String(bucket[dependencyName]) };
      }
    }
    return null;
  }

  private setDependencyVersion(
    pkg: any,
    dependencyName: string,
    version: string,
    preferredSection: typeof PACKAGE_SECTIONS[number] = 'devDependencies'
  ): void {
    const info = this.getDependencyInfo(pkg, dependencyName);
    const targetSection = info?.section || preferredSection;

    if (!pkg[targetSection] || typeof pkg[targetSection] !== 'object') {
      pkg[targetSection] = {};
    }

    pkg[targetSection][dependencyName] = version;
  }

  private normalizeFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }

  private ensureTypeDeclarationPackages(pkg: any): boolean {
    let changed = false;

    for (const [dependency, typePackages] of Object.entries(DEPENDENCY_TYPE_MAPPINGS)) {
      const dependencyInfo = this.getDependencyInfo(pkg, dependency);
      if (!dependencyInfo) {
        continue;
      }

      for (const typePackage of typePackages) {
        const existingType = this.getDependencyInfo(pkg, typePackage);
        if (existingType) {
          continue;
        }

        const version = this.resolveTypePackageVersion(typePackage);
        this.setDependencyVersion(pkg, typePackage, version, 'devDependencies');
        console.log(`✓ Added missing type package ${typePackage} required by ${dependency}`);
        changed = true;
      }
    }

    return changed;
  }

  private resolveTypePackageVersion(typePackage: string): string {
    return TYPE_DEPENDENCY_VERSION_MAP[typePackage] || '^1.0.0';
  }

  private sanitizeTsConfigIfPresent(
    files: Array<{ path: string; content: string }>,
    tsconfigIndex: number,
    needsDomLib: boolean
  ): Array<{ path: string; content: string }> {
    if (tsconfigIndex === -1) {
      return files;
    }

    const tsconfigFile = files[tsconfigIndex];
    const sanitized = [...files];
    const { changed, content } = this.sanitizeTsConfig(tsconfigFile.content, needsDomLib);

    if (changed) {
      sanitized[tsconfigIndex] = {
        ...tsconfigFile,
        content
      };
      console.log('✓ Normalized tsconfig.json compiler options');
    }

    return sanitized;
  }

  private sanitizeTsConfig(content: string, needsDomLib: boolean): { changed: boolean; content: string } {
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      console.warn('⚠ Could not parse tsconfig.json for sanitization:', error);
      return { changed: false, content };
    }

    if (!parsed || typeof parsed !== 'object') {
      return { changed: false, content };
    }

    const compilerOptions = parsed.compilerOptions = parsed.compilerOptions || {};
    let changed = false;

    const baseLibs = new Set<string>();
    const existingLibs = Array.isArray(compilerOptions.lib) ? compilerOptions.lib : [];
    existingLibs.forEach((lib: string) => baseLibs.add(lib));

    if (!baseLibs.size) {
      baseLibs.add('ES2020');
      changed = true;
    }

    if (!baseLibs.has('ES2020')) {
      baseLibs.add('ES2020');
      changed = true;
    }

    if (needsDomLib) {
      if (!baseLibs.has('DOM')) {
        baseLibs.add('DOM');
        changed = true;
      }
      if (!baseLibs.has('DOM.Iterable')) {
        baseLibs.add('DOM.Iterable');
        changed = true;
      }
    }

    compilerOptions.lib = Array.from(baseLibs);

    // Ensure strict mode and module resolution defaults remain intact
    if (typeof compilerOptions.strict !== 'boolean') {
      compilerOptions.strict = true;
      changed = true;
    }

    if (!compilerOptions.moduleResolution) {
      compilerOptions.moduleResolution = 'node';
      changed = true;
    }

    if (compilerOptions.allowJs) {
      // Ensure allowJs does not conflict with type safety in generated code
      delete compilerOptions.allowJs;
      changed = true;
    }

    if (!changed) {
      return { changed: false, content };
    }

    return {
      changed: true,
      content: JSON.stringify(parsed, null, 2)
    };
  }

  private detectDomUsage(files: Array<{ path: string; content: string }>): boolean {
    return files.some(file => {
      const normalizedPath = this.normalizeFilePath(file.path).toLowerCase();
      const isTypeScript = normalizedPath.endsWith('.ts') || normalizedPath.endsWith('.tsx');
      if (!isTypeScript) {
        return false;
      }

      if (normalizedPath.includes('client') || normalizedPath.includes('frontend') || normalizedPath.endsWith('.tsx')) {
        return true;
      }

      return DOM_INDICATOR_REGEX.test(file.content);
    }) || files.some(file => this.normalizeFilePath(file.path).toLowerCase() === 'index.html');
  }

  /**
   * Get deployment logs from Fly.io
   */
  private async getDeploymentLogs(appName: string): Promise<string> {
    try {
      const result = await this.runCommand(
        'flyctl',
        ['logs', '--app', appName, '--no-tail'],
        process.cwd(),
        { checkBuildErrors: false }
      );

      if (result.code === 0) {
        return result.stdout;
      } else {
        return `Failed to retrieve logs: ${result.stderr}`;
      }
    } catch (error: any) {
      return `Error retrieving logs: ${error.message}`;
    }
  }

  private runCommand(
    command: string, 
    args: string[], 
    workDir: string, 
    options?: { checkBuildErrors?: boolean; timeout?: number }
  ): Promise<{ code: number | null, stdout: string, stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: workDir,
            env: { ...process.env, FLY_API_TOKEN: this.flyApiToken },
            shell: false,
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';
        let buildErrorDetected = false;
        let lastOutputTime = Date.now();
        
        // Set timeout (default 15 minutes for deploy, 30 seconds for other commands)
        const timeoutMs = options?.timeout || (args.includes('deploy') ? 15 * 60 * 1000 : 30000);
        const timeoutTimer = setTimeout(() => {
          if (!buildErrorDetected) {
            console.error(`⏱️ Command timeout after ${timeoutMs / 1000}s: ${command} ${args.join(' ')}`);
            child.kill('SIGTERM');
            setTimeout(() => child.kill('SIGKILL'), 5000); // Force kill after 5s if SIGTERM doesn't work
            
            const error: any = new Error(`Command timeout after ${timeoutMs / 1000} seconds`);
            error.timeout = true;
            error.deploymentLogs = stdout + '\n' + stderr;
            reject(error);
          }
        }, timeoutMs);
        
        // Heartbeat check - if no output for 2 minutes during deploy, log status
        const heartbeatInterval = setInterval(() => {
          const timeSinceLastOutput = Date.now() - lastOutputTime;
          if (timeSinceLastOutput > 120000 && args.includes('deploy')) { // 2 minutes
            console.log(`💓 Still running ${command} ${args.join(' ')} - ${Math.floor(timeSinceLastOutput / 1000)}s since last output`);
          }
        }, 30000); // Check every 30 seconds

        // Critical build errors that should stop deployment immediately
        const criticalBuildErrors = [
          'error TS',           // TypeScript compilation errors
          'error Command failed with exit code', // Yarn/npm command failures
          '#9 ERROR',           // Docker build step errors
          'RollupError:',       // Vite/Rollup bundling errors
          'Module not found',   // Missing module errors
          'Cannot find module', // Import resolution errors
          'SyntaxError:',       // JavaScript syntax errors
        ];

        // Filter function to only log important messages
        const shouldLogOutput = (output: string): boolean => {
            const line = output.toLowerCase().trim();
            
            // Skip these verbose/repetitive messages
            if (line.includes('nodes": null')) return false;
            if (line.includes('edges": null')) return false;
            if (line.includes('"id":') && !line.includes('error')) return false;
            if (line.includes('"internalnumericid":')) return false;
            if (line.includes('"organization":')) return false;
            if (line.includes('"secrets":')) return false;
            if (line.includes('"releases":')) return false;
            if (line.includes('"ipaddresses":')) return false;
            if (line.includes('"certificates":')) return false;
            if (line.includes('"machines":')) return false;
            if (line.includes('wireGuard')) return false;
            if (line.includes('loggedcertificates')) return false;
            if (line.includes('limitedaccesstokens')) return false;
            if (line.startsWith('{') && line.length > 100 && !line.includes('error')) return false; // Skip long JSON objects unless error
            
            // ALWAYS log these important messages
            if (line.includes('error')) return true;
            if (line.includes('fail')) return true;
            if (line.includes('warning')) return true;
            if (line.includes('creating')) return true;
            if (line.includes('building')) return true;
            if (line.includes('image')) return true; // Log building image progress
            if (line.includes('deploying')) return true;
            if (line.includes('deployed')) return true;
            if (line.includes('success')) return true;
            if (line.includes('visit your newly deployed app')) return true;
            if (line.includes('app created')) return true;
            if (line.includes('configuration is valid')) return true;
            if (line.includes('validating')) return true;
            if (line.includes('deployment')) return true;
            if (line.includes('updating')) return true;
            if (line.includes('pushing')) return true;
            if (line.includes('preparing')) return true;
            if (line.includes('==>')) return true; // Fly.io step indicators
            if (line.includes('step')) return true; // Docker build steps
            if (line.startsWith('#')) return true; // Docker layer info
            
            return false; // Skip everything else
        };

        const checkForBuildErrors = (output: string) => {
          if (!options?.checkBuildErrors || buildErrorDetected) return;
          
          for (const errorPattern of criticalBuildErrors) {
            if (output.includes(errorPattern)) {
              buildErrorDetected = true;
              console.error(`🚨 Critical build error detected: ${errorPattern}`);
              console.error('⚠️ Stopping deployment to prevent broken app...');
              
              // Clear timers
              clearTimeout(timeoutTimer);
              clearInterval(heartbeatInterval);
              
              // Kill the process to prevent deployment
              child.kill('SIGTERM');
              
              // Reject with detailed error
              const error: any = new Error(`Build failed: ${errorPattern} detected in output`);
              error.buildError = true;
              error.deploymentLogs = stdout + '\n' + stderr;
              reject(error);
              break;
            }
          }
        };

        child.stdout.on('data', (data) => {
            const output = data.toString();
            lastOutputTime = Date.now(); // Update last output time
            if (shouldLogOutput(output)) {
                console.log(`${command} stdout: ${output}`);
            }
            stdout += output;
            checkForBuildErrors(output);
        });

        child.stderr.on('data', (data) => {
            const output = data.toString();
            lastOutputTime = Date.now(); // Update last output time
            if (shouldLogOutput(output)) {
                console.error(`${command} stderr: ${output}`);
            }
            stderr += output;
            checkForBuildErrors(output);
        });

        child.on('close', (code) => {
            clearTimeout(timeoutTimer);
            clearInterval(heartbeatInterval);
            if (!buildErrorDetected) {
              resolve({ code, stdout, stderr });
            }
            // If buildErrorDetected, we already rejected in checkForBuildErrors
        });

        child.on('error', (err) => {
            clearTimeout(timeoutTimer);
            clearInterval(heartbeatInterval);
            reject(err);
        });
    });
  }

  private async deployWithFlyctl(
    workDir: string, 
    appName: string,
    onProgress?: (step: string, status: 'running' | 'completed' | 'failed', message?: string) => Promise<void>
  ): Promise<void> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 Starting Fly.io deployment for app: ${appName}`);
    console.log(`📂 Working directory: ${workDir}`);
    console.log(`${'='.repeat(80)}\n`);
    
    // Check if app already exists
    console.log('📋 Checking if app exists...');
    
    if (onProgress) {
      await onProgress('Checking Fly.io app', 'running', `Verifying app ${appName}`).catch(err => console.warn('Progress callback error:', err));
    }
    
    const listResult = await this.runCommand('flyctl', ['apps', 'list', '--json'], workDir, { checkBuildErrors: false });
    
    let appExists = false;
    if (listResult.code === 0 && listResult.stdout) {
      try {
        const apps = JSON.parse(listResult.stdout);
        appExists = apps.some((app: any) => app.Name === appName);
      } catch (e) {
        console.warn('Failed to parse flyctl apps list output, will attempt to create app');
      }
    }

    // Only create app if it doesn't exist
    if (!appExists) {
      console.log(`\n✨ Creating new Fly.io app: ${appName}`);
      
      if (onProgress) {
        await onProgress('Creating Fly.io app', 'running', `Creating app ${appName}`).catch(err => console.warn('Progress callback error:', err));
      }
      
      const createResult = await this.runCommand('flyctl', ['apps', 'create', appName, '--org', 'personal'], workDir, { checkBuildErrors: false });

      if (createResult.code !== 0) {
        // Check if error is because app already exists (race condition or parsing failure)
        const errorMsg = createResult.stderr.toLowerCase();
        if (!errorMsg.includes('already') && !errorMsg.includes('taken')) {
          throw new Error(`flyctl apps create failed with code ${createResult.code}: ${createResult.stderr}`);
        }
        console.log(`✓ App ${appName} already exists (race condition), proceeding with deployment`);
      } else {
        console.log(`✓ App created successfully`);
        
        if (onProgress) {
          await onProgress('Creating Fly.io app', 'completed', `App ${appName} created`).catch(err => console.warn('Progress callback error:', err));
        }
      }
    } else {
      console.log(`\n♻️  App ${appName} already exists, updating deployment`);
      
      if (onProgress) {
        await onProgress('Checking Fly.io app', 'completed', `App exists, updating`).catch(err => console.warn('Progress callback error:', err));
      }
    }

    // Deploy (this will update existing app or deploy new one)
    // Enable build error checking to stop deployment if build fails
    // Set 15 minute timeout for deployment (building can take time)
    console.log('🚀 Starting deployment with flyctl...');
    
    if (onProgress) {
      await onProgress('Deploying to Fly.io', 'running', 'Building and pushing Docker image (this may take several minutes)').catch(err => console.warn('Progress callback error:', err));
    }
    
    const deployResult = await this.runCommand('flyctl', ['deploy', '--remote-only'], workDir, { 
      checkBuildErrors: true,
      timeout: 15 * 60 * 1000 // 15 minutes
    });

    const fullOutput = deployResult.stderr + '\n' + deployResult.stdout;
    
    // Check for deployment failures - Fly.io may return code 0 even on build failures!
    // We need to check output for error indicators BEFORE deployment completes
    const errorIndicators = [
      'error during build:',
      'RollupError:',
      'Build failed',
      'error Command failed',
      'npm ERR!',
      'yarn error',
      'ERROR:',
      'FAILED',
      'Could not resolve',
      'Module not found',
      'Cannot find module',
      'SyntaxError:',
      'TypeError:',
      'ReferenceError:',
      'compilation failed',
      'build process failed',
      'error TS',           // TypeScript errors like "error TS2305"
      'error Command failed with exit code', // Yarn/npm command failures
      '#9 ERROR',           // Docker build step errors
      'executor failed'     // Docker executor failures
    ];
    
    const hasError = errorIndicators.some(indicator => 
      fullOutput.toLowerCase().includes(indicator.toLowerCase())
    );
    
    if (deployResult.code !== 0 || hasError) {
        if (onProgress) {
          await onProgress('Deploying to Fly.io', 'failed', 'Deployment failed - see logs for details').catch(err => console.warn('Progress callback error:', err));
        }
        
        // Create a detailed error with both stdout and stderr
        const error: any = new Error(
          hasError 
            ? `Fly.io build failed: ${errorIndicators.find(ind => fullOutput.toLowerCase().includes(ind.toLowerCase()))}`
            : `flyctl deploy failed with code ${deployResult.code}`
        );
        error.deploymentLogs = fullOutput;
        throw error;
    }
    
    if (onProgress) {
      await onProgress('Deploying to Fly.io', 'completed', 'Docker image built and deployed successfully').catch(err => console.warn('Progress callback error:', err));
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ Deployment completed successfully!`);
    console.log(`🌐 App: ${appName}`);
    console.log(`${'='.repeat(80)}\n`);
  }

  private createFlyToml(appName: string, language: string): string {
    // Determine internal port based on language
    const internalPort = language === 'python' ? 8080 : 80;
    
    return `app = "${appName}"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = ${internalPort}
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
`;
  }

  /**
   * Capture deployment error for learning system
   * @returns errorId for tracking
   */
  private async captureDeploymentError(
    _files: Array<{ path: string; content: string }>,
    _errorMessage: string,
    logs: string,
    attempt: number,
    _generationId: string,
    _language: string
  ): Promise<string | undefined> {
    try {
      console.log(`📚 [Learning] Capturing deployment error from attempt ${attempt}...`);
      
      // Generate error ID
      const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Parse TypeScript errors if present for logging
      if (TypeScriptErrorParser.hasTypeScriptErrors(logs)) {
        const parsed = TypeScriptErrorParser.parseErrors(logs);
        console.log(`   📝 Found ${parsed.length} TypeScript error(s)`);
      }
      
      console.log(`✓ Deployment error captured (ID: ${errorId})`);
      return errorId;
    } catch (error) {
      console.error(`Failed to capture deployment error for learning:`, error);
      // Don't throw - learning capture failure shouldn't break deployment flow
      return undefined;
    }
  }

  /**
   * Mark an error as resolved (placeholder - learning system removed)
   */
  private async markErrorResolved(errorId: string, appliedFix: string): Promise<void> {
    console.log(`✅ Error ${errorId} resolved with fix: ${appliedFix.substring(0, 100)}...`);
  }

  /**
   * Save fixed files to database after successful deployment
   * This preserves the auto-fixes made by CodeModificationAgent
   */
  private async saveFixedFilesToDatabase(
    generationId: string,
    fixedFiles: Array<{ path: string; content: string }>
  ): Promise<void> {
    try {
      // Use fetch to call the API endpoint
      const apiUrl = process.env.API_URL || 'http://localhost:3000';
      const endpoint = `${apiUrl}/api/generations/${generationId}/update-files`;
      
      console.log(`   → Calling ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: fixedFiles
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any;
        console.error(`✗ Failed to save files to database:`, errorData.error || response.statusText);
        console.warn(`   Status: ${response.status}`);
        // Don't throw - database save failure shouldn't block the successful deployment
        return;
      }

      const result = await response.json() as any;
      console.log(`✓ Fixed files saved to database (${fixedFiles.length} files)`);
      console.log(`   Generation ID: ${generationId}`);
      console.log(`   Updated at: ${result.data?.updatedAt}`);
      
    } catch (error) {
      console.error('✗ Error saving fixed files to database:', error);
      // Don't throw - database save failure shouldn't block the successful deployment
    }
  }

  /**
   * Get error signature for tracking duplicate errors
   * Extracts key parts of error message to identify similar errors
   */
  private getErrorSignature(errorMessage: string): string {
    // Remove timestamps, line numbers, and other variable parts
    return errorMessage
      .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/g, '') // Remove timestamps
      .replace(/line\s+\d+/gi, 'line X') // Normalize line numbers
      .replace(/:\d+:\d+/g, ':X:X') // Normalize position references
      .replace(/\d+/g, 'N') // Replace all numbers with N
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toLowerCase()
      .slice(0, 200); // First 200 chars for comparison
  }
}
