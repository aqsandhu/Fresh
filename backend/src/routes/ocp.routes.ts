// ============================================================================
// OCP ROUTES (public login + OCP-authed operator endpoints). Mounted /api/ocp.
// Admin management of OCPs lives under /api/admin/ocp.
// ============================================================================

import { Router } from 'express';
import { createRateLimiter } from '../middleware/rateLimiter';
import { authenticateOcp } from '../middleware/ocpAuth';
import { loginOcp, getOcpMe } from '../controllers/ocp.controller';

const router = Router();

const loginLimiter = createRateLimiter(
  15 * 60 * 1000,
  20,
  'Too many login attempts. Please try again later.'
);

router.post('/login', loginLimiter, loginOcp);

// OCP-authed
router.get('/me', authenticateOcp, getOcpMe);

export default router;
