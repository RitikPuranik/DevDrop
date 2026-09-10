/**
 * Prompt Compression Utility
 * Reduces prompt size while maintaining semantic meaning
 */

interface CompressionOptions {
  removeExtraWhitespace?: boolean;
  shortenExamples?: boolean;
  useAbbreviations?: boolean;
  removeRedundancy?: boolean;
}

/**
 * Compress a system prompt by removing redundancy
 */
export function compressPrompt(
  prompt: string,
  options: CompressionOptions = {}
): string {
  const {
    removeExtraWhitespace = true,
    shortenExamples = true,
    useAbbreviations = true,
    removeRedundancy = true
  } = options;

  let compressed = prompt;

  // 1. Remove extra whitespace
  if (removeExtraWhitespace) {
    // Replace multiple spaces with single space
    compressed = compressed.replace(/ {2,}/g, ' ');
    // Replace multiple newlines with max 2 newlines
    compressed = compressed.replace(/\n{3,}/g, '\n\n');
    // Trim leading/trailing whitespace on each line
    compressed = compressed.split('\n').map(line => line.trim()).join('\n');
  }

  // 2. Shorten verbose examples (keep first few, summarize rest)
  if (shortenExamples) {
    // Find long example blocks and summarize
    compressed = compressed.replace(
      /(Example|EXAMPLE|example)s?:[\s\S]{500,}/gi,
      (match) => {
        const lines = match.split('\n');
        if (lines.length > 10) {
          return lines.slice(0, 8).join('\n') + '\n... (more examples omitted for brevity)';
        }
        return match;
      }
    );
  }

  // 3. Use common abbreviations
  if (useAbbreviations) {
    const abbreviations: Record<string, string> = {
      'for example': 'e.g.',
      'For example': 'E.g.',
      'that is': 'i.e.',
      'That is': 'I.e.',
      'and so on': 'etc.',
      'And so on': 'Etc.',
    };

    for (const [full, abbr] of Object.entries(abbreviations)) {
      compressed = compressed.replace(new RegExp(full, 'g'), abbr);
    }
  }

  // 4. Remove redundant instructions
  if (removeRedundancy) {
    // Remove repetitive phrases
    const redundantPhrases = [
      /You (must|should) always .+\. You (must|should) always .+\./gi,
      /Remember to .+\. Remember to .+\./gi,
      /Make sure (to|that) .+\. Make sure (to|that) .+\./gi,
    ];

    for (const pattern of redundantPhrases) {
      compressed = compressed.replace(pattern, (match) => {
        // Keep only first occurrence
        return match.split('.')[0] + '.';
      });
    }
  }

  return compressed;
}

/**
 * Calculate compression ratio
 */
export function getCompressionStats(original: string, compressed: string): {
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  compressionRatio: number;
  savedPercent: string;
} {
  const originalSize = original.length;
  const compressedSize = compressed.length;
  const savedBytes = originalSize - compressedSize;
  const compressionRatio = compressedSize / originalSize;
  const savedPercent = ((1 - compressionRatio) * 100).toFixed(1);

  return {
    originalSize,
    compressedSize,
    savedBytes,
    compressionRatio,
    savedPercent
  };
}

/**
 * Smart compression that maintains critical sections
 */
export function smartCompress(prompt: string): string {
  // Split prompt into sections
  const sections = prompt.split(/\n(?=#{1,3} )/); // Split on markdown headers
  
  const compressed = sections.map(section => {
    // Don't compress critical instruction sections heavily
    if (section.includes('CRITICAL') || section.includes('IMPORTANT') || section.includes('MUST')) {
      return compressPrompt(section, {
        removeExtraWhitespace: true,
        shortenExamples: false,
        useAbbreviations: false,
        removeRedundancy: false
      });
    }
    
    // Compress example sections more aggressively
    if (section.includes('example') || section.includes('Example') || section.includes('EXAMPLE')) {
      return compressPrompt(section, {
        removeExtraWhitespace: true,
        shortenExamples: true,
        useAbbreviations: true,
        removeRedundancy: true
      });
    }
    
    // Normal compression for other sections
    return compressPrompt(section);
  }).join('\n');

  return compressed;
}
