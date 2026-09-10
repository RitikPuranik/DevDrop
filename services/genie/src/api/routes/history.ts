
import { Router } from 'express';
import { supabase } from '../../storage/SupabaseClient';
import { optionalAuth, AuthenticatedRequest } from '../middleware/supabaseAuth';

const router = Router();

// GET /history - Get user's generation history (requires auth)
router.get('/history', optionalAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    
    console.log(`[GET /history] Request received. UserId: ${userId || 'NOT AUTHENTICATED'}`);

    // Check if user is authenticated
    if (!userId) {
      console.warn('[GET /history] No userId found - authentication failed');
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in to view history.',
      });
      return;
    }

    // Fetch user's generations from database, ordered by most recent first
    const { data: generations, error } = await supabase
      .from('generations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100); // Limit to last 100 generations

    if (error) {
      console.error('[GET /history] Failed to fetch generations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch generation history',
        details: error.message,
      });
      return;
    }

    console.log(`[GET /history] Successfully fetched ${generations?.length || 0} generations for user ${userId}`);

    // Transform data to match frontend format
    const history = generations.map((gen) => ({
      id: gen.id,
      prompt: gen.prompt,
      request: {
        prompt: gen.prompt,
        projectContext: gen.project_context,
        targetLanguage: gen.target_language,
        complexity: gen.complexity,
        agents: [], // Not stored in current schema
        imageUrls: gen.image_urls || [],
      },
      response: gen.files ? {
        files: gen.files,
        preview: gen.preview_url,
      } : null,
      status: gen.status,
      error: gen.error,
      agentMessages: [], // Not stored in current schema, could be added later
      startedAt: gen.created_at,
      completedAt: gen.updated_at,
      duration: gen.created_at && gen.updated_at 
        ? new Date(gen.updated_at).getTime() - new Date(gen.created_at).getTime()
        : undefined,
    }));

    res.json({
      success: true,
      data: history,
    });
    return;
  } catch (error: any) {
    console.error('[GET /history] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch generation history',
    });
    return;
  }
});

// GET /history/:id - Get specific generation (requires auth)
router.get('/history/:id', optionalAuth, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const { id } = req.params;

    console.log(`[GET /history/${id}] Request received. UserId: ${userId || 'NOT AUTHENTICATED'}`);

    // Check if user is authenticated
    if (!userId) {
      console.warn(`[GET /history/${id}] No userId found - authentication failed`);
      res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
      return;
    }

    // Fetch generation and verify ownership
    const { data: generation, error } = await supabase
      .from('generations')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !generation) {
      console.error(`[GET /history/${id}] Generation not found or access denied:`, error);
      res.status(404).json({
        success: false,
        error: 'Generation not found or you do not have access',
      });
      return;
    }

    console.log(`[GET /history/${id}] Successfully fetched generation`);

    // Load files from snapshot if needed
    let files = generation.files;
    if (!files && generation.snapshot_id) {
      try {
        console.log(`[GET /history/${id}] Loading files from snapshot ${generation.snapshot_id}`);
        const { codebaseStorage } = await import('../../services/CodebaseStorageService');
        const manifest = await codebaseStorage.getManifest(generation.snapshot_id, userId);
        const filePaths = manifest.files.map((f: any) => f.path);
        files = await codebaseStorage.readFiles(generation.snapshot_id, userId, filePaths);
        console.log(`[GET /history/${id}] Loaded ${files.length} files from snapshot`);
      } catch (storageError: any) {
        console.error(`[GET /history/${id}] Failed to load files from snapshot:`, storageError);
      }
    }

    // Transform to frontend format
    const historyEntry = {
      id: generation.id,
      prompt: generation.prompt,
      request: {
        prompt: generation.prompt,
        projectContext: generation.project_context,
        targetLanguage: generation.target_language,
        complexity: generation.complexity,
        agents: [],
        imageUrls: generation.image_urls || [],
      },
      response: files ? {
        files: files,
        preview: generation.preview_url,
      } : null,
      status: generation.status,
      error: generation.error,
      agentMessages: [],
      startedAt: generation.created_at,
      completedAt: generation.updated_at,
      duration: generation.created_at && generation.updated_at 
        ? new Date(generation.updated_at).getTime() - new Date(generation.created_at).getTime()
        : undefined,
    };

    res.json({
      success: true,
      data: historyEntry,
    });
    return;
  } catch (error: any) {
    console.error('[GET /history/:id] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch generation',
    });
    return;
  }
});

export default router;
