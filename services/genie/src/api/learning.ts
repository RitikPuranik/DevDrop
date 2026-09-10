/**
 * Learning Statistics API
 * Provides insights into the error learning system
 */

import express from 'express';
import { getLearningIntegration } from '../services/learning/LearningIntegrationService';

const router = express.Router();
const learningService = getLearningIntegration();

/**
 * GET /api/learning/stats
 * Get learning system statistics
 */
router.get('/stats', async (_req, res) => {
  try {
    const stats = learningService.getStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('[Learning Stats] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/learning/knowledge-base
 * Export entire knowledge base (for debugging/analysis)
 */
router.get('/knowledge-base', async (_req, res) => {
  try {
    const kb = learningService.exportKnowledgeBase();
    
    res.json({
      success: true,
      data: kb
    });
  } catch (error: any) {
    console.error('[Learning Knowledge Base] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/learning/fix-suggestions
 * Get AI-powered fix suggestions for an error
 */
router.post('/fix-suggestions', async (req, res) => {
  try {
    const { error, language, framework, platform } = req.body;

    if (!error || !language) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: error, language'
      });
    }

    const suggestions = await learningService.getSmartFixSuggestions(error, {
      language,
      framework,
      platform
    });

    return res.json({
      success: true,
      data: { suggestions }
    });
  } catch (error: any) {
    console.error('[Learning Fix Suggestions] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
