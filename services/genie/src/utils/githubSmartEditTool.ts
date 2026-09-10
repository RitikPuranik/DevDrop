/**
 * Smart Edit Tool for GitHub Agent
 * Ported from gemini-cli with 3 replacement strategies + self-correction
 */

import { Octokit } from '@octokit/rest';
import crypto from 'crypto';

/**
 * Parameters for smart edit operation
 */
export interface SmartEditParams {
  owner: string;
  repo: string;
  filePath: string;
  oldString: string;
  newString: string;
  instruction: string; // High-level goal of the edit
  branch?: string;
}

/**
 * Result of replacement calculation
 */
interface ReplacementResult {
  newContent: string;
  occurrences: number;
  strategy: 'exact' | 'flexible' | 'regex' | 'none';
  finalOldString: string;
  finalNewString: string;
}

/**
 * Self-correction result from LLM
 */
interface CorrectionResult {
  search: string;
  replace: string;
  noChangesRequired: boolean;
  explanation: string;
}

/**
 * Safely replaces text with literal strings, avoiding $ issues
 */
function safeLiteralReplace(
  str: string,
  oldString: string,
  newString: string
): string {
  if (oldString === '' || !str.includes(oldString)) {
    return str;
  }

  if (!newString.includes('$')) {
    return str.replaceAll(oldString, newString);
  }

  // Escape $ to prevent template interpretation
  const escapedNewString = newString.replaceAll('$', '$$$$');
  return str.replaceAll(oldString, escapedNewString);
}

/**
 * Restores trailing newline if it was present in original
 */
function restoreTrailingNewline(
  originalContent: string,
  modifiedContent: string
): string {
  const hadTrailingNewline = originalContent.endsWith('\n');
  if (hadTrailingNewline && !modifiedContent.endsWith('\n')) {
    return modifiedContent + '\n';
  } else if (!hadTrailingNewline && modifiedContent.endsWith('\n')) {
    return modifiedContent.replace(/\n$/, '');
  }
  return modifiedContent;
}

/**
 * Escapes regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Creates SHA256 hash of content (for caching)
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Strategy 1: Exact replacement
 */
async function calculateExactReplacement(
  currentContent: string,
  oldString: string,
  newString: string
): Promise<ReplacementResult | null> {
  const normalizedCode = currentContent;
  const normalizedSearch = oldString.replace(/\r\n/g, '\n');
  const normalizedReplace = newString.replace(/\r\n/g, '\n');

  const exactOccurrences = normalizedCode.split(normalizedSearch).length - 1;
  if (exactOccurrences > 0) {
    let modifiedCode = safeLiteralReplace(
      normalizedCode,
      normalizedSearch,
      normalizedReplace
    );
    modifiedCode = restoreTrailingNewline(currentContent, modifiedCode);
    return {
      newContent: modifiedCode,
      occurrences: exactOccurrences,
      strategy: 'exact',
      finalOldString: normalizedSearch,
      finalNewString: normalizedReplace,
    };
  }

  return null;
}

/**
 * Strategy 2: Flexible replacement (tolerates whitespace differences)
 */
async function calculateFlexibleReplacement(
  currentContent: string,
  oldString: string,
  newString: string
): Promise<ReplacementResult | null> {
  const normalizedCode = currentContent;
  const normalizedSearch = oldString.replace(/\r\n/g, '\n');
  const normalizedReplace = newString.replace(/\r\n/g, '\n');

  const sourceLines = normalizedCode.match(/.*(?:\n|$)/g)?.slice(0, -1) ?? [];
  const searchLinesStripped = normalizedSearch
    .split('\n')
    .map((line: string) => line.trim());
  const replaceLines = normalizedReplace.split('\n');

  let flexibleOccurrences = 0;
  let i = 0;
  while (i <= sourceLines.length - searchLinesStripped.length) {
    const window = sourceLines.slice(i, i + searchLinesStripped.length);
    const windowStripped = window.map((line: string) => line.trim());
    const isMatch = windowStripped.every(
      (line: string, index: number) => line === searchLinesStripped[index]
    );

    if (isMatch) {
      flexibleOccurrences++;
      const firstLineInMatch = window[0];
      const indentationMatch = firstLineInMatch.match(/^(\s*)/);
      const indentation = indentationMatch ? indentationMatch[1] : '';
      const newBlockWithIndent = replaceLines.map(
        (line: string) => `${indentation}${line}`
      );
      sourceLines.splice(
        i,
        searchLinesStripped.length,
        newBlockWithIndent.join('\n')
      );
      i += replaceLines.length;
    } else {
      i++;
    }
  }

  if (flexibleOccurrences > 0) {
    let modifiedCode = sourceLines.join('');
    modifiedCode = restoreTrailingNewline(currentContent, modifiedCode);
    return {
      newContent: modifiedCode,
      occurrences: flexibleOccurrences,
      strategy: 'flexible',
      finalOldString: normalizedSearch,
      finalNewString: normalizedReplace,
    };
  }

  return null;
}

/**
 * Strategy 3: Regex-based replacement (for token-level matching)
 */
async function calculateRegexReplacement(
  currentContent: string,
  oldString: string,
  newString: string
): Promise<ReplacementResult | null> {
  const normalizedSearch = oldString.replace(/\r\n/g, '\n');
  const normalizedReplace = newString.replace(/\r\n/g, '\n');

  const delimiters = ['(', ')', ':', '[', ']', '{', '}', '>', '<', '='];

  let processedString = normalizedSearch;
  for (const delim of delimiters) {
    processedString = processedString.split(delim).join(` ${delim} `);
  }

  const tokens = processedString.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  const escapedTokens = tokens.map(escapeRegex);
  const pattern = escapedTokens.join('\\s*');
  const finalPattern = `^(\\s*)${pattern}`;
  const flexibleRegex = new RegExp(finalPattern, 'm');

  const match = flexibleRegex.exec(currentContent);

  if (!match) {
    return null;
  }

  const indentation = match[1] || '';
  const newLines = normalizedReplace.split('\n');
  const newBlockWithIndent = newLines
    .map((line) => `${indentation}${line}`)
    .join('\n');

  const modifiedCode = currentContent.replace(flexibleRegex, newBlockWithIndent);

  return {
    newContent: restoreTrailingNewline(currentContent, modifiedCode),
    occurrences: 1,
    strategy: 'regex',
    finalOldString: normalizedSearch,
    finalNewString: normalizedReplace,
  };
}

/**
 * Attempts all replacement strategies
 */
async function calculateReplacement(
  currentContent: string,
  oldString: string,
  newString: string
): Promise<ReplacementResult> {
  const normalizedSearch = oldString.replace(/\r\n/g, '\n');
  const normalizedReplace = newString.replace(/\r\n/g, '\n');

  if (normalizedSearch === '') {
    return {
      newContent: currentContent,
      occurrences: 0,
      strategy: 'none',
      finalOldString: normalizedSearch,
      finalNewString: normalizedReplace,
    };
  }

  // Try strategies in order
  const exactResult = await calculateExactReplacement(
    currentContent,
    oldString,
    newString
  );
  if (exactResult) {
    console.log('✓ Smart edit: exact strategy succeeded');
    return exactResult;
  }

  const flexibleResult = await calculateFlexibleReplacement(
    currentContent,
    oldString,
    newString
  );
  if (flexibleResult) {
    console.log('✓ Smart edit: flexible strategy succeeded');
    return flexibleResult;
  }

  const regexResult = await calculateRegexReplacement(
    currentContent,
    oldString,
    newString
  );
  if (regexResult) {
    console.log('✓ Smart edit: regex strategy succeeded');
    return regexResult;
  }

  return {
    newContent: currentContent,
    occurrences: 0,
    strategy: 'none',
    finalOldString: normalizedSearch,
    finalNewString: normalizedReplace,
  };
}

/**
 * Self-correction using LLM when edit fails
 * Uses ADK's Gemini client for correction
 */
async function attemptSelfCorrection(
  params: SmartEditParams,
  currentContent: string,
  error: string,
  llmCall: (systemPrompt: string, userPrompt: string) => Promise<string>
): Promise<ReplacementResult> {
  console.log('⚡ Attempting self-correction with LLM...');

  const EDIT_SYS_PROMPT = `You are an expert code-editing assistant specializing in debugging and correcting failed search-and-replace operations.

# Primary Goal
Your task is to analyze a failed edit attempt and provide a corrected \`search\` string that will match the text in the file precisely. The correction should be as minimal as possible, staying very close to the original, failed \`search\` string.

# Rules for Correction
1. **Minimal Correction:** Focus on fixing whitespace, indentation, line endings, or small contextual differences.
2. **Explain the Fix:** State exactly why the original search failed and how your new search resolves it.
3. **Preserve the Replace String:** Do NOT modify the replace string unless absolutely necessary.
4. **No Changes Case:** If the change is already present in the file, set noChangesRequired to true.
5. **Exactness:** The final search field must be the EXACT literal text from the file.

Return ONLY a valid JSON object with this structure:
{
  "search": "corrected search string",
  "replace": "replace string (usually unchanged)",
  "noChangesRequired": false,
  "explanation": "why the original failed and how this fixes it"
}`;

  const userPrompt = `# Goal of the Original Edit
<instruction>
${params.instruction}
</instruction>

# Failed Attempt Details
- **Original search parameter (failed):**
<search>
${params.oldString}
</search>
- **Original replace parameter:**
<replace>
${params.newString}
</replace>
- **Error Encountered:**
<error>
${error}
</error>

# Full File Content
<file_content>
${currentContent}
</file_content>

# Your Task
Provide a corrected search string that will succeed. Keep your correction minimal and explain the precise reason for the failure.`;

  try {
    const response = await llmCall(EDIT_SYS_PROMPT, userPrompt);
    
    // Extract JSON from response (in case there's markdown code blocks)
    let jsonStr = response.trim();
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }
    
    const correction: CorrectionResult = JSON.parse(jsonStr);

    console.log('✓ Self-correction explanation:', correction.explanation);

    if (correction.noChangesRequired) {
      return {
        newContent: currentContent,
        occurrences: 0,
        strategy: 'none',
        finalOldString: params.oldString,
        finalNewString: params.newString,
      };
    }

    // Try again with corrected parameters
    const secondAttempt = await calculateReplacement(
      currentContent,
      correction.search,
      correction.replace
    );

    if (secondAttempt.occurrences > 0) {
      console.log('✓ Self-correction succeeded!');
      return secondAttempt;
    } else {
      console.log('✗ Self-correction failed');
      return {
        newContent: currentContent,
        occurrences: 0,
        strategy: 'none',
        finalOldString: params.oldString,
        finalNewString: params.newString,
      };
    }
  } catch (err) {
    console.error('✗ Self-correction error:', err);
    return {
      newContent: currentContent,
      occurrences: 0,
      strategy: 'none',
      finalOldString: params.oldString,
      finalNewString: params.newString,
    };
  }
}

/**
 * Main smart edit function
 * @param llmCall - Function to call LLM for self-correction (systemPrompt, userPrompt) => response
 */
export async function performSmartEdit(
  octokit: Octokit,
  params: SmartEditParams,
  llmCall?: (systemPrompt: string, userPrompt: string) => Promise<string>
): Promise<{
  success: boolean;
  newContent?: string;
  occurrences?: number;
  strategy?: string;
  error?: string;
}> {
  try {
    // Get current file content
    const { data: fileData } = await octokit.repos.getContent({
      owner: params.owner,
      repo: params.repo,
      path: params.filePath,
      ref: params.branch,
    });

    if (Array.isArray(fileData) || fileData.type !== 'file') {
      return { success: false, error: 'Path is not a file' };
    }

    const currentContent = Buffer.from(fileData.content, 'base64').toString(
      'utf-8'
    );
    const normalizedContent = currentContent.replace(/\r\n/g, '\n');

    // Try replacement strategies
    const result = await calculateReplacement(
      normalizedContent,
      params.oldString,
      params.newString
    );

    // If all strategies failed, try self-correction (if LLM is available)
    if (result.occurrences === 0 && llmCall) {
      const error = `Failed to find the search string in the file. 0 occurrences found.`;
      const correctedResult = await attemptSelfCorrection(
        params,
        normalizedContent,
        error,
        llmCall
      );

      if (correctedResult.occurrences > 0) {
        return {
          success: true,
          newContent: correctedResult.newContent,
          occurrences: correctedResult.occurrences,
          strategy: correctedResult.strategy + ' (self-corrected)',
        };
      } else {
        return {
          success: false,
          error: `Could not find the search string in the file after trying all strategies including self-correction.`,
        };
      }
    }

    if (result.occurrences === 0) {
      return {
        success: false,
        error: `Could not find the search string in the file after trying all strategies (exact, flexible, regex).`,
      };
    }

    return {
      success: true,
      newContent: result.newContent,
      occurrences: result.occurrences,
      strategy: result.strategy,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unknown error during smart edit',
    };
  }
}

/**
 * Create ADK tool for smart edit
 */
export function createSmartEditTool() {
  return {
    name: 'bot_github_smart_edit_file',
    description: `Intelligently edits a file in a GitHub repository using smart search-and-replace with 3 fallback strategies:
1. Exact matching (fastest)
2. Flexible matching (tolerates whitespace/indentation differences)
3. Regex-based matching (token-level matching)

If all strategies fail, uses LLM self-correction to fix the search parameters automatically.

This tool is MUCH better than rewriting entire files - it makes surgical edits and prevents truncation issues.`,
    parameters: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'Repository owner',
        },
        repo: {
          type: 'string',
          description: 'Repository name',
        },
        filePath: {
          type: 'string',
          description: 'Path to the file to edit',
        },
        oldString: {
          type: 'string',
          description:
            'The exact text to search for and replace. Include 3+ lines of context before and after for precision.',
        },
        newString: {
          type: 'string',
          description:
            'The exact text to replace oldString with. Ensure proper formatting and indentation.',
        },
        instruction: {
          type: 'string',
          description:
            'High-level goal of this edit (e.g., "Fix null pointer bug in getUserProfile function"). Used for self-correction if edit fails.',
        },
        branch: {
          type: 'string',
          description: 'Branch name (optional, defaults to default branch)',
        },
      },
      required: ['owner', 'repo', 'filePath', 'oldString', 'newString', 'instruction'],
    },
  };
}
