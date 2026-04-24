// ============================================================================
// USER ROUTES (top-level /api/users)
// ============================================================================

import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import {
  authenticate,
  requireAdmin,
  adminRateLimiter,
} from '../middleware';

const router = Router();

// All user routes require admin authentication
router.use(authenticate);
router.use(requireAdmin);

// List all users
router.get('/', adminRateLimiter, adminController.getUsers);

export default router;
