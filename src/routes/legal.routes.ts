import { Router } from 'express';
import {
  deleteAdminLegalPage,
  getPublicLegalPage,
  listAdminLegalPages,
  updateAdminLegalPage,
} from '../controllers/legal.controller';
import { authenticateSuper } from '../middleware';

const router = Router();

router.get('/admin/list', authenticateSuper, listAdminLegalPages);
router.put('/admin/:slug', authenticateSuper, updateAdminLegalPage);
router.delete('/admin/:slug', authenticateSuper, deleteAdminLegalPage);
router.get('/:slug', getPublicLegalPage);

export default router;
