import { Router } from 'express';
import {
  dashboard,
  login,
  logout,
  me,
  register,
  superLogin,
  superLogout,
  updatePassword,
} from '../controllers/auth.controller';
import {
  authenticate,
  authenticateAny,
  authenticateSuper,
  authorize,
  requireActiveSubscription,
  validate,
} from '../middleware';
import { changePasswordSchema, loginSchema, registerSchema } from '../validators/auth.validator';
import { ORG_WORKSPACE_ROLES } from '../utils/constants';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/logout', logout);
router.get('/me', authenticateAny, me);
router.post('/change-password', authenticateAny, validate(changePasswordSchema), updatePassword);
router.get(
  '/dashboard',
  authenticate,
  authorize(...ORG_WORKSPACE_ROLES),
  requireActiveSubscription,
  dashboard
);

/** Visit Hub staff (super admin) — separate session from org admin */
router.post('/superadmin/login', validate(loginSchema), superLogin);
router.post('/superadmin/logout', superLogout);
router.get('/superadmin/me', authenticateSuper, me);

export default router;
