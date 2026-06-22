// ============================================================================
// FRANCHISE ROUTES — public lead capture (admin triage lives under /api/admin)
// ============================================================================

import { Router } from 'express';
import { createRateLimiter } from '../middleware/rateLimiter';
import { submitFranchiseInquiry } from '../controllers/franchise.controller';

const router = Router();

// Public form — cap submissions to stop spam / DB bloat.
const franchiseLimiter = createRateLimiter(
  60 * 60 * 1000,
  10,
  'Too many inquiries submitted. Please try again later.'
);

router.post('/inquiries', franchiseLimiter, submitFranchiseInquiry);

export default router;
