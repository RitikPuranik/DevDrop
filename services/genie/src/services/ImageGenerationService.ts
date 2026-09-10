import { Runware } from "@runware/sdk-js";
import { getSupabaseClient } from "../storage/SupabaseClient";
import { v4 as uuidv4 } from "uuid";

export interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  guidanceScale?: number;
  numInferenceSteps?: number;
  seed?: number;
  randomizeSeed?: boolean;
  numberResults?: number;
}

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  imagePath?: string;
  error?: string;
  seed?: number;
  cost?: number;
}

const DEFAULT_OPTIONS: Partial<ImageGenerationOptions> = {
  negativePrompt: "",
  width: 512,
  height: 512,
  guidanceScale: 7.5,
  numInferenceSteps: 25,
  seed: 0,
  randomizeSeed: true,
  numberResults: 1,
};

/**
 * Normalize dimensions to nearest valid Runware size
 * Runware typically supports dimensions in multiples of 64
 * Common valid sizes: 512, 576, 640, 704, 768, 832, 896, 960, 1024, etc.
 */
function normalizeImageDimension(dimension: number): number {
  // Clamp to valid range
  const clamped = Math.max(512, Math.min(2048, dimension));
  
  // Round to nearest multiple of 64
  const normalized = Math.round(clamped / 64) * 64;
  
  // Ensure it's within valid range after rounding
  return Math.max(512, Math.min(2048, normalized));
}

const RUNWARE_MODEL = "runware:101@1";
const RUNWARE_API_KEY = process.env.RUNWARE_API_KEY || "";

if (!RUNWARE_API_KEY) {
  console.warn("RUNWARE_API_KEY not found in environment variables");
}

async function generateImageWithRunware(
  prompt: string,
  options: ImageGenerationOptions,
  retryCount = 0
): Promise<{ imageUrl: string; seed?: number; cost?: number }> {
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 2000; // 2 seconds

  console.log(`🚀 Initializing Runware SDK for prompt: "${prompt.substring(0, 100)}..." (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);

  let runware: any = null;

  try {
    // Validate prompt
    if (!prompt || prompt.trim() === '') {
      throw new Error('Empty or invalid prompt provided');
    }

    // Validate API key
    if (!RUNWARE_API_KEY || RUNWARE_API_KEY.trim() === '') {
      throw new Error('RUNWARE_API_KEY is not configured or empty');
    }

    // Initialize Runware client
    runware = new Runware({
      apiKey: RUNWARE_API_KEY,
    });

    console.log(`🔌 Attempting connection to Runware...`);
    await runware.ensureConnection();
    console.log(`✅ Connected to Runware successfully`);

    // Normalize dimensions to valid Runware sizes (multiples of 64)
    const normalizedWidth = normalizeImageDimension(options.width || 512);
    const normalizedHeight = normalizeImageDimension(options.height || 512);

    if (normalizedWidth !== options.width || normalizedHeight !== options.height) {
      console.log(`📐 Dimensions normalized: ${options.width}x${options.height} → ${normalizedWidth}x${normalizedHeight}`);
    }

    // Request image generation with validation
    const requestParams = {
      positivePrompt: prompt.trim(),
      model: RUNWARE_MODEL,
      width: normalizedWidth,
      height: normalizedHeight,
      numberResults: 1,
      outputFormat: "PNG" as const,
      includeCost: true,
    };

    // Add optional parameters only if they exist
    if (options.negativePrompt && options.negativePrompt.trim()) {
      (requestParams as any).negativePrompt = options.negativePrompt.trim();
    }

    console.log(`📝 Sending request with params:`, {
      promptLength: requestParams.positivePrompt.length,
      model: requestParams.model,
      dimensions: `${requestParams.width}x${requestParams.height}`,
      outputFormat: requestParams.outputFormat,
      includeCost: requestParams.includeCost,
    });

    const requestStartTime = Date.now();
    const images = await runware.requestImages(requestParams);
    const requestDuration = Date.now() - requestStartTime;

    console.log(`📥 Received response in ${requestDuration}ms:`, {
      hasImages: !!images,
      imageCount: images?.length || 0,
      firstImageURL: images?.[0]?.imageURL ? 'present' : 'missing',
    });

    if (!images || images.length === 0) {
      throw new Error("No images returned from Runware API - empty response array");
    }

    const firstImage = images[0];
    if (!firstImage || !firstImage.imageURL) {
      throw new Error(`Invalid image response structure: ${JSON.stringify(firstImage)}`);
    }

    console.log(`✅ Generation complete! Image URL received`);

    return {
      imageUrl: firstImage.imageURL,
      seed: firstImage.seed,
      cost: firstImage.cost,
    };
  } catch (error: any) {
    // Enhanced error logging
    console.error(`❌ Runware error occurred after attempt ${retryCount + 1}:`, {
      errorType: typeof error,
      errorConstructor: error?.constructor?.name,
      message: error?.message || 'No message',
      name: error?.name || 'No name',
      code: error?.code,
      statusCode: error?.statusCode,
      status: error?.status,
      response: error?.response,
      data: error?.data,
      errorString: String(error),
    });

    // Try to provide helpful error messages
    let errorMessage = 'Unknown error';
    let shouldRetry = false;
    
    if (error?.message) {
      errorMessage = error.message;
      
      // Determine if we should retry based on error type
      if (error.message.includes('timeout') || 
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('network') ||
          error.message.includes('socket')) {
        shouldRetry = true;
        errorMessage = `Network error: ${error.message}`;
      } else if (error.message.includes('rate limit') || error.message.includes('429')) {
        shouldRetry = true;
        errorMessage = 'Rate limit exceeded - too many requests';
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error?.code === 'ECONNREFUSED') {
      shouldRetry = true;
      errorMessage = 'Cannot connect to Runware API - connection refused';
    } else if (error?.statusCode === 401 || error?.status === 401) {
      errorMessage = 'Invalid API key - authentication failed';
    } else if (error?.statusCode === 429 || error?.status === 429) {
      shouldRetry = true;
      errorMessage = 'Rate limit exceeded - too many requests';
    } else if (error?.code === 'ETIMEDOUT') {
      shouldRetry = true;
      errorMessage = 'Request timeout - Runware API did not respond in time';
    }

    // Retry logic
    if (shouldRetry && retryCount < MAX_RETRIES) {
      console.log(`🔄 Retrying in ${RETRY_DELAY}ms... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      
      // Disconnect before retry
      if (runware) {
        try {
          await runware.disconnect();
        } catch {}
      }
      
      return generateImageWithRunware(prompt, options, retryCount + 1);
    }

    throw new Error(`Runware generation failed: ${errorMessage}`);
  } finally {
    // Always try to disconnect
    if (runware) {
      try {
        await runware.disconnect();
        console.log(`🔌 Disconnected from Runware`);
      } catch (disconnectError) {
        console.warn(`⚠️ Warning: Failed to disconnect from Runware:`, disconnectError);
      }
    }
  }
}

async function uploadImageToSupabase(
  imageUrl: string,
  userId: string
): Promise<{ url: string; path: string }> {
  const supabase = getSupabaseClient();
  const response = await fetch(imageUrl);
  const arrayBuffer = await response.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);

  const timestamp = Date.now();
  const randomString = uuidv4().substring(0, 8);
  const fileName = `generated-${timestamp}-${randomString}.png`;
  const filePath = `${userId}/generated/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("chat-images")
    .upload(filePath, imageBuffer, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("chat-images")
    .getPublicUrl(filePath);

  return {
    url: urlData.publicUrl,
    path: filePath,
  };
}

export async function generateImage(
  prompt: string,
  userId: string,
  options: Partial<ImageGenerationOptions> = {}
): Promise<ImageGenerationResult> {
  if (!prompt || prompt.trim() === "") {
    return { success: false, error: "Empty prompt" };
  }

  if (!RUNWARE_API_KEY) {
    return { success: false, error: "RUNWARE_API_KEY not configured" };
  }

  const finalOptions: ImageGenerationOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    prompt,
  };

  try {
    const { imageUrl, seed, cost } = await generateImageWithRunware(prompt, finalOptions);
    const { url, path } = await uploadImageToSupabase(imageUrl, userId);

    return {
      success: true,
      imageUrl: url,
      imagePath: path,
      seed,
      cost,
    };
  } catch (error: any) {
    console.error("Generation failed:", error.message);
    return {
      success: false,
      error: error.message || "Image generation failed",
    };
  }
}

export async function generateMultipleImages(
  prompts: string[],
  userId: string,
  options: Partial<ImageGenerationOptions> = {}
): Promise<ImageGenerationResult[]> {
  const results: ImageGenerationResult[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const result = await generateImage(prompts[i], userId, options);
    results.push(result);

    if (i < prompts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

export function getKeyManagerStats(): Record<string, any> {
  return {
    provider: "runware",
    model: RUNWARE_MODEL,
    apiKeyConfigured: !!RUNWARE_API_KEY,
  };
}
