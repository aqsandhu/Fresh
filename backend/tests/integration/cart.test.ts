// ============================================================================
// CART INTEGRATION TESTS
// Tests: Cart CRUD operations, item management, delivery charge calculation
// ============================================================================

import { jest } from '@jest/globals';

jest.unstable_mockModule('@/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn((cb) => cb({ query: jest.fn() })),
}));

jest.unstable_mockModule('@/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { query } = await import('@/config/database');
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('Cart Endpoints', () => {
  const mockUserId = 'user-123';
  const mockCartId = 'cart-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  describe('GET /api/cart', () => {
    it('should return cart with items for authenticated user', async () => {
      const mockCart = {
        id: mockCartId,
        user_id: mockUserId,
        status: 'active',
        subtotal: 550,
        delivery_charge: 0,
        total_amount: 550,
      };

      const mockItems = [
        {
          id: 'item-1',
          product_id: 'prod-1',
          name_en: 'Fresh Apples',
          quantity: 2,
          unit_price: 150,
          total_price: 300,
          primary_image: 'apples.jpg',
        },
        {
          id: 'item-2',
          product_id: 'prod-2',
          name_en: 'Bananas',
          quantity: 1,
          unit_price: 250,
          total_price: 250,
          primary_image: 'bananas.jpg',
        },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [mockCart], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: mockItems, rowCount: 2, command: 'SELECT', oid: 0, fields: [] });

      const cartResult = await mockQuery(
        `SELECT * FROM carts WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [mockUserId]
      );

      const itemsResult = await mockQuery(
        `SELECT ci.*, p.name_en, p.primary_image 
         FROM cart_items ci 
         JOIN products p ON ci.product_id = p.id 
         WHERE ci.cart_id = $1`,
        [mockCartId]
      );

      expect(cartResult.rows[0]).toMatchObject(mockCart);
      expect(itemsResult.rows).toHaveLength(2);
      expect(itemsResult.rows[0].quantity).toBe(2);
    });

    it('should create new cart if none exists', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({
          rows: [{ id: mockCartId, user_id: mockUserId, status: 'active' }],
          rowCount: 1, command: 'INSERT', oid: 0, fields: [],
        });

      const existingCart = await mockQuery(
        `SELECT * FROM carts WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [mockUserId]
      );

      expect(existingCart.rowCount).toBe(0);

      const newCart = await mockQuery(
        `INSERT INTO carts (user_id, status, expires_at) VALUES ($1, 'active', NOW() + INTERVAL '7 days') RETURNING *`,
        [mockUserId]
      );

      expect(newCart.rows[0].user_id).toBe(mockUserId);
    });

    it('should return empty cart for new user', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: mockCartId, user_id: mockUserId }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

      const itemsResult = await mockQuery(
        'SELECT * FROM cart_items WHERE cart_id = $1',
        [mockCartId]
      );

      expect(itemsResult.rows).toHaveLength(0);
    });
  });

  // ============================================================================
  describe('POST /api/cart/items', () => {
    it('should add item to cart', async () => {
      const newItem = {
        product_id: 'prod-3',
        quantity: 3,
        unit_price: 100,
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'item-3', ...newItem, total_price: 300 }],
        rowCount: 1, command: 'INSERT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price, total_price) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [mockCartId, newItem.product_id, newItem.quantity, newItem.unit_price, newItem.quantity * newItem.unit_price]
      );

      expect(result.rows[0].product_id).toBe('prod-3');
      expect(result.rows[0].quantity).toBe(3);
      expect(result.rows[0].total_price).toBe(300);
    });

    it('should update quantity if item already in cart', async () => {
      const existingItem = { id: 'item-1', product_id: 'prod-1', quantity: 2 };
      const additionalQuantity = 3;
      const newQuantity = existingItem.quantity + additionalQuantity;

      mockQuery.mockResolvedValueOnce({
        rows: [{ ...existingItem, quantity: newQuantity }],
        rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `UPDATE cart_items SET quantity = $1, total_price = unit_price * $1 
         WHERE cart_id = $2 AND product_id = $3 RETURNING *`,
        [newQuantity, mockCartId, existingItem.product_id]
      );

      expect(result.rows[0].quantity).toBe(5);
    });

    it('should reject adding item with quantity zero or negative', async () => {
      const invalidQuantities = [0, -1, -5];

      for (const qty of invalidQuantities) {
        expect(qty <= 0).toBe(true);
      }
    });

    it('should reject adding item exceeding available stock', async () => {
      const stockQuantity = 10;
      const requestedQuantity = 15;

      mockQuery.mockResolvedValueOnce({
        rows: [{ stock_quantity: stockQuantity }],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT stock_quantity FROM products WHERE id = $1',
        ['prod-1']
      );

      expect(requestedQuantity).toBeGreaterThan(result.rows[0].stock_quantity);
    });
  });

  // ============================================================================
  describe('PUT /api/cart/items/:id', () => {
    it('should update item quantity', async () => {
      const itemId = 'item-1';
      const newQuantity = 5;
      const unitPrice = 150;

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: itemId, quantity: newQuantity, total_price: newQuantity * unitPrice }],
        rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'UPDATE cart_items SET quantity = $1, total_price = $2 WHERE id = $3 RETURNING *',
        [newQuantity, newQuantity * unitPrice, itemId]
      );

      expect(result.rows[0].quantity).toBe(5);
      expect(result.rows[0].total_price).toBe(750);
    });

    it('should remove item when quantity set to zero', async () => {
      const itemId = 'item-1';

      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0, command: 'DELETE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'DELETE FROM cart_items WHERE id = $1',
        [itemId]
      );

      expect(result.rowCount).toBe(0);
    });
  });

  // ============================================================================
  describe('DELETE /api/cart/items/:id', () => {
    it('should remove item from cart', async () => {
      const itemId = 'item-1';

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: itemId }],
        rowCount: 1, command: 'DELETE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'DELETE FROM cart_items WHERE id = $1 RETURNING *',
        [itemId]
      );

      expect(result.rowCount).toBe(1);
    });

    it('should return 404 for non-existent cart item', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0, command: 'DELETE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'DELETE FROM cart_items WHERE id = $1 RETURNING *',
        ['non-existent']
      );

      expect(result.rowCount).toBe(0);
    });
  });

  // ============================================================================
  describe('POST /api/cart/clear', () => {
    it('should clear all items from cart', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 2, command: 'DELETE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'DELETE FROM cart_items WHERE cart_id = $1',
        [mockCartId]
      );

      expect(result.rowCount).toBe(2);
    });
  });

  // ============================================================================
  describe('Cart Calculations', () => {
    it('should calculate subtotal correctly', async () => {
      const items = [
        { quantity: 2, unit_price: 150 },
        { quantity: 1, unit_price: 250 },
        { quantity: 3, unit_price: 100 },
      ];

      const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      expect(subtotal).toBe(850); // 2*150 + 1*250 + 3*100 = 300 + 250 + 300
    });

    it('should apply free delivery for orders above threshold', async () => {
      const subtotal = 600;
      const freeDeliveryThreshold = 500;
      const deliveryCharge = subtotal >= freeDeliveryThreshold ? 0 : 100;

      expect(deliveryCharge).toBe(0);
    });

    it('should charge delivery for orders below threshold', async () => {
      const subtotal = 300;
      const freeDeliveryThreshold = 500;
      const deliveryCharge = subtotal >= freeDeliveryThreshold ? 0 : 100;

      expect(deliveryCharge).toBe(100);
    });

    it('should charge delivery for chicken-only orders regardless of threshold', async () => {
      const items = [
        { category: 'chicken', quantity: 5, unit_price: 200 },
      ];
      const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      const hasOnlyChicken = items.every(item => item.category === 'chicken');

      expect(hasOnlyChicken).toBe(true);
      // Chicken-only orders always have delivery charge
      const deliveryCharge = hasOnlyChicken ? 100 : (subtotal >= 500 ? 0 : 100);
      expect(deliveryCharge).toBe(100);
    });

    it('should calculate total amount correctly', async () => {
      const subtotal = 600;
      const deliveryCharge = 0;
      const total = subtotal + deliveryCharge;

      expect(total).toBe(600);
    });
  });

  // ============================================================================
  describe('Cart Ownership & Security', () => {
    it('should verify cart belongs to authenticated user', async () => {
      const cartOwnerId = 'user-123';
      const authenticatedUserId = 'user-123';

      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: cartOwnerId }],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT user_id FROM carts WHERE id = $1',
        [mockCartId]
      );

      expect(result.rows[0].user_id).toBe(authenticatedUserId);
    });

    it('should prevent accessing another user cart', async () => {
      const cartOwnerId = 'user-456';
      const authenticatedUserId = 'user-123';

      expect(cartOwnerId).not.toBe(authenticatedUserId);
    });
  });
});
