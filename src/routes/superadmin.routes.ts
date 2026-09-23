import { Router } from 'express';
import {
  deactivateTenant,
  deleteTenant,
  tenantDetail,
  tenants,
  updateTenantCatalogPlanPrice,
  updateTenantCustomMonthlyPrice,
  updateTenantPlanPricingBundle,
} from '../controllers/auth.controller';
import {
  adminGetPaymentSettings,
  adminListPayments,
  adminPaymentDetail,
  adminPaymentStats,
  adminUpdatePaymentSettings,
} from '../controllers/payment.controller';
import { authenticateSuper } from '../middleware';

const router = Router();

router.use(authenticateSuper);

router.get('/tenants', tenants);
router.get('/tenants/:id', tenantDetail);
router.patch('/tenants/:id/active', deactivateTenant);
router.patch('/tenants/:id/custom-monthly-price', updateTenantCustomMonthlyPrice);
router.patch('/tenants/:id/catalog-plan-price', updateTenantCatalogPlanPrice);
router.put('/tenants/:id/plan-pricing', updateTenantPlanPricingBundle);
router.delete('/tenants/:id', deleteTenant);

router.get('/payments/stats', adminPaymentStats);
router.get('/payments/settings', adminGetPaymentSettings);
router.put('/payments/settings', adminUpdatePaymentSettings);
router.get('/payments', adminListPayments);
router.get('/payments/:id', adminPaymentDetail);

export default router;
