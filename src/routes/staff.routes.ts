import { Router } from 'express';
import {
  createRole,
  createStaff,
  listStaff,
  removeRole,
  removeStaff,
  updateStaff,
  updateStaffStatus,
} from '../controllers/staff.controller';
import { authenticate, authorize, requireActiveSubscription, validate } from '../middleware';
import { USER_ROLES } from '../utils/constants';
import {
  createRoleSchema,
  createStaffSchema,
  staffListQuerySchema,
  staffStatusSchema,
  updateStaffSchema,
} from '../validators/staff.validator';

const router = Router();

router.use(authenticate, authorize(USER_ROLES.ORG_ADMIN), requireActiveSubscription);

router.get('/', validate(staffListQuerySchema, 'query'), listStaff);
router.post('/roles', validate(createRoleSchema), createRole);
router.delete('/roles/:id', removeRole);
router.post('/', validate(createStaffSchema), createStaff);
router.patch('/:id/status', validate(staffStatusSchema), updateStaffStatus);
router.patch('/:id', validate(updateStaffSchema), updateStaff);
router.delete('/:id', removeStaff);

export default router;
