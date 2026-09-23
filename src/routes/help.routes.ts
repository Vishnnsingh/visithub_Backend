import { Router } from 'express';
import { listAdminHelp, submitHelp } from '../controllers/help.controller';
import { authenticateSuper, validate } from '../middleware';
import { createHelpSchema } from '../validators/help.validator';

const router = Router();

router.post('/', validate(createHelpSchema), submitHelp);
router.get('/', authenticateSuper, listAdminHelp);

export default router;
