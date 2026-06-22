import { api } from './api';
import type { ApiResponse } from '@/types';

export interface FranchiseInquiry {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  message: string | null;
  status: 'new' | 'contacted' | 'closed';
  createdAt: string;
}

export const franchiseService = {
  list: async (status?: string): Promise<FranchiseInquiry[]> => {
    const res = await api.get<ApiResponse<FranchiseInquiry[]>>(
      '/admin/franchise-inquiries',
      status ? { status } : undefined
    );
    return res.data;
  },
  updateStatus: async (id: string, status: string): Promise<void> => {
    await api.put(`/admin/franchise-inquiries/${id}`, { status });
  },
};
