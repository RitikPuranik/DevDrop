/**
 * Self-Correction Utility for GitHub Agent
 * Provides reusable LLM-powered error recovery for GitHub operations
 */

/**
 * Generic self-correction result
 */
export interface SelfCorrectionResult<T> {
  success: boolean;
  correctedParams?: T;
  explanation?: string;
  noChangesRequired?: boolean;
  error?: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts?: number; // Default: 2 (original + 1 retry)
  delayMs?: number; // Delay between retries (default: 0)
}

/**
 * LLM Call Function Type
 */
export type LLMCallFunction = (
  systemPrompt: string,
  userPrompt: string
) => Promise<string>;

/**
 * Generic operation executor with self-correction
 * 
 * @param operation - Function to execute (takes params, returns result)
 * @param params - Initial parameters
 * @param llmCall - LLM function for self-correction
 * @param correctionPromptBuilder - Function to build correction prompt
 * @param retryConfig - Retry configuration
 * @returns Operation result or corrected result
 */
export async function executeWithSelfCorrection<TParams, TResult>(
  operation: (params: TParams) => Promise<TResult>,
  params: TParams,
  llmCall: LLMCallFunction | undefined,
  correctionPromptBuilder: (
    params: TParams,
    error: any
  ) => { systemPrompt: string; userPrompt: string; resultSchema: any },
  retryConfig: RetryConfig = {}
): Promise<TResult> {
  const { maxAttempts = 2, delayMs = 0 } = retryConfig;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[Self-Correction] Attempt ${attempt}/${maxAttempts}`);
      const result = await operation(params);
      console.log(`[Self-Correction] ✓ Operation succeeded on attempt ${attempt}`);
      return result;
    } catch (error) {
      console.log(`[Self-Correction] ✗ Operation failed on attempt ${attempt}:`, error);
      lastError = error;

      // If no LLM or last attempt, throw error
      if (!llmCall || attempt === maxAttempts) {
        throw error;
      }

      // Try self-correction
      console.log(`[Self-Correction] Attempting LLM self-correction...`);
      try {
        const { systemPrompt, userPrompt } =
          correctionPromptBuilder(params, error);

        const response = await llmCall(systemPrompt, userPrompt);

        // Extract JSON from response
        let jsonStr = response.trim();
        if (jsonStr.includes('```json')) {
          jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
        } else if (jsonStr.includes('```')) {
          jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
        }

        const correction = JSON.parse(jsonStr);

        console.log('[Self-Correction] LLM suggestion:', correction.explanation);

        if (correction.noChangesRequired) {
          console.log('[Self-Correction] LLM says no changes needed, aborting');
          throw lastError;
        }

        // Apply correction to params
        params = { ...params, ...correction.correctedParams };
        console.log('[Self-Correction] Retrying with corrected params...');

        // Delay before retry
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (correctionError) {
        console.error('[Self-Correction] LLM correction failed:', correctionError);
        throw lastError;
      }
    }
  }

  throw lastError;
}

/**
 * Self-correction for file path issues
 * Helps when file paths are incorrect, moved, or renamed
 */
export function buildFilePathCorrectionPrompt(
  params: { filePath: string; owner: string; repo: string },
  error: any,
  availableFiles?: string[]
): { systemPrompt: string; userPrompt: string; resultSchema: any } {
  const systemPrompt = `You are a GitHub repository expert helping correct file path errors.

Your task: Analyze the error and suggest a corrected file path.

Respond ONLY with valid JSON in this format:
{
  "correctedParams": {
    "filePath": "corrected/path/to/file.ts"
  },
  "explanation": "Brief reason for the correction",
  "noChangesRequired": false
}

If the error cannot be fixed by changing the path, set noChangesRequired to true.`;

  const userPrompt = `# Error
${error.message || String(error)}

# Attempted Path
${params.filePath}

# Repository
${params.owner}/${params.repo}

${availableFiles ? `# Available Files (sample)\n${availableFiles.slice(0, 20).join('\n')}` : ''}

# Task
Suggest a corrected file path that might exist in this repository.
Consider common mistakes:
- Wrong directory depth
- Missing/extra file extensions
- Case sensitivity issues
- Moved files (check similar paths)
- Typos in filename`;

  return {
    systemPrompt,
    userPrompt,
    resultSchema: {
      correctedParams: { filePath: 'string' },
      explanation: 'string',
      noChangesRequired: 'boolean',
    },
  };
}

/**
 * Self-correction for branch issues
 * Helps when branch doesn't exist, wrong name, or needs creation
 */
export function buildBranchCorrectionPrompt(
  params: { branch: string; owner: string; repo: string; baseBranch?: string },
  error: any,
  availableBranches?: string[]
): { systemPrompt: string; userPrompt: string; resultSchema: any } {
  const systemPrompt = `You are a GitHub repository expert helping correct branch errors.

Your task: Analyze the error and suggest a corrected branch name or action.

Respond ONLY with valid JSON in this format:
{
  "correctedParams": {
    "branch": "corrected-branch-name",
    "createIfMissing": true
  },
  "explanation": "Brief reason for the correction",
  "noChangesRequired": false
}`;

  const userPrompt = `# Error
${error.message || String(error)}

# Attempted Branch
${params.branch}

# Repository
${params.owner}/${params.repo}

${availableBranches ? `# Available Branches\n${availableBranches.join('\n')}` : ''}

# Task
Suggest a corrected branch name or recommend creating it.
Consider:
- Branch might not exist (suggest creation)
- Wrong branch name (typo)
- Case sensitivity
- Common branch names (main, master, develop)`;

  return {
    systemPrompt,
    userPrompt,
    resultSchema: {
      correctedParams: { branch: 'string', createIfMissing: 'boolean' },
      explanation: 'string',
      noChangesRequired: 'boolean',
    },
  };
}

/**
 * Self-correction for API rate limiting
 * Suggests retry with delay or alternative approach
 */
export function buildRateLimitCorrectionPrompt(
  _params: any,
  error: any
): { systemPrompt: string; userPrompt: string; resultSchema: any } {
  const systemPrompt = `You are a GitHub API expert helping handle rate limit errors.

Your task: Suggest how to handle rate limiting.

Respond ONLY with valid JSON in this format:
{
  "correctedParams": {
    "retryAfterMs": 60000,
    "useAlternativeMethod": false
  },
  "explanation": "Brief explanation",
  "noChangesRequired": false
}`;

  const userPrompt = `# Error
${error.message || String(error)}

# Rate Limit Info
${error.response?.headers?.['x-ratelimit-remaining'] || 'unknown'} remaining
${error.response?.headers?.['x-ratelimit-reset'] || 'unknown'} reset time

# Task
Suggest wait time or alternative approach.`;

  return {
    systemPrompt,
    userPrompt,
    resultSchema: {
      correctedParams: {
        retryAfterMs: 'number',
        useAlternativeMethod: 'boolean',
      },
      explanation: 'string',
      noChangesRequired: 'boolean',
    },
  };
}

/**
 * Self-correction for content format issues
 * Helps with encoding, line endings, invalid characters
 */
export function buildContentFormatCorrectionPrompt(
  params: { content: string },
  error: any
): { systemPrompt: string; userPrompt: string; resultSchema: any } {
  const systemPrompt = `You are a file content expert helping fix format issues.

Your task: Analyze the error and suggest content corrections.

Respond ONLY with valid JSON in this format:
{
  "correctedParams": {
    "encoding": "utf-8",
    "normalizeLineEndings": true,
    "removeInvalidChars": false
  },
  "explanation": "Brief reason for the correction",
  "noChangesRequired": false
}`;

  const userPrompt = `# Error
${error.message || String(error)}

# Content Preview
${params.content.substring(0, 500)}...

# Task
Suggest formatting corrections:
- Encoding issues (UTF-8, UTF-16, etc.)
- Line ending problems (CRLF vs LF)
- Invalid characters
- BOM markers`;

  return {
    systemPrompt,
    userPrompt,
    resultSchema: {
      correctedParams: {
        encoding: 'string',
        normalizeLineEndings: 'boolean',
        removeInvalidChars: 'boolean',
      },
      explanation: 'string',
      noChangesRequired: 'boolean',
    },
  };
}

/**
 * Self-correction for generic GitHub API errors
 */
export function buildGenericGitHubCorrectionPrompt(
  params: any,
  error: any,
  context?: string
): { systemPrompt: string; userPrompt: string; resultSchema: any } {
  const systemPrompt = `You are a GitHub API expert helping debug and fix errors.

Your task: Analyze the error and suggest parameter corrections.

Respond ONLY with valid JSON in this format:
{
  "correctedParams": {
    // Any parameters that should be changed
  },
  "explanation": "Brief reason for the correction",
  "noChangesRequired": false
}`;

  const userPrompt = `# Error
${error.message || String(error)}

# Original Parameters
${JSON.stringify(params, null, 2)}

${context ? `# Context\n${context}` : ''}

# Task
Analyze the error and suggest corrected parameters.
Common issues:
- Missing required parameters
- Invalid parameter values
- Incorrect parameter types
- Permission issues
- API endpoint changes`;

  return {
    systemPrompt,
    userPrompt,
    resultSchema: {
      correctedParams: 'object',
      explanation: 'string',
      noChangesRequired: 'boolean',
    },
  };
}

/**
 * Wrapper for operations with automatic retry on common errors
 */
export async function withAutoRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryableErrors?: string[]; // Error messages that should trigger retry
    delayMs?: number;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'rate limit',
      'network',
      'timeout',
    ],
    delayMs = 1000,
    onRetry,
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      const errorMessage = (error.message || String(error)).toLowerCase();
      const isRetryable = retryableErrors.some((pattern) =>
        errorMessage.includes(pattern.toLowerCase())
      );

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      console.log(`[Auto-Retry] Attempt ${attempt} failed, retrying...`);
      if (onRetry) {
        onRetry(attempt, error);
      }

      // Exponential backoff
      const delay = delayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
