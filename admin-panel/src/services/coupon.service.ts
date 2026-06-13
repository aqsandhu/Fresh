import { api } from './api';
import type { ApiResponse } from '@/types';

export type DiscountType = 'percentage' | 'fixed' | 'free_delivery';

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderAmount: number;
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  usedCount: number;
  firstOrderOnly: boolean;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  cityId: string | null;
  cityName: string | null;
  redemptionCount: number;
  summary: string;
}

export interface CouponInput {
  code: string;
  description?: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountAmount?: number | null;
  minOrderAmount?: number;
  usageLimit?: number | null;
  usageLimitPerUser?: number | null;
  firstOrderOnly?: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive?: boolean;
}

// The api layer converts camelCase <-> snake_case both ways, so we work in
// camelCase here and the backend receives snake_case.
export const couponService = {
  list: async (): Promise<Coupon[]> => {
    const res = await api.get<ApiResponse<Coupon[]>>('/admin/coupons');
    return (res.data as Coupon[]) || [];
  },

  create: async (data: CouponInput): Promise<Coupon> => {
    const res = await api.post<ApiResponse<Coupon>>('/admin/coupons', data);
    return res.data as Coupon;
  },

  update: async (id: string, data: CouponInput): Promise<Coupon> => {
    const res = await api.put<ApiResponse<Coupon>>(`/admin/coupons/${id}`, data);
    return res.data as Coupon;
  },

  toggle: async (id: string): Promise<Coupon> => {
    const res = await api.patch<ApiResponse<Coupon>>(`/admin/coupons/${id}/toggle`);
    return res.data as Coupon;
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/admin/coupons/${id}`);
  },
};
