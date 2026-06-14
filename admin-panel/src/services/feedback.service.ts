import { api } from './api';
import type { ApiResponse } from '@/types';

// ── Reviews ───────────────────────────────────────────────────────────────────

export type ReviewTargetType = 'product' | 'rider' | 'service';

export interface AdminReview {
  id: string;
  targetType: ReviewTargetType;
  productId: string | null;
  riderId: string | null;
  orderId: string | null;
  rating: number;
  comment: string | null;
  isPublished: boolean;
  adminReply: string | null;
  productName: string | null;
  orderNumber: string | null;
  authorName: string | null;
  riderName: string | null;
  createdAt: string;
}

export interface ReviewListResult {
  reviews: AdminReview[];
  counts: Record<string, number>;
}

// ── Complaints ────────────────────────────────────────────────────────────────

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type ComplaintPriority = 'low' | 'normal' | 'high';

export interface AdminComplaint {
  id: string;
  ticketNumber: string;
  orderId: string | null;
  orderNumber: string | null;
  riderId: string | null;
  category: string;
  subject: string;
  message: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  adminResponse: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customerName: string | null;
  customerPhone: string | null;
  cityName: string | null;
}

export interface ComplaintListResult {
  complaints: AdminComplaint[];
  counts: Record<string, number>;
}

// The api layer converts camelCase <-> snake_case both ways.
export const feedbackService = {
  // Reviews
  listReviews: async (targetType?: ReviewTargetType): Promise<ReviewListResult> => {
    const params = targetType ? { targetType } : undefined;
    const res = await api.get<ApiResponse<ReviewListResult>>('/admin/reviews', params);
    const data = (res.data || {}) as Partial<ReviewListResult>;
    return { reviews: data.reviews || [], counts: data.counts || {} };
  },

  updateReview: async (
    id: string,
    data: { isPublished?: boolean; adminReply?: string | null }
  ): Promise<AdminReview> => {
    const res = await api.put<ApiResponse<AdminReview>>(`/admin/reviews/${id}`, data);
    return res.data as AdminReview;
  },

  // Complaints
  listComplaints: async (status?: ComplaintStatus | ''): Promise<ComplaintListResult> => {
    const params = status ? { status } : undefined;
    const res = await api.get<ApiResponse<ComplaintListResult>>('/admin/complaints', params);
    const data = (res.data || {}) as Partial<ComplaintListResult>;
    return { complaints: data.complaints || [], counts: data.counts || {} };
  },

  updateComplaint: async (
    id: string,
    data: { status?: ComplaintStatus; adminResponse?: string | null; priority?: ComplaintPriority }
  ): Promise<AdminComplaint> => {
    const res = await api.put<ApiResponse<AdminComplaint>>(`/admin/complaints/${id}`, data);
    return res.data as AdminComplaint;
  },
};
