// ============================================================================
// FINANCE ROUTES - /api/finance/*
// Admin-only, city-scoped, granular-permission guarded and audited.
// ============================================================================

import { NextFunction, Request, Response, Router } from 'express';
import {
  authenticate,
  requireAdmin,
  verifyAdminActive,
  attachCityScope,
  attachAdminPermissions,
  auditLogger,
  ForbiddenError,
} from '../middleware';
import * as expenses from '../controllers/finance/expenses.controller';
import * as workers from '../controllers/finance/workers.controller';
import * as profit from '../controllers/finance/profit.controller';
import { uploadSingle } from '../middleware/upload';
import { duplicateSubmitGuard } from '../middleware/duplicateSubmitGuard';

const router = Router();

// Whoever manages or pays shareholders must see the list they act on (G12).
const SHAREHOLDER_READ = ['finance.shareholders.view', 'finance.shareholders.manage', 'finance.shareholders.pay'];

function requireFinancePermission(codes: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const perms = req.adminPermissions ?? [];
    if (perms.includes('*') || codes.some((code) => perms.includes(code))) {
      return next();
    }
    next(new ForbiddenError('You do not have permission to perform this finance action'));
  };
}

router.use(authenticate);
router.use(requireAdmin);
router.use(verifyAdminActive);
router.use(attachAdminPermissions);
router.use(attachCityScope);
router.use(auditLogger());

// Expenses ledger + sources.
router.get('/expenses', requireFinancePermission(['finance.expenses.view']), expenses.listExpenses);
router.post('/expenses', requireFinancePermission(['finance.expenses.create']), duplicateSubmitGuard, expenses.createExpense);
// JSON, or multipart with the bill photo in 'bill_photo' (refused 503 if file storage is not set up).
router.post('/stock-purchase', requireFinancePermission(['finance.stock_purchase.create']), ...uploadSingle('bill_photo', 'purchases/bills'), duplicateSubmitGuard, expenses.createStockPurchase);
// Staff entries wait here for the city admin (J1).
router.get('/purchase-requests', requireFinancePermission(['finance.stock_purchase.create', 'finance.stock_purchase.approve']), expenses.listPurchaseRequests);
router.post('/purchase-requests/approve-all', requireFinancePermission(['finance.stock_purchase.approve']), expenses.approveAllPurchaseRequests);
router.post('/purchase-requests/:id/approve', requireFinancePermission(['finance.stock_purchase.approve']), expenses.approvePurchaseRequest);
router.post('/purchase-requests/:id/reject', requireFinancePermission(['finance.stock_purchase.approve']), expenses.rejectPurchaseRequest);
router.post('/rider-payment', requireFinancePermission(['finance.rider_payments.create']), duplicateSubmitGuard, expenses.createRiderPayment);
router.get('/products', requireFinancePermission(['finance.stock_purchase.create']), expenses.listFinanceProducts);
router.get('/riders', requireFinancePermission(['finance.rider_payments.create']), expenses.listFinanceRiders);

// Workers: profiles, attendance, increments, payments.
router.get('/workers', requireFinancePermission(['finance.workers.manage']), workers.listWorkers);
router.post('/workers', requireFinancePermission(['finance.workers.manage']), workers.createWorker);
router.get('/workers/:id', requireFinancePermission(['finance.workers.manage']), workers.getWorker);
router.put('/workers/:id', requireFinancePermission(['finance.workers.manage']), workers.updateWorker);
router.get('/workers/:id/attendance', requireFinancePermission(['finance.workers.manage']), workers.getWorkerAttendance);
router.post('/workers/:id/attendance', requireFinancePermission(['finance.workers.manage']), workers.markAttendance);
router.post('/workers/:id/increment', requireFinancePermission(['finance.workers.manage']), duplicateSubmitGuard, workers.addIncrement);
router.post('/workers/:id/pay', requireFinancePermission(['finance.workers.manage']), duplicateSubmitGuard, workers.payWorker);

// Profit + profit-sharing formula. Super-admin-only rules still apply in-controller.
// A payer needs the balances it pays from (G12).
router.get('/profit', requireFinancePermission(['finance.profit.view', 'finance.shareholders.pay']), profit.getProfit);
router.get('/profit-settings', requireFinancePermission(['finance.profit.view', 'finance.profit.manage']), profit.getProfitSettings);
router.put('/profit-settings', requireFinancePermission(['finance.profit.manage']), profit.updateProfitSettings);

// Shareholders. Super-admin-only rules still apply in-controller where needed.
router.get('/shareholders', requireFinancePermission(SHAREHOLDER_READ), profit.listShareholders);
router.post('/shareholders', requireFinancePermission(['finance.shareholders.manage']), profit.createShareholder);
router.get('/shareholders/:id/payouts', requireFinancePermission(SHAREHOLDER_READ), profit.getShareholderPayouts);
router.put('/shareholders/:id', requireFinancePermission(['finance.shareholders.manage', 'finance.shareholders.pay']), profit.updateShareholder);
router.post('/shareholders/:id/pay', requireFinancePermission(['finance.shareholders.pay']), duplicateSubmitGuard, profit.payShareholder);

export default router;
