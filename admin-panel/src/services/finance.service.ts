import { api, unwrap } from './api';
import type { ApiResponse } from '@/types';

export interface ExpenseRow {
  id: string;
  type: 'stock_purchase' | 'rider_payment' | 'worker_payment' | 'other';
  category: string | null;
  amount: number;
  comment: string | null;
  refType: string | null;
  refLabel: string | null;
  /** Stock purchases: who it was bought from, and the bill. */
  supplierName?: string | null;
  billNumber?: string | null;
  billPhotoUrl?: string | null;
  forMonth: string | null;
  incurredAt: string;
  cityName: string | null;
}
/** A purchase entered by staff, waiting for the city admin (J1). */
export interface PurchaseRequest {
  id: string;
  productId: string;
  productName: string | null;
  payload: {
    rawWeight: number; purchasePrice: number; gradeA: number; gradeB: number; gradeC: number; waste: number;
    supplierName: string; supplierPhone: string | null; billNumber: string | null;
  };
  billPhotoUrl: string | null;
  requestedAt: string;
  requestedByName: string | null;
}

export interface ExpenseList {
  expenses: ExpenseRow[];
  total: number;
  byType: Record<string, number>;
}
export interface ExpenseFilters {
  type?: string;
  period?: 'today' | 'month' | '';
  month?: number;
  year?: number;
  date?: string;
}

export const financeService = {
  // ── Expenses ───────────────────────────────────────────────────────────────
  listExpenses: async (f: ExpenseFilters = {}): Promise<ExpenseList> => {
    const params: Record<string, unknown> = {};
    if (f.type) params.type = f.type;
    if (f.period) params.period = f.period;
    if (f.month) params.month = f.month;
    if (f.year) params.year = f.year;
    if (f.date) params.date = f.date;
    const res = await api.get<ApiResponse<ExpenseList>>('/finance/expenses', params);
    return (res.data || { expenses: [], total: 0, byType: {} }) as ExpenseList;
  },
  addExpense: async (d: { category: string; amount: number; comment?: string; incurredAt?: string; approvalPhone?: string; approvalPassword?: string }) => {
    const res = await api.post<ApiResponse<{ id: string }>>('/finance/expenses', d);
    return unwrap(res);
  },
  addStockPurchase: async (d: {
    productId: string; purchasedAt?: string; rawWeight?: number; purchasePrice: number;
    gradeA?: number; gradeB?: number; gradeC?: number; waste?: number; comment?: string;
    supplierName: string; supplierPhone?: string; billNumber?: string; billPhoto?: File | null;
  }) => {
    const { billPhoto, ...fields } = d;
    if (!billPhoto) {
      const res = await api.post<ApiResponse<{ id: string }>>('/finance/stock-purchase', fields);
      return unwrap(res);
    }
    // With the bill photo: multipart (keys are sent as the API names them).
    const snake: Record<string, string> = {
      productId: 'product_id', purchasedAt: 'purchased_at', rawWeight: 'raw_weight', purchasePrice: 'purchase_price',
      gradeA: 'grade_a', gradeB: 'grade_b', gradeC: 'grade_c', waste: 'waste', comment: 'comment',
      supplierName: 'supplier_name', supplierPhone: 'supplier_phone', billNumber: 'bill_number',
    };
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null && v !== '') form.append(snake[k] || k, String(v));
    }
    form.append('bill_photo', billPhoto);
    const res = await api.postForm<ApiResponse<{ id: string }>>('/finance/stock-purchase', form);
    return unwrap(res);
  },
  purchaseRequests: async (): Promise<{ requests: PurchaseRequest[]; canApprove: boolean }> => {
    const res = await api.get<ApiResponse<{ requests: PurchaseRequest[]; canApprove: boolean }>>('/finance/purchase-requests');
    return res.data || { requests: [], canApprove: false };
  },
  approvePurchase: async (id: string) => unwrap(await api.post<ApiResponse<{ id: string }>>(`/finance/purchase-requests/${id}/approve`, {})),
  rejectPurchase: async (id: string, reason?: string) => unwrap(await api.post<ApiResponse<{ id: string }>>(`/finance/purchase-requests/${id}/reject`, { reason })),
  approveAllPurchases: async (): Promise<{ approved: number; skipped: { id: string; reason: string }[] }> => {
    const res = await api.post<ApiResponse<{ approved: number; skipped: { id: string; reason: string }[] }>>('/finance/purchase-requests/approve-all', {});
    return res.data as { approved: number; skipped: { id: string; reason: string }[] };
  },
  addRiderPayment: async (d: { riderId: string; category: 'salary' | 'commission' | 'other'; amount: number; comment?: string; forMonth?: string; paidAt?: string; approvalPhone?: string; approvalPassword?: string }) => {
    const res = await api.post<ApiResponse<{ id: string }>>('/finance/rider-payment', d);
    return unwrap(res);
  },
  products: async (): Promise<{ id: string; name: string; unitType: string; categoryName: string }[]> => {
    const res = await api.get<ApiResponse<{ id: string; name: string; unitType: string; categoryName: string }[]>>('/finance/products');
    return res.data || [];
  },
  riders: async (): Promise<{ id: string; name: string; status: string }[]> => {
    const res = await api.get<ApiResponse<{ id: string; name: string; status: string }[]>>('/finance/riders');
    return res.data || [];
  },

  // ── Workers ─────────────────────────────────────────────────────────────────
  listWorkers: async (): Promise<Worker[]> => {
    const res = await api.get<ApiResponse<Worker[]>>('/finance/workers');
    return res.data || [];
  },
  createWorker: async (d: { name: string; phone?: string; designation?: string; basicSalary?: number }) => {
    const res = await api.post<ApiResponse<{ id: string }>>('/finance/workers', d);
    return unwrap(res);
  },
  getWorker: async (id: string): Promise<WorkerDetail> => {
    const res = await api.get<ApiResponse<WorkerDetail>>(`/finance/workers/${id}`);
    return res.data as WorkerDetail;
  },
  updateWorker: async (id: string, d: { name?: string; phone?: string; designation?: string; status?: 'active' | 'inactive' }) => {
    const res = await api.put<ApiResponse<{ id: string }>>(`/finance/workers/${id}`, d);
    return unwrap(res);
  },
  getAttendance: async (id: string, month: number, year: number): Promise<{ date: string; status: string; note: string | null }[]> => {
    const res = await api.get<ApiResponse<{ date: string; status: string; note: string | null }[]>>(`/finance/workers/${id}/attendance`, { month, year });
    return res.data || [];
  },
  markAttendance: async (id: string, d: { date: string; status: string; note?: string }) => {
    const res = await api.post<ApiResponse<unknown>>(`/finance/workers/${id}/attendance`, d);
    return unwrap(res);
  },
  addIncrement: async (id: string, d: { effectiveFrom: string; newBasicSalary: number; note?: string }) => {
    const res = await api.post<ApiResponse<unknown>>(`/finance/workers/${id}/increment`, d);
    return unwrap(res);
  },
  payWorker: async (id: string, d: { category: 'salary' | 'bonus' | 'commission' | 'other'; amount: number; comment?: string; forMonth?: string; approvalPhone?: string; approvalPassword?: string }) => {
    const res = await api.post<ApiResponse<{ id: string }>>(`/finance/workers/${id}/pay`, d);
    return unwrap(res);
  },

  // ── Profit + sharing + shareholders ─────────────────────────────────────────
  getProfit: async (f: ExpenseFilters = {}): Promise<ProfitData> => {
    const params: Record<string, unknown> = {};
    if (f.period) params.period = f.period;
    if (f.month) params.month = f.month;
    if (f.year) params.year = f.year;
    if (f.date) params.date = f.date;
    const res = await api.get<ApiResponse<ProfitData>>('/finance/profit', params);
    return res.data as ProfitData;
  },
  getProfitSettings: async (): Promise<ProfitSettingsData> => {
    const res = await api.get<ApiResponse<ProfitSettingsData>>('/finance/profit-settings');
    return res.data as ProfitSettingsData;
  },
  updateProfitSettings: async (d: { enabled: boolean; mode: string; perOrder: number; marginPercent: number; categoryShares: { categoryId: string; percent: number }[] }) => {
    const res = await api.put<ApiResponse<unknown>>('/finance/profit-settings', d);
    return unwrap(res);
  },
  listShareholders: async (): Promise<ShareholdersData> => {
    const res = await api.get<ApiResponse<ShareholdersData>>('/finance/shareholders');
    return res.data as ShareholdersData;
  },
  createShareholder: async (d: { name: string; email: string; password: string; sharePercent: number }) => {
    const res = await api.post<ApiResponse<{ id: string }>>('/finance/shareholders', d);
    return unwrap(res);
  },
  updateShareholder: async (id: string, d: { name?: string; sharePercent?: number; password?: string; status?: 'active' | 'inactive' }) => {
    const res = await api.put<ApiResponse<{ id: string }>>(`/finance/shareholders/${id}`, d);
    return unwrap(res);
  },
  payShareholder: async (id: string, d: { amount: number; note?: string }, period: ExpenseFilters = {}) => {
    // Same period params as getProfit so the backend's balance cap matches
    // the balance the admin is looking at.
    const q = new URLSearchParams();
    if (period.period) q.set('period', String(period.period));
    if (period.month) q.set('month', String(period.month));
    if (period.year) q.set('year', String(period.year));
    if (period.date) q.set('date', String(period.date));
    const qs = q.toString();
    const res = await api.post<ApiResponse<{ id: string }>>(`/finance/shareholders/${id}/pay${qs ? `?${qs}` : ''}`, d);
    return unwrap(res);
  },
  shareholderPayouts: async (id: string): Promise<{ id: string; amount: number; status: string; note: string | null; createdAt: string; receivedAt: string | null; periodStart: string | null; periodEnd: string | null }[]> => {
    const res = await api.get<ApiResponse<{ id: string; amount: number; status: string; note: string | null; createdAt: string; receivedAt: string | null; periodStart: string | null; periodEnd: string | null }[]>>(`/finance/shareholders/${id}/payouts`);
    return res.data || [];
  },
};

export interface ProfitShareholder {
  id: string; name: string; email: string; status: string;
  sharePercent: number; share: number; received: number; pending: number; balance: number;
}
export interface ProfitData {
  needsCity: boolean; ready?: boolean;
  totalSale?: number; orderCount?: number; totalExpenses?: number; profit?: number;
  inventoryCost?: number; operatingExpenses?: number; refunds?: number;
  /** Σ per-order rider pay on delivered orders — counted automatically. */
  riderDeliveryPay?: number;
  freshbazarShare?: number; distributable?: number;
  settings?: { enabled: boolean; mode: string; perOrder: number; marginPercent: number };
  shareholders?: ProfitShareholder[];
}
export interface ProfitSettingsData {
  needsCity: boolean; canEdit?: boolean;
  settings?: { enabled: boolean; mode: string; perOrder: number; marginPercent: number };
  categoryShares?: { categoryId: string; categoryName: string; percent: number }[];
}
export interface ShareholderRow {
  id: string; name: string; email: string; sharePercent: number; status: string;
  lastLoginAt: string | null; receivedTotal: number; pendingTotal: number;
}
export interface ShareholdersData { needsCity: boolean; canManage?: boolean; shareholders: ShareholderRow[] }

export interface Worker {
  id: string; name: string; phone: string | null; designation: string | null;
  basicSalary: number; status: 'active' | 'inactive'; cityName: string | null; createdAt: string;
}
export interface WorkerDetail extends Worker {
  salaryChanges: { id: string; effectiveFrom: string; newBasicSalary: number; note: string | null; createdAt: string }[];
  payments: { id: string; category: string; amount: number; comment: string | null; forMonth: string | null; incurredAt: string }[];
}
