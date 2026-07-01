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
  forMonth: string | null;
  incurredAt: string;
  cityName: string | null;
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
    const params: Record<string, any> = {};
    if (f.type) params.type = f.type;
    if (f.period) params.period = f.period;
    if (f.month) params.month = f.month;
    if (f.year) params.year = f.year;
    if (f.date) params.date = f.date;
    const res = await api.get<ApiResponse<ExpenseList>>('/finance/expenses', params);
    return (res.data || { expenses: [], total: 0, byType: {} }) as ExpenseList;
  },
  addExpense: async (d: { category: string; amount: number; comment?: string; incurredAt?: string }) => {
    const res = await api.post<ApiResponse<{ id: string }>>('/finance/expenses', d);
    return unwrap(res);
  },
  addStockPurchase: async (d: {
    productId: string; purchasedAt?: string; rawWeight?: number; purchasePrice: number;
    gradeA?: number; gradeB?: number; gradeC?: number; waste?: number; comment?: string;
  }) => {
    const res = await api.post<ApiResponse<{ id: string }>>('/finance/stock-purchase', d);
    return unwrap(res);
  },
  addRiderPayment: async (d: { riderId: string; category: 'salary' | 'commission' | 'other'; amount: number; comment?: string; forMonth?: string; paidAt?: string }) => {
    const res = await api.post<ApiResponse<{ id: string }>>('/finance/rider-payment', d);
    return unwrap(res);
  },
  products: async (): Promise<{ id: string; name: string; unitType: string; categoryName: string }[]> => {
    const res = await api.get<ApiResponse<any[]>>('/finance/products');
    return res.data || [];
  },
  riders: async (): Promise<{ id: string; name: string; status: string }[]> => {
    const res = await api.get<ApiResponse<any[]>>('/finance/riders');
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
    const res = await api.get<ApiResponse<any[]>>(`/finance/workers/${id}/attendance`, { month, year });
    return res.data || [];
  },
  markAttendance: async (id: string, d: { date: string; status: string; note?: string }) => {
    const res = await api.post<ApiResponse<any>>(`/finance/workers/${id}/attendance`, d);
    return unwrap(res);
  },
  addIncrement: async (id: string, d: { effectiveFrom: string; newBasicSalary: number; note?: string }) => {
    const res = await api.post<ApiResponse<any>>(`/finance/workers/${id}/increment`, d);
    return unwrap(res);
  },
  payWorker: async (id: string, d: { category: 'salary' | 'bonus' | 'commission' | 'other'; amount: number; comment?: string; forMonth?: string }) => {
    const res = await api.post<ApiResponse<{ id: string }>>(`/finance/workers/${id}/pay`, d);
    return unwrap(res);
  },

  // ── Profit + sharing + shareholders ─────────────────────────────────────────
  getProfit: async (f: ExpenseFilters = {}): Promise<ProfitData> => {
    const params: Record<string, any> = {};
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
    const res = await api.put<ApiResponse<any>>('/finance/profit-settings', d);
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
  payShareholder: async (id: string, d: { amount: number; note?: string }) => {
    const res = await api.post<ApiResponse<{ id: string }>>(`/finance/shareholders/${id}/pay`, d);
    return unwrap(res);
  },
  shareholderPayouts: async (id: string): Promise<{ id: string; amount: number; status: string; note: string | null; createdAt: string; receivedAt: string | null }[]> => {
    const res = await api.get<ApiResponse<any[]>>(`/finance/shareholders/${id}/payouts`);
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
  inventoryCost?: number; operatingExpenses?: number;
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
