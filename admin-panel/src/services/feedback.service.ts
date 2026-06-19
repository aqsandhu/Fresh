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
  images: string[] | null;
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

  // Full complaint detail incl. refund context (paid/refunded/refundable + history).
  getComplaint: async (id: string): Promise<AdminComplaint & { order?: ComplaintOrderRefund | null }> => {
    const res = await api.get<ApiResponse<AdminComplaint & { order?: ComplaintOrderRefund | null }>>(`/admin/complaints/${id}`);
    return res.data as AdminComplaint & { order?: ComplaintOrderRefund | null };
  },

  // Record an admin refund against the complained order (admin account; OCP untouched).
  refundComplaint: async (id: string, data: { amount: number; source: 'admin' | 'ocp'; note?: string }) => {
    const res = await api.post<ApiResponse<{ id: string; amount: number; source: string }>>(`/admin/complaints/${id}/refund`, data);
    return res.data;
  },
};

export interface ComplaintOrderRefund {
  totalAmount: number;
  paidAmount: number;
  refundedTotal: number;
  refundable: number;
  refunds: { id: string; amount: number; source: string; note?: string | null; createdAt: string }[];
}
