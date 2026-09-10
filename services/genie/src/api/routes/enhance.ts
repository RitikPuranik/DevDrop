
import { Router } from 'express';
// import { EnhanceWorkflow } from '../../workflows/EnhanceWorkflow';

const router = Router();

router.post('/enhance', async (_req, res) => {
  // const { code } = req.body;
  // const enhanceWorkflow = new EnhanceWorkflow();
  // const diff = await enhanceWorkflow.run(code);
  // res.json({ diff });
  res.status(501).json({ message: 'Not Implemented' });
});

export default router;
