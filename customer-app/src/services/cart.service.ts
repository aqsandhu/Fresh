import { StoreCartItem } from '@app-types';
import { withCityParams } from '@/lib/apiHelpers';
import { getSelectedCityId } from '@/lib/cityStorage';
import { getStoredToken } from '@/lib/secureTokens';
import apiClient, { handleApiError } from './api';
import { ApiResponse } from '@app-types';

export interface MyCoupon {
  code: string;
  description?: string | null;
  discount_type: 'percentage' | 'fixed' | 'free_delivery';
  min_order_amount: number;
  trigger_type?: 'manual' | 'welcome_back' | 'order_milestone';
  source?: string;
  seen: boolean;
  summary: string;
}

/**
 * Backend cart API. The LOCAL cart — its items and persistence — lives entirely
 * in `cartStore`, the single source of truth. This service never reads or writes
 * a local cart, so the two can't diverge: every method either pushes the store's
 * items to the server or talks to a server-only resource (coupons, clear).
 */
class CartService {
  private syncInProgress = false;
  private pendingItems: StoreCartItem[] | null = null;
  private pendingCityId: string | null = null;

  private async hasAuthToken(): Promise<boolean> {
    const token = await getStoredToken();
    return !!token;
  }

  /**
   * Replace the server cart with `items` (the store's current cart) in ONE
   * request. Concurrency-safe: if a sync is already running, the latest snapshot
   * is queued and flushed when it finishes — so no edit is lost and a merely
   * queued call isn't reported as a failure.
   */
  async syncCartWithBackend(items: StoreCartItem[], cityId?: string | null): Promise<boolean> {
    if (!(await this.hasAuthToken())) return true;

    if (this.syncInProgress) {
      this.pendingItems = items;
      this.pendingCityId = cityId ?? this.pendingCityId;
      return true;
    }

    // Backend requires city_id (Joi: commonSchemas.uuid.required()) — never
    // send a sync without it, and never sync an empty items array (min(1));
    // empty carts go through DELETE /cart/clear instead.
    const resolvedCityId = cityId || (await getSelectedCityId());
    if (!resolvedCityId || items.length === 0) return false;

    this.syncInProgress = true;
    try {
      await apiClient.post('/cart/sync', {
        city_id: resolvedCityId,
        items: items.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit: item.unit || 'full',
          quality: item.quality || 'A',
        })),
      });
      return true;
    } catch {
      return false;
    } finally {
      this.syncInProgress = false;
      // A newer snapshot arrived mid-sync — flush it so the server isn't stale.
      if (this.pendingItems) {
        const next = this.pendingItems;
        const nextCityId = this.pendingCityId;
        this.pendingItems = null;
        this.pendingCityId = null;
        this.syncCartWithBackend(next, nextCityId).catch(() => {});
      }
    }
  }

  async clearBackendCart(): Promise<boolean> {
    if (!(await this.hasAuthToken())) return true;
    try {
      const response = await apiClient.delete<ApiResponse<{ message: string }>>('/cart/clear');
      return response.data.success;
    } catch {
      return false;
    }
  }

  /**
   * Apply a coupon to the server cart. The caller MUST sync the current cart
   * first (e.g. `useCartStore.getState().syncWithBackend()`) so the coupon
   * validates against the live subtotal. Throws (handleApiError) on an invalid
   * coupon so the caller can show the reason.
   */
  async applyCoupon(code: string): Promise<{
    code: string;
    description?: string | null;
    discount_type: 'percentage' | 'fixed' | 'free_delivery';
    discount_amount: number;
    free_delivery: boolean;
    summary: string;
  }> {
    try {
      const response = await apiClient.post('/cart/apply-coupon', { code });
      return response.data?.data || response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async removeCoupon(): Promise<void> {
    try {
      await apiClient.delete('/cart/remove-coupon');
    } catch {
      /* best-effort — caller clears local state regardless */
    }
  }

  /**
   * Customer's auto-granted coupons. Fetching also evaluates fresh eligibility
   * (welcome-back / milestone), so new coupons get granted + notified.
   */
  async getMyCoupons(): Promise<{ coupons: MyCoupon[]; unseen: MyCoupon[] }> {
    try {
      const res = await apiClient.get('/coupons/mine', { params: withCityParams() });
      const data = res.data?.data || res.data || {};
      return { coupons: data.coupons || [], unseen: data.unseen || [] };
    } catch {
      return { coupons: [], unseen: [] };
    }
  }

  async markCouponsSeen(): Promise<void> {
    try {
      await apiClient.patch('/coupons/mine/seen');
    } catch {
      /* best-effort */
    }
  }
}

export const cartService = new CartService();
export default cartService;
