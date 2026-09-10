
import { Router } from 'express';
// import { ProjectContextService } from '../../services/ProjectContextService';
// import { SupabaseClient } from '@supabase/supabase-js';

const router = Router();

// This would be initialized and passed in, not created here
// const projectContextService = new ProjectContextService(); 

router.post('/onboard', async (_req, res) => {
  // const { repoUrl } = req.body;
  // const projectId = await projectContextService.onboard(repoUrl);
  // res.status(201).json({ projectId });
  res.status(501).json({ message: 'Not Implemented' });
});

export default router;
