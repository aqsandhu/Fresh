// ============================================================================
// FINANCE ROUTES — /api/finance/*
// Admin-only (role gate via requireAdmin; super_admin + city admin). City scope
// is resolved per-request from the user/role (+ x-city-id for super_admin), so
// these stay isolated from the central admin permission map. Super-admin-only
// actions (profit-sharing formula, shareholder creation) are gated inside the
// controllers.
// ============================================================================

import { Router } from 'express';
import { authenticate, requireAdmin, verifyAdminActive, attachCityScope } from '../middleware';
import * as expenses from '../controllers/finance/expenses.controller';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);
router.use(verifyAdminActive);
router.use(attachCityScope);

// Expenses ledger + sources
router.get('/expenses', expenses.listExpenses);
router.post('/expenses', expenses.createExpense);
router.post('/stock-purchase', expenses.createStockPurchase);
router.post('/rider-payment', expenses.createRiderPayment);
router.get('/products', expenses.listFinanceProducts);
router.get('/riders', expenses.listFinanceRiders);

export default router;
