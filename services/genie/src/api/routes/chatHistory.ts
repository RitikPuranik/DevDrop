import { Router } from 'express';
import { ChatMemoryManager } from '../../services/ChatMemoryManager';

const router = Router();

// Get chat history for a generation
router.get('/chat/history/:generationId', async (req, res): Promise<void> => {
  try {
    const { generationId } = req.params;
    const { limit } = req.query;

    if (!generationId) {
      res.status(400).json({
        success: false,
        error: 'Generation ID is required',
      });
      return;
    }

    // Get messages (all or limited)
    const messages = limit
      ? await ChatMemoryManager.getRecentMessages(generationId, parseInt(limit as string, 10))
      : await ChatMemoryManager.getAllMessages(generationId);

    const messageCount = await ChatMemoryManager.getMessageCount(generationId);

    res.json({
      success: true,
      data: {
        messages,
        totalCount: messageCount,
        returnedCount: messages.length,
      },
    });
    return;
  } catch (error: any) {
    console.error('Failed to fetch chat history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch chat history',
    });
    return;
  }
});

export default router;
