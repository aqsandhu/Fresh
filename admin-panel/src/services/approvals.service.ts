import { api, unwrap } from './api';
import type { ApiResponse } from '@/types';

/** A staff entry waiting for (or decided by) the city admin — owner's decision J1. */
export interface ApprovalRequest {
  id: string;
  kind: string;
  label: string;
  value: number;
  status: 'pending' | 'approving' | 'approved' | 'rejected' | 'failed';
  requestedAt: string;
  requestedBy: string;
  requestedByName: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  note: string | null;
  cityName: string | null;
  details: string;
}

export const approvalsService = {
  list: async (status: 'pending' | 'approved' | 'rejected' | 'failed' = 'pending'): Promise<{ requests: ApprovalRequest[]; canDecide: boolean }> => {
    const res = await api.get<ApiResponse<{ requests: ApprovalRequest[]; canDecide: boolean }>>('/admin/approvals', { status });
    return res.data || { requests: [], canDecide: false };
  },
  approve: async (id: string) => unwrap(await api.post<ApiResponse<{ id: string }>>(`/admin/approvals/${id}/approve`, {})),
  reject: async (id: string, reason?: string) => unwrap(await api.post<ApiResponse<{ id: string }>>(`/admin/approvals/${id}/reject`, { reason })),
  approveAll: async (): Promise<{ approved: number; failed: { id: string; reason: string }[] }> => {
    const res = await api.post<ApiResponse<{ approved: number; failed: { id: string; reason: string }[] }>>('/admin/approvals/approve-all', {});
    return (res.data || { approved: 0, failed: [] }) as { approved: number; failed: { id: string; reason: string }[] };
  },
};
