/**
 * Image Generation API Routes - Powered by Runware
 * Test and manage image generation service using Runware's high-performance API
 */

import express from 'express';
import { generateImage, getKeyManagerStats } from '../services/ImageGenerationService';

const router = express.Router();

/**
 * POST /api/images/generate
 * Generate a single image
 */
router.post('/generate', async (req, res) => {
  try {
    const { prompt, userId, width, height } = req.body;

    if (!prompt || !userId) {
      return res.status(400).json({
        error: 'Missing required fields: prompt and userId',
      });
    }

    console.log(`🎨 API: Generating image for user ${userId}`);
    console.log(`📝 Prompt: ${prompt}`);

    const result = await generateImage(prompt, userId, {
      width: width || 1024,
      height: height || 1024,
    });

    if (result.success) {
      return res.json({
        success: true,
        imageUrl: result.imageUrl,
        imagePath: result.imagePath,
        seed: result.seed,
        cost: result.cost,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    console.error('Image generation API error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * GET /api/images/stats
 * Get Runware API statistics
 */
router.get('/stats', async (_req, res) => {
  try {
    const stats = getKeyManagerStats();

    return res.json({
      provider: stats.provider,
      model: stats.model,
      apiKeyConfigured: stats.apiKeyConfigured,
    });
  } catch (error: any) {
    console.error('Stats API error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * POST /api/images/test
 * Test image generation with a default prompt
 */
router.post('/test', async (req, res) => {
  try {
    const userId = req.body.userId || 'test-user';
    const testPrompt = 'Professional product photo of red Nike running shoes on white background, studio lighting, front view, high quality';

    console.log(`🧪 Testing image generation for user ${userId}`);

    const result = await generateImage(testPrompt, userId);

    return res.json({
      success: result.success,
      imageUrl: result.imageUrl,
      imagePath: result.imagePath,
      seed: result.seed,
      cost: result.cost,
      error: result.error,
      testPrompt,
    });
  } catch (error: any) {
    console.error('Test API error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
});

export default router;
