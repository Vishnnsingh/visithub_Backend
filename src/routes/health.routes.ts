import { Router } from 'express';
import { hello } from '../controllers/health.controller';

const router = Router();

router.get('/hello', hello);

export default router;
