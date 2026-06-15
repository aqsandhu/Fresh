import { api } from './api';
import type { ApiResponse } from '@/types';

export interface RiderApplication {
  id: string;
  fullName: string;
  phone: string;
  city: string | null;
  cityName: string | null;
  area: string | null;
  vehicleType: string | null;
  message: string | null;
  status: 'pending' | 'reviewing' | 'approved' | 'rejected';
  adminNotes: string | null;
  createdAt: string;
}

export interface WorkAsRiderContent {
  intro: string;
  benefits: string;
  hours: string;
  terms: string;
}

export const riderApplicationService = {
  list: async (status?: string): Promise<{ applications: RiderApplication[]; counts: Record<string, number> }> => {
    const res = await api.get<ApiResponse<{ applications: RiderApplication[]; counts: Record<string, number> }>>(
      '/admin/rider-applications',
      status ? { status } : undefined
    );
    const data = (res.data || {}) as Partial<{ applications: RiderApplication[]; counts: Record<string, number> }>;
    return { applications: data.applications || [], counts: data.counts || {} };
  },

  update: async (id: string, data: { status?: string; adminNotes?: string }): Promise<RiderApplication> => {
    const res = await api.put<ApiResponse<RiderApplication>>(`/admin/rider-applications/${id}`, data);
    return res.data as RiderApplication;
  },

  getContent: async (): Promise<WorkAsRiderContent> => {
    const res = await api.get<ApiResponse<WorkAsRiderContent>>('/work-as-rider');
    return res.data as WorkAsRiderContent;
  },

  updateContent: async (data: Partial<WorkAsRiderContent>): Promise<void> => {
    await api.put('/admin/work-as-rider', data);
  },
};
