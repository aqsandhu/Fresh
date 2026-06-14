// ============================================================================
// COMPLAINT ROUTES — customer complaint tickets.
// Mounted at /api/complaints. Admin triage lives under /api/admin/complaints.
// ============================================================================

import { Router } from 'express';
import { authenticate, verifyUserActive } from '../middleware';
import { fileComplaint, getMyComplaints } from '../controllers/complaint.controller';

const router = Router();

router.use(authenticate);

router.get('/mine', getMyComplaints);
router.post('/', verifyUserActive, fileComplaint);

export default router;
