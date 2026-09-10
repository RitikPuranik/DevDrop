import { z } from 'zod';

// Schema for test file output
export const testFileSchema = z.object({
  path: z.string().describe('File path for the test file'),
  content: z.string().describe('Complete test code content'),
  description: z.string().optional().describe('Description of what this test file contains'),
});

export const testGenerationSchema = z.object({
  files: z.array(testFileSchema).describe('Array of test files to create'),
  summary: z.string().optional().describe('Summary of the test suite and how to run tests'),
});

// Export type for TypeScript
export type TestGenerationOutput = z.infer<typeof testGenerationSchema>;
export type TestFileOutput = z.infer<typeof testFileSchema>;
