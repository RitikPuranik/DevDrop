import { z } from 'zod';

// Pre-compile schemas once for better performance
export const fileSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export const generationSchema = z.object({
  files: z.array(fileSchema),
});

// Pre-compiled and frozen schemas (immutable for performance)
Object.freeze(fileSchema);
Object.freeze(generationSchema);

// Export type for TypeScript
export type GenerationOutput = z.infer<typeof generationSchema>;
export type FileOutput = z.infer<typeof fileSchema>;
