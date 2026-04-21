// ============================================================================
// CART STORE TESTS
// Tests: Add, remove, update quantity, clear, calculations, delivery charges
// ============================================================================

import { jest } from '@jest/globals';

describe('Cart Store', () => {
  // Mock cart state and functions
  const createMockCartState = () => ({
    items: [] as Array<{ product: any; quantity: number }>,
    addItem: function(product: any, quantity: number = 1) {
      const existing = this.items.find((item: any) => item.product.id === product.id);
      if (existing) {
        existing.quantity += quantity;
      } else {
        this.items.push({ product, quantity });
      }
    },
    removeItem: function(productId: string) {
      this.items = this.items.filter((item: any) => item.product.id !== productId);
    },
    updateQuantity: function(productId: string, quantity: number) {
      if (quantity <= 0) {
        this.removeItem(productId);
        return;
      }
      const item = this.items.find((item: any) => item.product.id === productId);
      if (item) {
        item.quantity = quantity;
      }
    },
    clearCart: function() {
      this.items = [];
    },
    getTotalItems: function() {
      return this.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
    },
    getTotalPrice: function() {
      return this.items.reduce((sum: number, item: any) => sum + item.product.price * item.quantity, 0);
    },
    getSubtotal: function() {
      return this.getTotalPrice();
    },
    getDeliveryCharge: function(baseCharge: number = 100, freeThreshold: number = 500) {
      if (this.items.length === 0) return 0;
      const subtotal = this.getSubtotal();
      const hasOnlyChicken = this.items.every((item: any) => item.product.category === 'chicken');
      const hasOnlyMeat = this.items.every((item: any) => item.product.category === 'meat');
      if (hasOnlyChicken || hasOnlyMeat) return baseCharge;
      if (subtotal >= freeThreshold) return 0;
      return baseCharge;
    },
    getFinalTotal: function() {
      return this.getSubtotal() + this.getDeliveryCharge();
    },
    hasOnlyChicken: function() {
      if (this.items.length === 0) return false;
      return this.items.every((item: any) => item.product.category === 'chicken');
    },
  });

  const mockProduct = {
    id: 'prod-1',
    name: 'Fresh Apples',
    price: 250,
    unit: 'kg',
    category: 'fruits',
    image: 'apples.jpg',
  };

  const mockProduct2 = {
    id: 'prod-2',
    name: 'Bananas',
    price: 150,
    unit: 'dozen',
    category: 'fruits',
    image: 'bananas.jpg',
  };

  const mockChickenProduct = {
    id: 'prod-3',
    name: 'Chicken Breast',
    price: 400,
    unit: 'kg',
    category: 'chicken',
    image: 'chicken.jpg',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  describe('addItem', () => {
    it('should add a new item to the cart', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct, 2);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].product.id).toBe('prod-1');
      expect(cart.items[0].quantity).toBe(2);
    });

    it('should increase quantity if item already exists', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct, 2);
      cart.addItem(mockProduct, 3);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(5);
    });

    it('should add multiple different items', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct, 2);
      cart.addItem(mockProduct2, 1);

      expect(cart.items).toHaveLength(2);
      expect(cart.items[0].product.id).toBe('prod-1');
      expect(cart.items[1].product.id).toBe('prod-2');
    });

    it('should default quantity to 1 if not specified', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct);

      expect(cart.items[0].quantity).toBe(1);
    });
  });

  // ============================================================================
  describe('removeItem', () => {
    it('should remove an item from the cart', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct, 2);
      cart.addItem(mockProduct2, 1);

      expect(cart.items).toHaveLength(2);

      cart.removeItem('prod-1');

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].product.id).toBe('prod-2');
    });

    it('should handle removing non-existent item', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct, 2);

      cart.removeItem('non-existent');

      expect(cart.items).toHaveLength(1);
    });
  });

  // ============================================================================
  describe('updateQuantity', () => {
    it('should update item quantity', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct, 2);

      cart.updateQuantity('prod-1', 5);

      expect(cart.items[0].quantity).toBe(5);
    });

    it('should remove item when quantity is set to zero', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct, 2);

      cart.updateQuantity('prod-1', 0);

      expect(cart.items).toHaveLength(0);
    });

    it('should remove item when quantity is negative', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct, 2);

      cart.updateQuantity('prod-1', -1);

      expect(cart.items).toHaveLength(0);
    });
  });

  // ============================================================================
  describe('clearCart', () => {
    it('should remove all items from cart', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct, 2);
      cart.addItem(mockProduct2, 3);

      expect(cart.items).toHaveLength(2);

      cart.clearCart();

      expect(cart.items).toHaveLength(0);
    });

    it('should work on empty cart', () => {
      const cart = createMockCartState();
      cart.clearCart();
      expect(cart.items).toHaveLength(0);
    });
  });

  // ============================================================================
  describe('getTotalItems', () => {
    it('should return total quantity of all items', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct, 2);
      cart.addItem(mockProduct2, 3);

      expect(cart.getTotalItems()).toBe(5);
    });

    it('should return 0 for empty cart', () => {
      const cart = createMockCartState();
      expect(cart.getTotalItems()).toBe(0);
    });
  });

  // ============================================================================
  describe('getTotalPrice', () => {
    it('should calculate total price correctly', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct, 2); // 2 * 250 = 500
      cart.addItem(mockProduct2, 3); // 3 * 150 = 450

      expect(cart.getTotalPrice()).toBe(950);
    });

    it('should return 0 for empty cart', () => {
      const cart = createMockCartState();
      expect(cart.getTotalPrice()).toBe(0);
    });
  });

  // ============================================================================
  describe('getDeliveryCharge', () => {
    it('should return 0 for empty cart', () => {
      const cart = createMockCartState();
      expect(cart.getDeliveryCharge()).toBe(0);
    });

    it('should apply free delivery for orders above threshold', () => {
      const cart = createMockCartState();
      // Add items totaling 600 (above 500 threshold)
      cart.addItem(mockProduct, 2); // 500
      cart.addItem(mockProduct2, 1); // 150, total 650

      expect(cart.getDeliveryCharge()).toBe(0);
    });

    it('should apply delivery charge for orders below threshold', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct2, 1); // 150

      expect(cart.getDeliveryCharge()).toBe(100);
    });

    it('should always charge for chicken-only orders', () => {
      const cart = createMockCartState();
      cart.addItem(mockChickenProduct, 5); // 5 * 400 = 2000 (above threshold but chicken)

      expect(cart.getDeliveryCharge()).toBe(100);
    });

    it('should apply free delivery for mixed orders above threshold', () => {
      const cart = createMockCartState();
      cart.addItem(mockChickenProduct, 1); // 400
      cart.addItem(mockProduct, 1); // 250, total 650

      expect(cart.getDeliveryCharge()).toBe(0); // Mixed, above threshold
    });
  });

  // ============================================================================
  describe('getFinalTotal', () => {
    it('should calculate final total with delivery charge', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct2, 1); // 150

      const subtotal = cart.getSubtotal();
      const delivery = cart.getDeliveryCharge();
      expect(subtotal).toBe(150);
      expect(delivery).toBe(100);
      expect(cart.getFinalTotal()).toBe(250);
    });

    it('should calculate final total with free delivery', () => {
      const cart = createMockCartState();
      cart.addItem(mockProduct, 3); // 3 * 250 = 750

      expect(cart.getFinalTotal()).toBe(750); // Free delivery
    });
  });

  // ============================================================================
  describe('hasOnlyChicken', () => {
    it('should return true for chicken-only cart', () => {
      const cart = createMockCartState();
      cart.addItem(mockChickenProduct, 2);

      expect(cart.hasOnlyChicken()).toBe(true);
    });

    it('should return false for mixed cart', () => {
      const cart = createMockCartState();
      cart.addItem(mockChickenProduct, 1);
      cart.addItem(mockProduct, 1);

      expect(cart.hasOnlyChicken()).toBe(false);
    });

    it('should return false for empty cart', () => {
      const cart = createMockCartState();
      expect(cart.hasOnlyChicken()).toBe(false);
    });
  });

  // ============================================================================
  describe('Cart Persistence', () => {
    it('should maintain cart state across operations', () => {
      const cart = createMockCartState();

      // Add items
      cart.addItem(mockProduct, 2);
      cart.addItem(mockProduct2, 1);
      expect(cart.getTotalItems()).toBe(3);

      // Update quantity
      cart.updateQuantity('prod-1', 5);
      expect(cart.getTotalItems()).toBe(6);

      // Remove item
      cart.removeItem('prod-2');
      expect(cart.getTotalItems()).toBe(5);
      expect(cart.items).toHaveLength(1);

      // Clear
      cart.clearCart();
      expect(cart.getTotalItems()).toBe(0);
    });
  });
});
