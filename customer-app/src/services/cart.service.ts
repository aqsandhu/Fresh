import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem, Product } from '@types';
import { STORAGE_KEYS } from '@utils/constants';
import apiClient, { handleApiError } from './api';
import { ApiResponse } from '@types';

class CartService {
  private syncInProgress = false;
  private pendingSync = false;

  async getCart(): Promise<CartItem[]> {
    try {
      const cartJson = await AsyncStorage.getItem(STORAGE_KEYS.CART);
      return cartJson ? JSON.parse(cartJson) : [];
    } catch (error) {
      console.error('Error getting cart:', error);
      return [];
    }
  }

  async saveCart(cart: CartItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
    } catch (error) {
      console.error('Error saving cart:', error);
    }
  }

  async addToCart(product: Product, quantity: number = 1): Promise<CartItem[]> {
    const cart = await this.getCart();
    const existingItemIndex = cart.findIndex((item) => item.product.id === product.id);

    if (existingItemIndex >= 0) {
      cart[existingItemIndex].quantity += quantity;
    } else {
      cart.push({ product, quantity });
    }

    await this.saveCart(cart);
    
    // Sync with backend
    this.syncCartWithBackend(cart).catch(err => {
      console.log('Background cart sync failed:', err);
    });
    
    return cart;
  }

  async updateQuantity(productId: string, quantity: number): Promise<CartItem[]> {
    const cart = await this.getCart();
    const itemIndex = cart.findIndex((item) => item.product.id === productId);

    if (itemIndex >= 0) {
      if (quantity <= 0) {
        cart.splice(itemIndex, 1);
      } else {
        cart[itemIndex].quantity = quantity;
      }
    }

    await this.saveCart(cart);
    
    // Sync with backend
    this.syncCartWithBackend(cart).catch(err => {
      console.log('Background cart sync failed:', err);
    });
    
    return cart;
  }

  async removeFromCart(productId: string): Promise<CartItem[]> {
    const cart = await this.getCart();
    const updatedCart = cart.filter((item) => item.product.id !== productId);
    await this.saveCart(updatedCart);
    
    // Sync with backend
    this.syncCartWithBackend(updatedCart).catch(err => {
      console.log('Background cart sync failed:', err);
    });
    
    return updatedCart;
  }

  async clearCart(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.CART);
    
    // Clear cart on backend
    this.clearBackendCart().catch(err => {
      console.log('Backend cart clear failed:', err);
    });
  }

  async getCartItemCount(): Promise<number> {
    const cart = await this.getCart();
    return cart.reduce((total, item) => total + item.quantity, 0);
  }

  async isInCart(productId: string): Promise<boolean> {
    const cart = await this.getCart();
    return cart.some((item) => item.product.id === productId);
  }

  async getCartTotal(): Promise<number> {
    const cart = await this.getCart();
    return cart.reduce((total, item) => total + item.product.price * item.quantity, 0);
  }

  // Backend sync: clear backend cart and re-add all local items
  async syncCartWithBackend(cart: CartItem[]): Promise<boolean> {
    if (this.syncInProgress) {
      this.pendingSync = true;
      return false;
    }

    this.syncInProgress = true;
    
    try {
      // Clear backend cart first
      await apiClient.delete('/cart/clear').catch(() => {});

      // Add each item to backend cart
      for (const item of cart) {
        await apiClient.post('/cart/add', {
          product_id: item.product.id,
          quantity: item.quantity,
        }).catch(err => {
          console.log(`Failed to sync item ${item.product.id}:`, err?.message);
        });
      }
      return true;
    } catch (error) {
      console.error('Cart sync error:', error);
      return false;
    } finally {
      this.syncInProgress = false;
      
      // If there was a pending sync, trigger it now
      if (this.pendingSync) {
        this.pendingSync = false;
        const currentCart = await this.getCart();
        this.syncCartWithBackend(currentCart);
      }
    }
  }

  async clearBackendCart(): Promise<boolean> {
    try {
      const response = await apiClient.delete<ApiResponse<{ message: string }>>('/cart/clear');
      return response.data.success;
    } catch (error) {
      console.error('Clear backend cart error:', error);
      return false;
    }
  }

  // Sync local cart to backend before placing order
  async ensureBackendCartSynced(): Promise<boolean> {
    const cart = await this.getCart();
    if (cart.length === 0) return true;
    return this.syncCartWithBackend(cart);
  }
}

export const cartService = new CartService();
export default cartService;
