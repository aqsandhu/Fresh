import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProductUnit, ProductQuality, StoreCartItem, StoreProduct } from '@app-types';
import { STORAGE_KEYS } from '@utils/constants';
import { getStoredToken } from '@/lib/secureTokens';
import { withCityParams } from '@/lib/apiHelpers';
import { getSelectedCityId } from '@/lib/cityStorage';
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

const lineKey = (productId: string, unit: ProductUnit = 'full', quality: ProductQuality = 'A') =>
  `${productId}::${unit}::${quality}`;

class CartService {
  private syncInProgress = false;
  private pendingSync = false;

  private async hasAuthToken(): Promise<boolean> {
    const token = await getStoredToken();
    return !!token;
  }

  async getCart(): Promise<StoreCartItem[]> {
    try {
      const cartJson = await AsyncStorage.getItem(STORAGE_KEYS.CART);
      return cartJson ? JSON.parse(cartJson) : [];
    } catch {
      return [];
    }
  }

  async saveCart(cart: StoreCartItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
    } catch (error) {
      console.error('Error saving cart:', error);
    }
  }

  async addToCart(
    product: StoreProduct,
    quantity: number = 1,
    unit: ProductUnit = 'full',
    quality: ProductQuality = 'A'
  ): Promise<StoreCartItem[]> {
    const cart = await this.getCart();
    const existingItemIndex = cart.findIndex(
      (item) => lineKey(item.product.id, item.unit || 'full', item.quality || 'A') === lineKey(product.id, unit, quality)
    );

    if (existingItemIndex >= 0) {
      cart[existingItemIndex].quantity += quantity;
    } else {
      cart.push({ product, quantity, unit, quality });
    }

    await this.saveCart(cart);
    this.syncCartWithBackend(cart).catch(() => {});
    return cart;
  }

  async updateQuantity(
    productId: string,
    quantity: number,
    unit: ProductUnit = 'full',
    quality: ProductQuality = 'A'
  ): Promise<StoreCartItem[]> {
    const cart = await this.getCart();
    const itemIndex = cart.findIndex(
      (item) => lineKey(item.product.id, item.unit || 'full', item.quality || 'A') === lineKey(productId, unit, quality)
    );

    if (itemIndex >= 0) {
      if (quantity <= 0) {
        cart.splice(itemIndex, 1);
      } else {
        cart[itemIndex].quantity = quantity;
      }
    }

    await this.saveCart(cart);
    this.syncCartWithBackend(cart).catch(() => {});
    return cart;
  }

  async removeFromCart(productId: string, unit: ProductUnit = 'full', quality: ProductQuality = 'A'): Promise<StoreCartItem[]> {
    const cart = await this.getCart();
    const updatedCart = cart.filter(
      (item) => lineKey(item.product.id, item.unit || 'full', item.quality || 'A') !== lineKey(productId, unit, quality)
    );
    await this.saveCart(updatedCart);
    this.syncCartWithBackend(updatedCart).catch(() => {});
    return updatedCart;
  }

  async clearCart(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.CART);
    this.clearBackendCart().catch(() => {});
  }

  async syncCartWithBackend(cart: StoreCartItem[]): Promise<boolean> {
    if (!(await this.hasAuthToken())) return true;

    if (this.syncInProgress) {
      // A sync is already running. Mark that the latest cart still needs to be
      // flushed when it finishes, and treat this as success — it WILL be synced
      // by the flush below, so rapid edits don't surface a spurious failure.
      this.pendingSync = true;
      return true;
    }

    this.syncInProgress = true;

    try {
      // Atomic replace in ONE request — the old clear + per-item POST loop
      // was slow and could leave a half-synced server cart on failure.
      const cityId = await getSelectedCityId();
      await apiClient.post('/cart/sync', {
        ...(cityId ? { city_id: cityId } : {}),
        items: cart.map((item) => ({
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
      // A change arrived mid-sync — flush the LATEST local cart so the server
      // isn't left stale (the previous code dropped this update entirely).
      if (this.pendingSync) {
        this.pendingSync = false;
        this.getCart()
          .then((latest) => this.syncCartWithBackend(latest))
          .catch(() => {});
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

  async ensureBackendCartSynced(): Promise<boolean> {
    const cart = await this.getCart();
    if (cart.length === 0) return true;
    return this.syncCartWithBackend(cart);
  }

  /**
   * Apply a coupon to the server cart. Syncs first so the coupon is validated
   * against the current subtotal. Throws (handleApiError) on an invalid coupon
   * so the caller can show the reason.
   */
  async applyCoupon(code: string): Promise<{
    code: string;
    description?: string | null;
    discount_type: 'percentage' | 'fixed' | 'free_delivery';
    discount_amount: number;
    free_delivery: boolean;
    summary: string;
  }> {
    await this.ensureBackendCartSynced();
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
