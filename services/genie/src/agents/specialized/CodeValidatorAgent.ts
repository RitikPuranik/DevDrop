/**
 * CodeValidatorAgent - AI-powered code validation and error detection
 * Detects syntax errors, duplicated files, and other code quality issues
 */

import { AgentBuilder } from '@iqai/adk';
import { z } from 'zod';

const systemPrompt = `You are a Code Validator Agent. Your job is to analyze generated code and detect any issues including:

1. **Syntax Errors**: Check for invalid syntax, missing brackets, incorrect imports, etc.
2. **Duplicated Files**: Detect if the same file appears multiple times with different content
3. **Missing Dependencies**: Check if all imported modules are available
4. **Type Errors**: Validate TypeScript types and interfaces
5. **Logic Errors**: Identify potential runtime errors or logical inconsistencies
6. **Best Practices**: Check for code quality issues

For each issue found, provide:
- Type of issue (syntax, duplicate, dependency, type, logic, quality)
- Severity (critical, high, medium, low)
- File path where the issue occurs
- Line number (if applicable)
- Description of the issue
- Suggested fix

Your output must be a JSON object with this structure:
{
  "isValid": boolean,
  "issues": [
    {
      "type": "syntax" | "duplicate" | "dependency" | "type" | "logic" | "quality",
      "severity": "critical" | "high" | "medium" | "low",
      "filePath": "path/to/file.ts",
      "line": number or null,
      "description": "Clear description of the issue",
      "suggestedFix": "How to fix this issue"
    }
  ],
  "summary": "Overall assessment of the code quality"
}

If the code is perfect with no issues, return:
{
  "isValid": true,
  "issues": [],
  "summary": "Code is valid and ready for production"
}`;

const issueSchema = z.object({
  type: z.enum(['syntax', 'duplicate', 'dependency', 'type', 'logic', 'quality']),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  filePath: z.string(),
  line: z.number().nullable(),
  description: z.string(),
  suggestedFix: z.string(),
});

const validationSchema: z.ZodTypeAny = z.object({
  isValid: z.boolean(),
  issues: z.array(issueSchema),
  summary: z.string(),
});

export const CodeValidatorAgent = async () => {
  return AgentBuilder.create('CodeValidatorAgent')
    .withModel('gemini-2.5-flash')
    .withInstruction(systemPrompt)
    .withOutputSchema(validationSchema as unknown as z.ZodTypeAny)
    .build();
};
