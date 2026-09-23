import { Router } from 'express';
import {
  createAdminPlan,
  getAdminBusinessTypePricing,
  getAdminCustomPlanSettings,
  getAdminInvoiceSettings,
  getPublicCustomPlanSettings,
  listAdminPlans,
  listPublicPlans,
  removeAdminPlan,
  updateAdminBusinessTypePricing,
  updateAdminCustomPlanSettings,
  updateAdminInvoiceSettings,
  updateAdminPlan,
} from '../controllers/plans.controller';
import { authenticateSuper, validate } from '../middleware';
import {
  createPlanSchema,
  customPlanSettingsSchema,
  invoiceSettingsSchema,
  updatePlanSchema,
} from '../validators/plans.validator';

const router = Router();

router.get('/', listPublicPlans);
router.get('/custom-settings', getPublicCustomPlanSettings);

router.get('/admin', authenticateSuper, listAdminPlans);
router.post('/admin', authenticateSuper, validate(createPlanSchema), createAdminPlan);
router.patch('/admin/:id', authenticateSuper, validate(updatePlanSchema), updateAdminPlan);
router.delete('/admin/:id', authenticateSuper, removeAdminPlan);

router.get('/invoice-settings', authenticateSuper, getAdminInvoiceSettings);
router.put(
  '/invoice-settings',
  authenticateSuper,
  validate(invoiceSettingsSchema),
  updateAdminInvoiceSettings
);

router.get('/admin/custom-settings', authenticateSuper, getAdminCustomPlanSettings);
router.put(
  '/admin/custom-settings',
  authenticateSuper,
  validate(customPlanSettingsSchema),
  updateAdminCustomPlanSettings
);

router.get('/admin/business-type-pricing', authenticateSuper, getAdminBusinessTypePricing);
router.put('/admin/business-type-pricing', authenticateSuper, updateAdminBusinessTypePricing);

export default router;
