// ============================================================================
// SHAREHOLDER PORTAL ROUTES — /api/shareholder/*
// Public login (rate-limited); everything else requires a valid, active
// shareholder session (isolated token).
// ============================================================================

import { Router } from 'express';
import { authRateLimiter, validate, shareholderSchemas } from '../middleware';
import { authenticateShareholder } from '../middleware/shareholderAuth';
import * as ctrl from '../controllers/shareholder.controller';

const router = Router();

router.post('/login', authRateLimiter, validate(shareholderSchemas.login), ctrl.loginShareholder);

router.use(authenticateShareholder);
router.get('/me', ctrl.getShareholderMe);
router.get('/dashboard', ctrl.getShareholderDashboard);
router.post('/payouts/:id/receive', ctrl.receivePayout);
router.post('/change-password', ctrl.changeShareholderPassword);

export default router;
