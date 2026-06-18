// ============================================================================
// OCP ROUTES (public login + OCP-authed operator endpoints). Mounted /api/ocp.
// Admin management of OCPs lives under /api/admin/ocp.
// ============================================================================

import { Router } from 'express';
import { createRateLimiter } from '../middleware/rateLimiter';
import { authenticateOcp } from '../middleware/ocpAuth';
import {
  loginOcp,
  getOcpMe,
  getOcpOrders,
  getOcpOrderDetail,
  getOcpRiders,
  assignOcpRider,
  getOcpStockRequests,
  receiveStockRequest,
  getOcpStock,
  collectOcpPayment,
  getOcpSettlements,
  sendOcpSettlement,
} from '../controllers/ocp.controller';

const router = Router();

const loginLimiter = createRateLimiter(
  15 * 60 * 1000,
  20,
  'Too many login attempts. Please try again later.'
);

router.post('/login', loginLimiter, loginOcp);

// OCP-authed
router.get('/me', authenticateOcp, getOcpMe);
router.get('/orders', authenticateOcp, getOcpOrders);
router.get('/orders/:id', authenticateOcp, getOcpOrderDetail);
router.post('/orders/:id/assign-rider', authenticateOcp, assignOcpRider);
router.get('/riders', authenticateOcp, getOcpRiders);
router.get('/stock', authenticateOcp, getOcpStock);
router.get('/stock-requests', authenticateOcp, getOcpStockRequests);
router.post('/stock-requests/:id/receive', authenticateOcp, receiveStockRequest);
router.post('/orders/:id/collect', authenticateOcp, collectOcpPayment);
router.get('/settlements', authenticateOcp, getOcpSettlements);
router.post('/settlements', authenticateOcp, sendOcpSettlement);

export default router;
