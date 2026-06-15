// ============================================================================
// COMPLAINT ROUTES — customer complaint tickets.
// Mounted at /api/complaints. Admin triage lives under /api/admin/complaints.
// ============================================================================

import { Router } from 'express';
import { authenticate, verifyUserActive, uploadMultiple } from '../middleware';
import { createRateLimiter } from '../middleware/rateLimiter';
import { fileComplaint, getMyComplaints } from '../controllers/complaint.controller';

const router = Router();

// Filing a complaint creates a DB row + a ticket — cap it to stop an authed
// user from scripting thousands of tickets (abuse / DB bloat).
const complaintWriteLimiter = createRateLimiter(
  60 * 60 * 1000,
  20,
  'Too many complaints submitted. Please try again later.'
);

router.use(authenticate);

router.get('/mine', getMyComplaints);
router.post(
  '/',
  complaintWriteLimiter,
  verifyUserActive,
  uploadMultiple('images', 5, 'complaints'),
  fileComplaint
);

export default router;
