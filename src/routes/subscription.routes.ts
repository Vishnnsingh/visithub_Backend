import { Router } from 'express';
import {
  downloadInvoice,
  getSubscriptionStatus,
  listSubscriptionHistory,
  purchaseOrgSubscription,
} from '../controllers/subscription.controller';
import { authenticate, authorize, validate } from '../middleware';
import { ORG_WORKSPACE_ROLES, USER_ROLES } from '../utils/constants';
import { purchaseSubscriptionSchema } from '../validators/subscription.validator';

const router = Router();

router.use(authenticate, authorize(...ORG_WORKSPACE_ROLES));

router.get('/status', getSubscriptionStatus);
router.get('/history', listSubscriptionHistory);
router.get('/invoice/:id', downloadInvoice);
router.post(
  '/purchase',
  authorize(USER_ROLES.ORG_ADMIN),
  validate(purchaseSubscriptionSchema),
  purchaseOrgSubscription
);

export default router;
