import { Router } from 'express';
import { getPublicLandingTheme, updateAdminLandingTheme } from '../controllers/landingTheme.controller';
import { authenticateSuper, validate } from '../middleware';
import { updateLandingThemeSchema } from '../validators/landingTheme.validator';

const router = Router();

router.get('/', getPublicLandingTheme);
router.put('/', authenticateSuper, validate(updateLandingThemeSchema), updateAdminLandingTheme);

export default router;
