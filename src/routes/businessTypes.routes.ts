import { Router } from 'express';
import {
  clearAdminBusinessTypes,
  createAdminBusinessType,
  deleteAdminBusinessType,
  getAdminBusinessTypes,
  getPublicBusinessTypes,
  updateAdminBusinessType,
} from '../controllers/businessTypes.controller';
import { authenticateSuper } from '../middleware';

const router = Router();

router.get('/', getPublicBusinessTypes);
router.get('/admin', authenticateSuper, getAdminBusinessTypes);
router.post('/admin', authenticateSuper, createAdminBusinessType);
router.put('/admin', authenticateSuper, updateAdminBusinessType);
router.delete('/admin/all', authenticateSuper, clearAdminBusinessTypes);
router.delete('/admin', authenticateSuper, deleteAdminBusinessType);

export default router;
