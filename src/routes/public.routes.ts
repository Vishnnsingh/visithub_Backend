import { Router } from 'express';
import { getPublicOrgHomePage } from '../controllers/visitor.controller';

const router = Router();

router.get('/org/:organizationId/home', getPublicOrgHomePage);

export default router;
