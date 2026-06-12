import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProductUnit, StoreCartItem, StoreProduct } from '@app-types';
import { STORAGE_KEYS } from '@utils/constants';
import { getStoredToken } from '@/lib/secureTokens';
import apiClient, { handleApiError } from './api';
import { ApiResponse } from '@app-types';

const lineKey = (productId: string, unit: ProductUnit = 'full') =>
  `${productId}::${unit}`;

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
    unit: ProductUnit = 'full'
  ): Promise<StoreCartItem[]> {
    const cart = await this.getCart();
    const existingItemIndex = cart.findIndex(
      (item) => lineKey(item.product.id, item.unit || 'full') === lineKey(product.id, unit)
    );

    if (existingItemIndex >= 0) {
      cart[existingItemIndex].quantity += quantity;
    } else {
      cart.push({ product, quantity, unit });
    }

    await this.saveCart(cart);
    this.syncCartWithBackend(cart).catch(() => {});
    return cart;
  }

  async updateQuantity(
    productId: string,
    quantity: number,
    unit: ProductUnit = 'full'
  ): Promise<StoreCartItem[]> {
    const cart = await this.getCart();
    const itemIndex = cart.findIndex(
      (item) => lineKey(item.product.id, item.unit || 'full') === lineKey(productId, unit)
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

  async removeFromCart(productId: string, unit: ProductUnit = 'full'): Promise<StoreCartItem[]> {
    const cart = await this.getCart();
    const updatedCart = cart.filter(
      (item) => lineKey(item.product.id, item.unit || 'full') !== lineKey(productId, unit)
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
      this.pendingSync = true;
      return false;
    }

    this.syncInProgress = true;

    try {
      // Atomic replace in ONE request — the old clear + per-item POST loop
      // was slow and could leave a half-synced server cart on failure.
      await apiClient.post('/cart/sync', {
        items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit: item.unit || 'full',
        })),
      });
      return true;
    } catch {
      return false;
    } finally {
      this.syncInProgress = false;
      if (this.pendingSync) {
        this.pendingSync = false;
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
}

export const cartService = new CartService();
export default cartService;
