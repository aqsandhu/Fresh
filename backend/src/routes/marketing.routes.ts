// ============================================================================
// MARKETING ROUTES — public cart snapshot (admin tooling under /api/admin)
// ============================================================================

import { Router } from 'express';
import { optionalAuth } from '../middleware';
import { createRateLimiter } from '../middleware/rateLimiter';
import { snapshotCart } from '../controllers/marketing.controller';

const router = Router();

// Snapshots fire on cart changes — allow a healthy rate but cap abuse per IP.
const snapshotLimiter = createRateLimiter(
  60 * 1000,
  40,
  'Too many requests. Please slow down.'
);

// optionalAuth attaches req.user when a valid token is present (anonymous OK).
router.post('/cart-snapshot', snapshotLimiter, optionalAuth, snapshotCart);

export default router;
