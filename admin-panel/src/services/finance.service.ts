import { api } from './api';
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
    return res.data;
  },
  addStockPurchase: async (d: {
    productId: string; purchasedAt?: string; rawWeight?: number; purchasePrice: number;
    gradeA?: number; gradeB?: number; gradeC?: number; waste?: number; comment?: string;
  }) => {
    const res = await api.post<ApiResponse<{ id: string }>>('/finance/stock-purchase', d);
    return res.data;
  },
  addRiderPayment: async (d: { riderId: string; category: 'salary' | 'commission' | 'other'; amount: number; comment?: string; forMonth?: string; paidAt?: string }) => {
    const res = await api.post<ApiResponse<{ id: string }>>('/finance/rider-payment', d);
    return res.data;
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
    return res.data;
  },
  getWorker: async (id: string): Promise<WorkerDetail> => {
    const res = await api.get<ApiResponse<WorkerDetail>>(`/finance/workers/${id}`);
    return res.data as WorkerDetail;
  },
  updateWorker: async (id: string, d: { name?: string; phone?: string; designation?: string; status?: 'active' | 'inactive' }) => {
    const res = await api.put<ApiResponse<{ id: string }>>(`/finance/workers/${id}`, d);
    return res.data;
  },
  getAttendance: async (id: string, month: number, year: number): Promise<{ date: string; status: string; note: string | null }[]> => {
    const res = await api.get<ApiResponse<any[]>>(`/finance/workers/${id}/attendance`, { month, year });
    return res.data || [];
  },
  markAttendance: async (id: string, d: { date: string; status: string; note?: string }) => {
    const res = await api.post<ApiResponse<any>>(`/finance/workers/${id}/attendance`, d);
    return res.data;
  },
  addIncrement: async (id: string, d: { effectiveFrom: string; newBasicSalary: number; note?: string }) => {
    const res = await api.post<ApiResponse<any>>(`/finance/workers/${id}/increment`, d);
    return res.data;
  },
  payWorker: async (id: string, d: { category: 'salary' | 'bonus' | 'commission' | 'other'; amount: number; comment?: string; forMonth?: string }) => {
    const res = await api.post<ApiResponse<{ id: string }>>(`/finance/workers/${id}/pay`, d);
    return res.data;
  },
};

export interface Worker {
  id: string; name: string; phone: string | null; designation: string | null;
  basicSalary: number; status: 'active' | 'inactive'; cityName: string | null; createdAt: string;
}
export interface WorkerDetail extends Worker {
  salaryChanges: { id: string; effectiveFrom: string; newBasicSalary: number; note: string | null; createdAt: string }[];
  payments: { id: string; category: string; amount: number; comment: string | null; forMonth: string | null; incurredAt: string }[];
}
