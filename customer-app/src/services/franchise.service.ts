import apiClient from './api';
import { ApiResponse } from '@app-types';

export interface FranchiseInquiryInput {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  message?: string;
}

export const franchiseService = {
  async submitInquiry(data: FranchiseInquiryInput): Promise<ApiResponse<{ id: string }>> {
    try {
      const res = await apiClient.post('/franchise/inquiries', data);
      return { success: true, data: res.data?.data || res.data };
    } catch (e: any) {
      return {
        success: false,
        message: e?.response?.data?.message || 'Could not submit. Please try again.',
      };
    }
  },
};

export default franchiseService;
