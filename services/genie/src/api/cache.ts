/**
 * Cache monitoring API endpoint
 */

import express from 'express';
import { getAgentCacheStats } from '../services/AgentInitService';

const router = express.Router();

/**
 * GET /api/cache/stats
 * Get current cache statistics
 */
router.get('/stats', (_req, res) => {
  try {
    const stats = getAgentCacheStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cache statistics'
    });
  }
});

export default router;
