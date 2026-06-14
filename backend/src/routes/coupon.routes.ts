// ============================================================================
// CUSTOMER COUPON ROUTES — "My Coupons" (auto-granted welcome-back / milestone)
// Mounted at /api/coupons. Admin coupon CRUD lives under /api/admin/coupons.
// ============================================================================

import { Router } from 'express';
import { authenticate, verifyUserActive } from '../middleware';
import { getMyCoupons, markMyCouponsSeen } from '../controllers/coupon.controller';

const router = Router();

router.use(authenticate);
router.use(verifyUserActive);

router.get('/mine', getMyCoupons);
router.patch('/mine/seen', markMyCouponsSeen);

export default router;
