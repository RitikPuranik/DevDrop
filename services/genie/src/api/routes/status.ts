
import { Router } from 'express';
// import { SupabaseClient } from '@supabase/supabase-js';

const router = Router();

router.get('/status', async (_req, res) => {
  // const supabase: SupabaseClient = req.app.get('supabase');
  // const { data, error } = await supabase.from('projects').select('id').limit(1);

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    // supabase: error ? 'error' : 'ok',
  });
});

export default router;
