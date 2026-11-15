import { api } from './api';
import type { ApiResponse } from '@/types';

export interface ApprovalCode {
  code: string;
  expiresAt: string;
  validSeconds: number;
  maxWrongTries: number;
}

export interface ApprovalCodeUse {
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedFor: string | null;
  usedByName: string | null;
  attempts: number;
}

/** Second-admin approval from the approver's OWN device (see backend utils/adminApproval.ts). */
export const approvalCodeService = {
  create: async (): Promise<ApprovalCode> => {
    const res = await api.post<ApiResponse<ApprovalCode>>('/admin/approval-codes', {});
    if (!res.data?.code) throw new Error(res.message || 'Could not create a code');
    return res.data;
  },
  mine: async (): Promise<ApprovalCodeUse[]> => {
    const res = await api.get<ApiResponse<{ codes: ApprovalCodeUse[] }>>('/admin/approval-codes');
    return res.data?.codes || [];
  },
};
