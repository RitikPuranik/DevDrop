const { generateApp } = require('./gemini.service');

/**
 * POST /api/ai-generate
 * body: { messages: [{role: 'user'|'assistant', content: string}], fileData?: { files, dependencies } | null }
 * returns: { success, data: { assistantMessage, title, files, dependencies } }
 */
exports.generate = async (req, res) => {
  try {
    const { messages, fileData } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'No messages provided' });
    }

    const result = await generateApp({ messages, fileData: fileData || null });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('AI generate error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.userMessage || 'Failed to generate app',
    });
  }
};
