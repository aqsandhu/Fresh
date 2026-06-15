// ============================================================================
// WORK-AS-RIDER ROUTES (public). Mounted at /api/work-as-rider.
// Admin management lives under /api/admin/rider-applications + /api/admin/work-as-rider.
// ============================================================================

import { Router } from 'express';
import { optionalAuth } from '../middleware';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  getWorkAsRiderContent,
  submitRiderApplication,
} from '../controllers/riderApplication.controller';

const router = Router();

// Cap submissions to stop spam (public endpoint).
const applyLimiter = createRateLimiter(
  60 * 60 * 1000,
  10,
  'Too many applications submitted. Please try again later.'
);

router.get('/', getWorkAsRiderContent);
router.post('/apply', applyLimiter, optionalAuth, submitRiderApplication);

export default router;
