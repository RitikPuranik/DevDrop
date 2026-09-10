import { Router, Response } from 'express';
import { optionalAuth, AuthenticatedRequest } from '../middleware/supabaseAuth';
import { supabase } from '../../storage/SupabaseClient';

const router = Router();

/**
 * Update generation files
 * POST /api/generations/:id/update-files
 */
router.post('/:id/update-files', optionalAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { files } = req.body;
    const userId = req.user?.id;

    if (!files || !Array.isArray(files)) {
      res.status(400).json({
        success: false,
        error: 'Files array is required'
      });
      return;
    }

    // Get the current generation to verify ownership and get existing data
    const { data: generation, error: fetchError } = await supabase
      .from('generations')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !generation) {
      console.error('Generation not found:', fetchError);
      res.status(404).json({
        success: false,
        error: 'Generation not found',
        details: fetchError?.message
      });
      return;
    }

    console.log(`Found generation ${id}, user_id: ${generation.user_id}, request user: ${userId}`);

    // Verify ownership if user is logged in
    if (userId && generation.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: 'Not authorized to update this generation'
      });
      return;
    }

    console.log(`Updating generation ${id} with ${files.length} files`);

    // Update the files column directly
    const { error: updateError } = await supabase
      .from('generations')
      .update({
        files: files
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating generation:', updateError);
      res.status(500).json({
        success: false,
        error: 'Failed to update generation',
        details: updateError.message
      });
      return;
    }

    console.log(`✅ Successfully updated files for generation ${id}`);
    res.json({
      success: true,
      data: {
        id: id,
        files: files,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in update-files endpoint:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * Get generation by ID
 * GET /api/generations/:id
 */
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { data: generation, error } = await supabase
      .from('generations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !generation) {
      res.status(404).json({
        success: false,
        error: 'Generation not found'
      });
      return;
    }

    // Verify ownership if user is logged in
    if (userId && generation.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: 'Not authorized to access this generation'
      });
      return;
    }

    res.json({
      success: true,
      data: generation
    });
  } catch (error) {
    console.error('Error fetching generation:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
