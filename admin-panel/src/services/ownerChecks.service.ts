import { api } from './api';
import type { ApiResponse } from '@/types';

/** One watchdog run (keys arrive camelCased by the api layer). */
export interface ReconciliationRun {
  id: string;
  runAt: string;
  windowFrom: string | null;
  anomalyCount: number;
  summary?: Record<string, any>;
}

export interface AuditLogRow {
  id: string;
  action: string;
  adminId: string | null;
  adminName: string | null;
  resource: string;
  resourceId: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  status: string;
  errorMessage: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export const ownerChecksService = {
  getWatchdog: async (): Promise<{ latest: ReconciliationRun | null; history: ReconciliationRun[] }> => {
    const res = await api.get<ApiResponse<{ latest: ReconciliationRun | null; history: ReconciliationRun[] }>>('/admin/reconciliation');
    return res.data || { latest: null, history: [] };
  },
  runWatchdog: async (): Promise<{ message: string }> => {
    const res = await api.post<ApiResponse<unknown>>('/admin/reconciliation/run', {});
    return { message: (res as any)?.message || 'Checks complete' };
  },
  getAuditLogs: async (f: { days?: number; resource?: string; q?: string }): Promise<AuditLogRow[]> => {
    const params: Record<string, unknown> = { days: f.days ?? 7 };
    if (f.resource) params.resource = f.resource;
    if (f.q?.trim()) params.q = f.q.trim();
    const res = await api.get<ApiResponse<AuditLogRow[]>>('/admin/audit-logs', params);
    return res.data || [];
  },
};
