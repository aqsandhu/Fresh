// ============================================================================
// FEEDBACK SERVICE — reviews/ratings + complaints (Feature 3).
// ============================================================================

import apiClient, { handleApiError } from './api';
import { withCityParams } from '@/lib/apiHelpers';
import {
  ApiResponse,
  Review,
  ReviewTargetType,
  OrderReviewables,
  Complaint,
  ComplaintCategory,
} from '@app-types';

export interface SubmitReviewInput {
  targetType: ReviewTargetType;
  orderId: string;
  productId?: string;
  rating: number;
  comment?: string;
}

export interface FileComplaintInput {
  subject: string;
  message: string;
  category?: ComplaintCategory;
  orderId?: string;
}

class FeedbackService {
  // ── Reviews ───────────────────────────────────────────────────────────────

  async submitReview(input: SubmitReviewInput): Promise<ApiResponse<Review>> {
    try {
      const res = await apiClient.post('/reviews', {
        targetType: input.targetType,
        orderId: input.orderId,
        productId: input.productId,
        rating: input.rating,
        comment: input.comment,
      });
      return { success: true, data: res.data.data };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getOrderReviewables(orderId: string): Promise<ApiResponse<OrderReviewables>> {
    try {
      const res = await apiClient.get(`/reviews/order/${orderId}`);
      return { success: true, data: res.data.data };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getMyReviews(): Promise<ApiResponse<Review[]>> {
    try {
      const res = await apiClient.get('/reviews/mine');
      return { success: true, data: res.data.data || [] };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getProductReviews(
    productId: string
  ): Promise<ApiResponse<{ summary: { average: number; count: number }; reviews: Review[] }>> {
    try {
      const res = await apiClient.get(`/reviews/product/${productId}`);
      return { success: true, data: res.data.data };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  // ── Complaints ──────────────────────────────────────────────────────────────

  async fileComplaint(input: FileComplaintInput): Promise<ApiResponse<Complaint>> {
    try {
      // Pass city params so a general (no-order) complaint still routes to the
      // right city admin.
      const res = await apiClient.post('/complaints', input, { params: withCityParams() });
      return { success: true, data: res.data.data };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getMyComplaints(): Promise<ApiResponse<Complaint[]>> {
    try {
      const res = await apiClient.get('/complaints/mine');
      return { success: true, data: res.data.data || [] };
    } catch (error) {
      throw handleApiError(error);
    }
  }
}

export const feedbackService = new FeedbackService();
export default feedbackService;
