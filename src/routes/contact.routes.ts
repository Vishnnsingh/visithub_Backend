import { Router } from 'express';
import {
  getPublicContactInfo,
  listAdminContacts,
  submitContact,
  updateAdminContactInfo,
} from '../controllers/contact.controller';
import { authenticateSuper, validate } from '../middleware';
import { createContactSchema, updateContactInfoSchema } from '../validators/contact.validator';

const router = Router();

router.get('/info', getPublicContactInfo);
router.put('/info', authenticateSuper, validate(updateContactInfoSchema), updateAdminContactInfo);

router.post('/', validate(createContactSchema), submitContact);
router.get('/', authenticateSuper, listAdminContacts);

export default router;
