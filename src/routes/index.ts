import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import superadminRoutes from './superadmin.routes';
import staffRoutes from './staff.routes';
import orgRoutes from './org.routes';
import qrRoutes from './qr.routes';
import visitorRoutes from './visitor.routes';
import publicRoutes from './public.routes';
import plansRoutes from './plans.routes';
import landingThemeRoutes from './landingTheme.routes';
import subscriptionRoutes from './subscription.routes';
import contactRoutes from './contact.routes';
import businessTypesRoutes from './businessTypes.routes';
import helpRoutes from './help.routes';
import legalRoutes from './legal.routes';

const router = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/superadmin', superadminRoutes);
router.use('/public', publicRoutes);
router.use('/plans', plansRoutes);
router.use('/landing-theme', landingThemeRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/contact', contactRoutes);
router.use('/help', helpRoutes);
router.use('/legal', legalRoutes);
router.use('/business-types', businessTypesRoutes);
router.use('/staff', staffRoutes);
router.use('/organisation', orgRoutes);
router.use('/qr', qrRoutes);
router.use('/visitor', visitorRoutes);

export default router;
