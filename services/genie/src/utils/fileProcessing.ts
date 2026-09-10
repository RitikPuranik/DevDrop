/**
 * File processing utilities for handling file uploads and downloads
 * Supports images and documents for multimodal processing
 */

const pdfParse = require('pdf-parse');

/**
 * Check if content type is an image that supports vision API
 */
export function isVisionSupportedImage(contentType: string): boolean {
  return contentType.startsWith('image/') && 
    (contentType.includes('png') || 
     contentType.includes('jpeg') || 
     contentType.includes('jpg') ||
     contentType.includes('gif') ||
     contentType.includes('webp'));
}

/**
 * Check if content type is a document that needs text extraction
 */
export function isDocumentType(contentType: string): boolean {
  return (
    contentType === 'application/pdf' ||
    contentType.includes('text/') ||
    contentType.includes('document') ||
    contentType.includes('word') ||
    contentType.includes('spreadsheet')
  );
}

/**
 * Extract text content from PDF buffer
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (error) {
    console.error('Failed to extract PDF text:', error);
    return '[PDF text extraction failed]';
  }
}

/**
 * Extract text from document buffer based on content type
 */
async function extractDocumentText(buffer: Buffer, contentType: string): Promise<string> {
  if (contentType === 'application/pdf') {
    return extractPdfText(buffer);
  }
  
  // For text-based formats, convert buffer to string
  if (contentType.startsWith('text/') || 
      contentType.includes('json') || 
      contentType.includes('xml') ||
      contentType.includes('csv')) {
    return buffer.toString('utf-8');
  }
  
  // For other document types (DOCX, XLSX, etc.), return placeholder
  // In a production app, you'd use libraries like mammoth (DOCX), xlsx (Excel), etc.
  return `[Document content - ${contentType}]\n(Text extraction not yet implemented for this format)`;
}

/**
 * Validate if a buffer contains a valid image
 */
export function isValidImageBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  
  return (
    // PNG
    (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) ||
    // JPEG
    (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) ||
    // GIF
    (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) ||
    // WebP (check for RIFF...WEBP)
    (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
     buffer.length >= 12 &&
     buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) ||
    // BMP
    (buffer[0] === 0x42 && buffer[1] === 0x4D)
  );
}

/**
 * Validate if a buffer contains a valid PDF
 */
export function isValidPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF
}

/**
 * Get file format description for logging
 */
export function getFileFormatInfo(buffer: Buffer, contentType: string): string {
  if (contentType.startsWith('image/')) {
    if (!isValidImageBuffer(buffer)) {
      return 'Invalid image format';
    }
    
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'PNG';
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'JPEG';
    if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'GIF';
    if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'WebP';
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) return 'BMP';
    return 'Image';
  }
  
  if (contentType === 'application/pdf') {
    return isValidPdfBuffer(buffer) ? 'PDF' : 'Invalid PDF';
  }
  
  return contentType.split('/').pop()?.toUpperCase() || 'Unknown';
}

/**
 * Fetch a file from URL and convert to format suitable for LLM processing
 * - Images: base64 encoded for vision API
 * - Documents (PDF, etc.): extracted text content
 */
export async function fetchFileAsBase64(
  url: string,
  context: string = 'FileProcessor'
): Promise<{
  inline_data?: {
    mime_type: string;
    data: string;
  };
  text?: string;
  fileName?: string;
} | null> {
  try {
    console.log(`[${context}] Fetching file from: ${url}`);
    const response = await globalThis.fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const fileName = url.split('/').pop() || 'file';
    
    const formatInfo = getFileFormatInfo(buffer, contentType);
    console.log(`[${context}] Successfully fetched: ${fileName} (${formatInfo}, ${buffer.length} bytes)`);
    
    // Check if this is a vision-supported image
    if (isVisionSupportedImage(contentType)) {
      // Validate image format
      if (!isValidImageBuffer(buffer)) {
        throw new Error(`Invalid image format - file does not contain valid ${contentType} data`);
      }
      
      const base64 = buffer.toString('base64');
      console.log(`[${context}] Encoded as base64 image for vision API`);
      
      return {
        inline_data: {
          mime_type: contentType,
          data: base64
        },
        fileName
      };
    }
    
    // For documents, extract text content
    if (isDocumentType(contentType)) {
      console.log(`[${context}] Extracting text from document...`);
      const textContent = await extractDocumentText(buffer, contentType);
      console.log(`[${context}] Extracted ${textContent.length} characters of text`);
      
      return {
        text: `📄 **File: ${fileName}** (${formatInfo})\n\n${textContent}`,
        fileName
      };
    }
    
    // For other file types, return as text with warning
    console.warn(`[${context}] ⚠️ Unsupported file type ${contentType}, attempting text conversion`);
    const textContent = buffer.toString('utf-8').substring(0, 10000); // Limit to 10KB
    
    return {
      text: `📎 **File: ${fileName}** (${contentType})\n\n${textContent}\n\n[Content truncated if longer than 10KB]`,
      fileName
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[${context}] Failed to fetch/process file from ${url}:`, errorMsg);
    return null;
  }
}

/**
 * Fetch multiple files and convert to appropriate format
 * Returns images as base64 and documents as text
 */
export async function fetchMultipleFilesAsBase64(
  urls: string[],
  context: string = 'FileProcessor'
): Promise<{
  imageParts: Array<{
    inline_data: {
      mime_type: string;
      data: string;
    };
  }>;
  textContent: string;
}> {
  const results = await Promise.all(
    urls.map(url => fetchFileAsBase64(url, context))
  );
  
  const validResults = results.filter(result => result !== null);
  
  // Separate images and text content
  const imageParts: Array<{
    inline_data: {
      mime_type: string;
      data: string;
    };
  }> = [];
  
  const textParts: string[] = [];
  
  for (const result of validResults) {
    if (result!.inline_data) {
      imageParts.push({ inline_data: result!.inline_data });
    }
    if (result!.text) {
      textParts.push(result!.text);
    }
  }
  
  const textContent = textParts.length > 0 ? `\n\n${textParts.join('\n\n---\n\n')}` : '';
  
  if (validResults.length === 0 && urls.length > 0) {
    console.warn(`[${context}] ⚠️ WARNING: No valid files could be loaded from ${urls.length} URLs`);
  } else if (validResults.length < urls.length) {
    console.warn(`[${context}] ⚠️ WARNING: Only ${validResults.length}/${urls.length} files loaded successfully`);
  } else {
    console.log(`[${context}] Successfully loaded ${validResults.length} file(s) (${imageParts.length} images, ${textParts.length} documents)`);
  }
  
  return { imageParts, textContent };
}
