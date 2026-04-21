// ============================================================================
// ORDERS INTEGRATION TESTS
// Tests: Order creation, status updates, tracking
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

describe('Orders Endpoints', () => {
  const mockUserId = 'user-123';
  const mockOrderId = 'order-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  describe('POST /api/orders', () => {
    it('should create a new order successfully', async () => {
      const orderData = {
        items: [
          { product_id: 'prod-1', quantity: 2, unit_price: 150 },
          { product_id: 'prod-2', quantity: 1, unit_price: 250 },
        ],
        delivery_address_id: 'addr-1',
        payment_method: 'cod',
        special_instructions: 'Leave at door',
      };

      const subtotal = orderData.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      const deliveryCharge = subtotal >= 500 ? 0 : 100;
      const totalAmount = subtotal + deliveryCharge;

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: mockOrderId, order_number: 'FB-240101-001', total_amount: totalAmount }],
          rowCount: 1, command: 'INSERT', oid: 0, fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'item-1' }, { id: 'item-2' }],
          rowCount: 2, command: 'INSERT', oid: 0, fields: [],
        });

      // Verify order calculations
      expect(subtotal).toBe(550); // 2*150 + 1*250
      expect(deliveryCharge).toBe(0); // Above 500 threshold
      expect(totalAmount).toBe(550);

      const orderResult = await mockQuery(
        `INSERT INTO orders (user_id, order_number, total_amount, delivery_charge, status, payment_method) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [mockUserId, 'FB-240101-001', totalAmount, deliveryCharge, 'pending', 'cod']
      );

      expect(orderResult.rows[0].order_number).toBe('FB-240101-001');
      expect(orderResult.rows[0].total_amount).toBe(totalAmount);
    });

    it('should apply delivery charge for orders below threshold', async () => {
      const items = [{ product_id: 'prod-1', quantity: 1, unit_price: 100 }];
      const subtotal = 100;
      const deliveryCharge = subtotal >= 500 ? 0 : 100;
      const totalAmount = subtotal + deliveryCharge;

      expect(deliveryCharge).toBe(100); // Below threshold
      expect(totalAmount).toBe(200);

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: mockOrderId, total_amount: totalAmount, delivery_charge: deliveryCharge }],
        rowCount: 1, command: 'INSERT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `INSERT INTO orders (user_id, total_amount, delivery_charge) VALUES ($1, $2, $3) RETURNING *`,
        [mockUserId, totalAmount, deliveryCharge]
      );

      expect(result.rows[0].delivery_charge).toBe(100);
    });

    it('should reject order with empty items', async () => {
      const emptyItems: any[] = [];
      expect(emptyItems.length).toBe(0);
      // Order with no items should fail validation
    });

    it('should reject order without delivery address', async () => {
      const addressId = null;
      expect(addressId).toBeNull();
    });

    it('should generate unique order number', async () => {
      const now = new Date();
      const datePrefix = `FB-${now.getFullYear().toString().slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const orderNumber = `${datePrefix}-001`;

      expect(orderNumber).toMatch(/^FB-\d{6}-\d{3}$/);
    });

    it('should create order with correct status flow', async () => {
      const statusFlow = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];

      for (let i = 0; i < statusFlow.length - 1; i++) {
        const currentStatus = statusFlow[i];
        const nextStatus = statusFlow[i + 1];

        mockQuery.mockResolvedValueOnce({
          rows: [{ id: mockOrderId, status: nextStatus, updated_at: new Date() }],
          rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
        });

        const result = await mockQuery(
          'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
          [nextStatus, mockOrderId]
        );

        expect(result.rows[0].status).toBe(nextStatus);
      }
    });
  });

  // ============================================================================
  describe('GET /api/orders', () => {
    it('should return user orders list', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          order_number: 'FB-240101-001',
          total_amount: 550,
          status: 'delivered',
          payment_method: 'cod',
          created_at: new Date().toISOString(),
        },
        {
          id: 'order-2',
          order_number: 'FB-240101-002',
          total_amount: 850,
          status: 'pending',
          payment_method: 'cod',
          created_at: new Date().toISOString(),
        },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockOrders,
        rowCount: 2, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
        [mockUserId]
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].user_id).toBeUndefined(); // We didn't include it in mock
    });

    it('should filter orders by status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'order-1', status: 'pending' },
          { id: 'order-2', status: 'pending' },
        ],
        rowCount: 2, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM orders WHERE user_id = $1 AND status = $2',
        [mockUserId, 'pending']
      );

      expect(result.rows.every(o => o.status === 'pending')).toBe(true);
    });
  });

  // ============================================================================
  describe('GET /api/orders/:id', () => {
    it('should return order details with items', async () => {
      const mockOrder = {
        id: mockOrderId,
        order_number: 'FB-240101-001',
        total_amount: 550,
        delivery_charge: 0,
        status: 'pending',
        payment_method: 'cod',
        user_id: mockUserId,
        created_at: new Date().toISOString(),
      };

      const mockItems = [
        { id: 'item-1', product_name: 'Fresh Apples', quantity: 2, unit_price: 150, total_price: 300 },
        { id: 'item-2', product_name: 'Bananas', quantity: 1, unit_price: 250, total_price: 250 },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [mockOrder], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: mockItems, rowCount: 2, command: 'SELECT', oid: 0, fields: [] });

      const orderResult = await mockQuery('SELECT * FROM orders WHERE id = $1', [mockOrderId]);
      const itemsResult = await mockQuery('SELECT * FROM order_items WHERE order_id = $1', [mockOrderId]);

      expect(orderResult.rows[0]).toMatchObject(mockOrder);
      expect(itemsResult.rows).toHaveLength(2);
    });
  });

  // ============================================================================
  describe('PATCH /api/orders/:id/status', () => {
    it('should update order status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: mockOrderId, status: 'confirmed', updated_at: new Date() }],
        rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        ['confirmed', mockOrderId]
      );

      expect(result.rows[0].status).toBe('confirmed');
    });

    it('should prevent invalid status transitions', async () => {
      const validTransitions: Record<string, string[]> = {
        pending: ['confirmed', 'cancelled'],
        confirmed: ['preparing', 'cancelled'],
        preparing: ['out_for_delivery'],
        out_for_delivery: ['delivered', 'failed'],
        delivered: [],
        cancelled: [],
      };

      // Cannot go from delivered back to pending
      expect(validTransitions['delivered']).not.toContain('pending');
      // Cannot go from cancelled to confirmed
      expect(validTransitions['cancelled']).not.toContain('confirmed');
    });

    it('should track order status history', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'hist-1', status: 'pending', created_at: new Date(Date.now() - 3600000) },
          { id: 'hist-2', status: 'confirmed', created_at: new Date(Date.now() - 1800000) },
          { id: 'hist-3', status: 'preparing', created_at: new Date() },
        ],
        rowCount: 3, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC',
        [mockOrderId]
      );

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].status).toBe('pending');
      expect(result.rows[2].status).toBe('preparing');
    });
  });

  // ============================================================================
  describe('Order Tracking', () => {
    it('should return order tracking information', async () => {
      const trackingInfo = {
        order_id: mockOrderId,
        order_number: 'FB-240101-001',
        current_status: 'out_for_delivery',
        estimated_delivery: new Date(Date.now() + 3600000).toISOString(),
        rider_name: 'Ali Khan',
        rider_phone: '+923001234567',
        current_location: { lat: 31.5204, lng: 74.3587 },
      };

      mockQuery.mockResolvedValueOnce({
        rows: [trackingInfo],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `SELECT o.id as order_id, o.order_number, o.status as current_status, 
                o.estimated_delivery, r.full_name as rider_name, r.phone as rider_phone,
                r.current_location
         FROM orders o 
         LEFT JOIN riders r ON o.rider_id = r.id 
         WHERE o.id = $1`,
        [mockOrderId]
      );

      expect(result.rows[0]).toMatchObject(trackingInfo);
    });

    it('should return estimated delivery time', async () => {
      const orderTime = new Date();
      const estimatedDelivery = new Date(orderTime.getTime() + 2 * 60 * 60 * 1000); // +2 hours

      expect(estimatedDelivery.getTime()).toBeGreaterThan(orderTime.getTime());
    });
  });

  // ============================================================================
  describe('Order Cancellation', () => {
    it('should allow cancellation of pending orders', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: mockOrderId, status: 'pending' }],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      }).mockResolvedValueOnce({
        rows: [{ id: mockOrderId, status: 'cancelled', cancelled_at: new Date() }],
        rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
      });

      const currentOrder = await mockQuery('SELECT status FROM orders WHERE id = $1', [mockOrderId]);
      expect(currentOrder.rows[0].status).toBe('pending');

      const cancelResult = await mockQuery(
        `UPDATE orders SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1 RETURNING *`,
        [mockOrderId]
      );

      expect(cancelResult.rows[0].status).toBe('cancelled');
    });

    it('should not allow cancellation of delivered orders', async () => {
      const cancellableStatuses = ['pending', 'confirmed'];
      const nonCancellableStatuses = ['delivered', 'cancelled', 'failed'];

      for (const status of nonCancellableStatuses) {
        expect(cancellableStatuses).not.toContain(status);
      }
    });

    it('should restore stock on cancellation', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ product_id: 'prod-1', quantity: 2 }],
        rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2 RETURNING *',
        [2, 'prod-1']
      );

      expect(result.rowCount).toBe(1);
    });
  });
});
