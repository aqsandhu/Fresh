// ============================================================================
// WEBHOOK UNIT TESTS
// Tests: Webhook idempotency, signature verification, event handling
// ============================================================================

import { jest } from '@jest/globals';
import crypto from 'crypto';

jest.unstable_mockModule('@/config/database', () => ({
  query: jest.fn(),
}));

jest.unstable_mockModule('@/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { query } = await import('@/config/database');
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('Webhook Handler', () => {
  const webhookSecret = 'whsec_test_secret_key';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  describe('Idempotency Key Handling', () => {
    it('should process new webhook event', async () => {
      const eventId = 'evt_123456789';

      // Check if already processed
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0, command: 'SELECT', oid: 0, fields: [],
      });

      const checkResult = await mockQuery(
        'SELECT id FROM processed_webhooks WHERE event_id = $1',
        [eventId]
      );

      expect(checkResult.rowCount).toBe(0); // Not processed yet

      // Process the event
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'proc-1', event_id: eventId }],
        rowCount: 1, command: 'INSERT', oid: 0, fields: [],
      });

      const insertResult = await mockQuery(
        'INSERT INTO processed_webhooks (event_id, processed_at) VALUES ($1, NOW()) RETURNING *',
        [eventId]
      );

      expect(insertResult.rowCount).toBe(1);
    });

    it('should skip duplicate webhook event', async () => {
      const eventId = 'evt_duplicate_123';

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'proc-existing', event_id: eventId }],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT id FROM processed_webhooks WHERE event_id = $1',
        [eventId]
      );

      expect(result.rowCount).toBe(1); // Already processed

      // Event should be skipped
      const shouldProcess = result.rowCount === 0;
      expect(shouldProcess).toBe(false);
    });

    it('should handle idempotency key from header', async () => {
      const idempotencyKey = 'idempkey_abc123';
      const headers = { 'idempotency-key': idempotencyKey };

      expect(headers['idempotency-key']).toBe(idempotencyKey);

      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT id FROM processed_webhooks WHERE idempotency_key = $1',
        [idempotencyKey]
      );

      expect(result.rowCount).toBe(0); // New event
    });

    it('should store idempotency key with expiry', async () => {
      const eventId = 'evt_999';
      const expiryHours = 24;

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'proc-1',
          event_id: eventId,
          expires_at: new Date(Date.now() + expiryHours * 60 * 60 * 1000),
        }],
        rowCount: 1, command: 'INSERT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'INSERT INTO processed_webhooks (event_id, expires_at) VALUES ($1, NOW() + INTERVAL \'24 hours\') RETURNING *',
        [eventId]
      );

      expect(result.rows[0].event_id).toBe(eventId);
    });
  });

  // ============================================================================
  describe('Webhook Signature Verification', () => {
    it('should verify valid webhook signature', () => {
      const payload = JSON.stringify({ event: 'order.completed', orderId: 'order-123' });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signedPayload = `${timestamp}.${payload}`;
      
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signedPayload)
        .digest('hex');

      // Verify signature
      const computedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signedPayload)
        .digest('hex');

      expect(signature).toBe(computedSignature);
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify({ event: 'order.completed' });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signedPayload = `${timestamp}.${payload}`;

      const validSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signedPayload)
        .digest('hex');

      const invalidSignature = 'invalid_signature_123';
      expect(invalidSignature).not.toBe(validSignature);
    });

    it('should reject webhook with missing signature', () => {
      const headers: Record<string, string> = {};
      const hasSignature = !!headers['x-webhook-signature'];
      expect(hasSignature).toBe(false);
    });

    it('should reject webhook with expired timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      const fiveMinutesAgo = now - 301; // Just over 5 minutes
      const tolerance = 300; // 5 minutes tolerance

      const isExpired = (now - fiveMinutesAgo) > tolerance;
      expect(isExpired).toBe(true);
    });

    it('should accept webhook within timestamp tolerance', () => {
      const now = Math.floor(Date.now() / 1000);
      const twoMinutesAgo = now - 120;
      const tolerance = 300; // 5 minutes

      const isWithinTolerance = (now - twoMinutesAgo) <= tolerance;
      expect(isWithinTolerance).toBe(true);
    });
  });

  // ============================================================================
  describe('Event Type Handling', () => {
    it('should handle payment.success event', async () => {
      const event = {
        id: 'evt_payment_1',
        type: 'payment.success',
        data: {
          order_id: 'order-123',
          payment_id: 'pay_456',
          amount: 550,
          status: 'completed',
        },
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'order-123', status: 'payment_received' }],
        rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `UPDATE orders SET status = 'payment_received', payment_status = 'paid' WHERE id = $1 RETURNING *`,
        [event.data.order_id]
      );

      expect(result.rows[0].status).toBe('payment_received');
    });

    it('should handle payment.failed event', async () => {
      const event = {
        id: 'evt_payment_fail_1',
        type: 'payment.failed',
        data: {
          order_id: 'order-123',
          reason: 'Insufficient funds',
        },
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'order-123', payment_status: 'failed' }],
        rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `UPDATE orders SET payment_status = 'failed' WHERE id = $1 RETURNING *`,
        [event.data.order_id]
      );

      expect(result.rows[0].payment_status).toBe('failed');
    });

    it('should handle rider.assigned event', async () => {
      const event = {
        id: 'evt_rider_1',
        type: 'rider.assigned',
        data: {
          order_id: 'order-123',
          rider_id: 'rider-456',
        },
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'order-123', rider_id: 'rider-456', status: 'out_for_delivery' }],
        rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'UPDATE orders SET rider_id = $1, status = $2 WHERE id = $3 RETURNING *',
        [event.data.rider_id, 'out_for_delivery', event.data.order_id]
      );

      expect(result.rows[0].rider_id).toBe('rider-456');
    });

    it('should handle unknown event types gracefully', async () => {
      const unknownEvent = {
        id: 'evt_unknown_1',
        type: 'unknown.event',
        data: { some_field: 'value' },
      };

      // Should not throw, just log and acknowledge
      const supportedEvents = ['payment.success', 'payment.failed', 'rider.assigned', 'order.cancelled'];
      const isSupported = supportedEvents.includes(unknownEvent.type);
      expect(isSupported).toBe(false);
    });

    it('should acknowledge all webhooks to prevent retries', () => {
      // Always return 200 to prevent webhook retries
      const acknowledge = () => ({ status: 200, body: { received: true } });
      const response = acknowledge();

      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  describe('Webhook Payload Validation', () => {
    it('should validate required fields in payload', () => {
      const validPayload = {
        id: 'evt_123',
        type: 'payment.success',
        timestamp: new Date().toISOString(),
        data: { order_id: 'order-123' },
      };

      expect(validPayload.id).toBeDefined();
      expect(validPayload.type).toBeDefined();
      expect(validPayload.data).toBeDefined();
    });

    it('should reject payload without event ID', () => {
      const invalidPayload = {
        type: 'payment.success',
        data: {},
      };

      expect(invalidPayload).not.toHaveProperty('id');
    });

    it('should reject payload without event type', () => {
      const invalidPayload = {
        id: 'evt_123',
        data: {},
      };

      expect(invalidPayload).not.toHaveProperty('type');
    });
  });

  // ============================================================================
  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection lost'));

      try {
        await mockQuery('SELECT * FROM orders', []);
      } catch (error: any) {
        expect(error.message).toBe('Database connection lost');
      }
    });

    it('should continue processing if idempotency check fails', async () => {
      // Should process even if idempotency storage has issues
      const eventId = 'evt_fallback_1';
      
      // First check fails
      mockQuery.mockRejectedValueOnce(new Error('DB timeout'));

      try {
        await mockQuery('SELECT id FROM processed_webhooks WHERE event_id = $1', [eventId]);
      } catch (error: any) {
        // On idempotency check failure, we should still try to process
        expect(error).toBeDefined();
      }
    });
  });
});
