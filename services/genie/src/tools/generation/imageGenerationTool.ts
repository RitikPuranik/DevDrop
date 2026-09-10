import { createTool } from '@iqai/adk';
import { z } from 'zod';
import { generateImage, generateMultipleImages, type ImageGenerationOptions } from '../../services/ImageGenerationService';

/**
 * Image Generation Tool - Powered by Runware
 * Allows agents to generate product images using Runware's high-performance AI image generation API
 * Features: WebSocket-based real-time processing, automatic cloud upload to Supabase storage
 * Model: runware:101@1 (Stable Diffusion optimized for speed and quality)
 */

export interface GenerateImageInput {
  prompt: string;
  userId: string;
  options?: Partial<ImageGenerationOptions>;
}

export interface GenerateMultipleImagesInput {
  prompts: string[];
  userId: string;
  options?: Partial<ImageGenerationOptions>;
}

/**
 * Generate a single image from a text prompt
 * 
 * @example
 * ```typescript
 * const result = await imageGenerationTool({
 *   prompt: "A professional product photo of red Nike running shoes on white background",
 *   userId: "user123"
 * });
 * 
 * if (result.success) {
 *   console.log("Image URL:", result.imageUrl);
 *   // Use this URL in HTML: <img src="${result.imageUrl}" alt="Product" />
 * }
 * ```
 */
export async function imageGenerationTool(input: GenerateImageInput) {
  const { prompt, userId, options = {} } = input;

  if (!prompt || !userId) {
    return {
      success: false,
      error: 'Both prompt and userId are required',
    };
  }

  console.log(`\n🎨 Image Generation Tool called by user ${userId}`);
  console.log(`📝 Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);

  const result = await generateImage(prompt, userId, options);

  if (result.success) {
    console.log(`✅ Image generated successfully: ${result.imageUrl}`);
    return {
      success: true,
      imageUrl: result.imageUrl,
      imagePath: result.imagePath,
      message: 'Image generated successfully. You can now use this URL in your HTML/CSS code.',
      usage: {
        htmlExample: `<img src="${result.imageUrl}" alt="Generated image" />`,
        cssExample: `background-image: url('${result.imageUrl}');`,
      },
    };
  } else {
    console.error(`❌ Image generation failed: ${result.error}`);
    return {
      success: false,
      error: result.error,
      message: 'Failed to generate image. Please try again with a different prompt.',
    };
  }
}

/**
 * Generate multiple images from text prompts
 * Useful for creating product galleries, variations, etc.
 * 
 * @example
 * ```typescript
 * const result = await multipleImageGenerationTool({
 *   prompts: [
 *     "Red Nike shoes, professional product photo",
 *     "Blue Adidas shoes, professional product photo",
 *     "Black Puma shoes, professional product photo"
 *   ],
 *   userId: "user123"
 * });
 * 
 * // Use in HTML carousel or grid
 * result.images.forEach((img, i) => {
 *   if (img.success) {
 *     console.log(`Image ${i+1}: ${img.imageUrl}`);
 *   }
 * });
 * ```
 */
export async function multipleImageGenerationTool(input: GenerateMultipleImagesInput) {
  const { prompts, userId, options = {} } = input;

  if (!prompts || prompts.length === 0 || !userId) {
    return {
      success: false,
      error: 'Both prompts array and userId are required',
    };
  }

  console.log(`\n🎨 Multiple Image Generation Tool called by user ${userId}`);
  console.log(`📝 Generating ${prompts.length} images`);

  const results = await generateMultipleImages(prompts, userId, options);

  const successfulImages = results.filter(r => r.success);
  const failedImages = results.filter(r => !r.success);

  console.log(`✅ Successfully generated ${successfulImages.length}/${prompts.length} images`);

  return {
    success: successfulImages.length > 0,
    totalRequested: prompts.length,
    totalGenerated: successfulImages.length,
    totalFailed: failedImages.length,
    images: results.map((result, index) => ({
      index,
      prompt: prompts[index],
      success: result.success,
      imageUrl: result.imageUrl,
      imagePath: result.imagePath,
      error: result.error,
    })),
    imageUrls: successfulImages.map(r => r.imageUrl),
    message: `Generated ${successfulImages.length} out of ${prompts.length} images successfully.`,
    usage: {
      htmlGalleryExample: successfulImages.map(r => 
        `<img src="${r.imageUrl}" alt="Generated image" />`
      ).join('\n'),
    },
  };
}

/**
 * Create ADK-compatible image generation tool
 * This is the main tool that agents will use
 */
export function createImageGenerationTool(userId: string) {
  return createTool({
    name: 'generate_image',
    description: `Generate AI product images or visual content using Runware API. Perfect for creating product photos, 
    hero images, backgrounds, or any visual content for websites. The generated image will be automatically 
    uploaded to cloud storage and you'll receive a URL that can be used directly in HTML/CSS code.
    
    IMPORTANT RULES:
    - ALWAYS provide a detailed, descriptive prompt (minimum 10 words)
    - Be SPECIFIC about subject, style, background, and lighting
    - Include quality keywords like "professional", "high quality", "detailed"
    - For products: mention material, color, angle, and background
    
    WHEN TO USE:
    - User needs product images but doesn't have any (e.g., "shoe store", "furniture website")
    - Creating hero sections, backgrounds, or visual content
    - User asks for "generate images", "create product photos", "AI images"
    - Building e-commerce sites, portfolios, or any visual-heavy websites
    
    EXAMPLE GOOD PROMPTS:
    ✅ "Professional product photo of red Nike running shoes on white background, studio lighting, front view, high quality, detailed"
    ✅ "Modern minimalist hero image with geometric shapes, gradient blue to purple background, abstract, high resolution"
    ✅ "Wooden dining table with 6 chairs, natural wood finish, top-down view, soft natural lighting, professional product photography"
    
    EXAMPLE BAD PROMPTS:
    ❌ "shoes" (too vague)
    ❌ "image" (no description)
    ❌ "product" (not specific)
    
    The generated image URL can be used in:
    - HTML: <img src="URL" alt="description" />
    - CSS: background-image: url('URL');
    - React/TSX: <img src="URL" />`,
    schema: z.object({
      prompt: z.string().min(10).describe(`REQUIRED: Detailed description of the image to generate (minimum 10 characters). 
        
        Must include:
        1. Subject - What is the main object/scene?
        2. Style - What style/aesthetic? (e.g., "professional product photo", "minimalist", "modern art")
        3. Background - What background? (e.g., "white background", "natural outdoor setting", "gradient")
        4. Lighting - What lighting? (e.g., "studio lighting", "natural light", "dramatic shadows")
        5. Quality - Quality keywords (e.g., "high quality", "detailed", "professional")
        
        Format: "[Style] [Subject] [Background] [Lighting] [Quality]"
        Example: "Professional product photo of red Nike running shoes on white background, studio lighting, front view, high quality, detailed"`),
      count: z.number().min(1).max(10).optional().default(1).describe('Number of images to generate (1-10). Default is 1. Each image takes ~5 seconds.'),
      width: z.number().min(512).max(2048).optional().default(1024).describe('Image width in pixels (512-2048). Default is 1024.'),
      height: z.number().min(512).max(2048).optional().default(1024).describe('Image height in pixels (512-2048). Default is 1024.'),
    }),
    fn: async (args) => {
      try {
        const { prompt, count = 1, width = 1024, height = 1024 } = args;

        // Validate prompt
        if (!prompt || prompt.trim().length < 10) {
          return {
            success: false,
            error: 'Prompt must be at least 10 characters long and descriptive',
            message: 'Please provide a detailed prompt with subject, style, background, lighting, and quality keywords.',
          };
        }

        // Validate dimensions
        if (width < 512 || width > 2048 || height < 512 || height > 2048) {
          return {
            success: false,
            error: 'Invalid dimensions. Width and height must be between 512 and 2048 pixels.',
          };
        }

        console.log(`[ImageGenTool] Generating ${count} image(s) for user ${userId}`);
        console.log(`[ImageGenTool] Prompt: "${prompt.substring(0, 100)}..."`);

        const options: Partial<ImageGenerationOptions> = {
          width,
          height,
        };

        if (count === 1) {
          const result = await generateImage(prompt, userId, options);
          
          if (result.success) {
            console.log(`[ImageGenTool] ✅ Success: ${result.imageUrl}`);
            return {
              success: true,
              imageUrl: result.imageUrl,
              imagePath: result.imagePath,
              seed: result.seed,
              cost: result.cost,
              message: 'Image generated successfully. You can now use this URL in your HTML/CSS code.',
              usage: {
                html: `<img src="${result.imageUrl}" alt="Generated image" />`,
                css: `background-image: url('${result.imageUrl}');`,
                react: `<img src="${result.imageUrl}" alt="Generated image" className="..." />`,
              },
            };
          } else {
            console.error(`[ImageGenTool] ❌ Failed: ${result.error}`);
            return {
              success: false,
              error: result.error || 'Unknown error',
              message: `Failed to generate image: ${result.error}. Please try again with a different prompt.`,
            };
          }
        } else {
          // Generate multiple variations
          const prompts = Array(Math.min(count, 10)).fill(prompt);
          const results = await generateMultipleImages(prompts, userId, options);
          
          const successfulImages = results.filter(r => r.success);
          
          console.log(`[ImageGenTool] Generated ${successfulImages.length}/${count} images`);
          
          return {
            success: successfulImages.length > 0,
            totalRequested: count,
            totalGenerated: successfulImages.length,
            totalFailed: results.length - successfulImages.length,
            images: results.map((result, index) => ({
              index,
              success: result.success,
              imageUrl: result.imageUrl,
              imagePath: result.imagePath,
              seed: result.seed,
              cost: result.cost,
              error: result.error,
            })),
            imageUrls: successfulImages.map(r => r.imageUrl),
            message: `Generated ${successfulImages.length} out of ${count} images successfully.`,
          };
        }
      } catch (error: any) {
        console.error(`[ImageGenTool] ❌ Unexpected error:`, error);
        return {
          success: false,
          error: error.message || 'Unexpected error during image generation',
          message: 'An unexpected error occurred. Please try again.',
        };
      }
    },
  });
}

/**
 * Export tool metadata for tool registry
 */
export const imageGenerationToolMetadata = {
  name: 'Image Generator (Runware)',
  description: 'Generate AI images for websites using Runware\'s high-performance API',
  category: 'GENERATION',
  capabilities: [
    'Generate product photos',
    'Create hero images',
    'Generate backgrounds',
    'Create visual content',
    'Multiple image generation',
    'Automatic cloud upload',
    'Real-time WebSocket processing',
    'Fast generation (model: runware:101@1)',
  ],
};
