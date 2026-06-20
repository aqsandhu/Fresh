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
import * as workers from '../controllers/finance/workers.controller';
import * as profit from '../controllers/finance/profit.controller';

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

// Workers — profiles, attendance, increments, payments (logged as expenses)
router.get('/workers', workers.listWorkers);
router.post('/workers', workers.createWorker);
router.get('/workers/:id', workers.getWorker);
router.put('/workers/:id', workers.updateWorker);
router.get('/workers/:id/attendance', workers.getWorkerAttendance);
router.post('/workers/:id/attendance', workers.markAttendance);
router.post('/workers/:id/increment', workers.addIncrement);
router.post('/workers/:id/pay', workers.payWorker);

// Profit + profit-sharing formula (formula write = super-admin, enforced inline)
router.get('/profit', profit.getProfit);
router.get('/profit-settings', profit.getProfitSettings);
router.put('/profit-settings', profit.updateProfitSettings);

// Shareholders (create/edit-share = super-admin; status + pay = any admin)
router.get('/shareholders', profit.listShareholders);
router.post('/shareholders', profit.createShareholder);
router.get('/shareholders/:id/payouts', profit.getShareholderPayouts);
router.put('/shareholders/:id', profit.updateShareholder);
router.post('/shareholders/:id/pay', profit.payShareholder);

export default router;
