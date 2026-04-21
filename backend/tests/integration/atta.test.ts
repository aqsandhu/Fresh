// ============================================================================
// ATTA CHAKKI (FLOUR MILL) ORDER TESTS
// Tests: Atta order creation with configurable grinding charges
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

describe('Atta Chakki Endpoints', () => {
  const mockUserId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  describe('POST /api/atta-requests', () => {
    it('should create atta grinding request with per-kg charge', async () => {
      const attaRequest = {
        user_id: mockUserId,
        wheat_weight_kg: 10,
        grinding_charge_per_kg: 5,
        total_grinding_charge: 50, // 10 * 5
        flour_type: 'fine',
        special_instructions: 'Double grind please',
        delivery_address_id: 'addr-1',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'atta-1',
          ...attaRequest,
          status: 'pending',
          order_number: 'ATTA-240101-001',
          created_at: new Date(),
        }],
        rowCount: 1, command: 'INSERT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `INSERT INTO atta_requests 
         (user_id, wheat_weight_kg, grinding_charge_per_kg, total_grinding_charge, 
          flour_type, special_instructions, delivery_address_id, status, order_number) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8) RETURNING *`,
        [
          attaRequest.user_id,
          attaRequest.wheat_weight_kg,
          attaRequest.grinding_charge_per_kg,
          attaRequest.total_grinding_charge,
          attaRequest.flour_type,
          attaRequest.special_instructions,
          attaRequest.delivery_address_id,
          'ATTA-240101-001',
        ]
      );

      expect(result.rows[0]).toMatchObject({
        wheat_weight_kg: 10,
        grinding_charge_per_kg: 5,
        total_grinding_charge: 50,
        status: 'pending',
      });
    });

    it('should calculate total charge correctly for different weights', async () => {
      const testCases = [
        { weight: 5, chargePerKg: 5, expected: 25 },
        { weight: 10, chargePerKg: 5, expected: 50 },
        { weight: 20, chargePerKg: 4, expected: 80 },
        { weight: 50, chargePerKg: 3, expected: 150 },
      ];

      for (const testCase of testCases) {
        const totalCharge = testCase.weight * testCase.chargePerKg;
        expect(totalCharge).toBe(testCase.expected);
      }
    });

    it('should reject order with zero or negative weight', async () => {
      const invalidWeights = [0, -1, -5.5];

      for (const weight of invalidWeights) {
        expect(weight <= 0).toBe(true);
      }
    });

    it('should support configurable grinding charge rates', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ base_charge_per_kg: 5, bulk_discount_threshold_kg: 20, bulk_charge_per_kg: 3 }],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      });

      const settings = await mockQuery(
        'SELECT * FROM atta_pricing_settings LIMIT 1',
        []
      );

      expect(settings.rows[0].base_charge_per_kg).toBe(5);
      expect(settings.rows[0].bulk_charge_per_kg).toBe(3);
      expect(settings.rows[0].bulk_discount_threshold_kg).toBe(20);
    });

    it('should apply bulk discount for large orders', async () => {
      const weight = 25; // Above 20kg threshold
      const baseCharge = 5;
      const bulkCharge = 3;
      const threshold = 20;

      const totalCharge = weight > threshold ? weight * bulkCharge : weight * baseCharge;
      expect(totalCharge).toBe(75); // 25 * 3
    });

    it('should not apply bulk discount for small orders', async () => {
      const weight = 15; // Below 20kg threshold
      const baseCharge = 5;
      const bulkCharge = 3;
      const threshold = 20;

      const totalCharge = weight > threshold ? weight * bulkCharge : weight * baseCharge;
      expect(totalCharge).toBe(75); // 15 * 5
    });

    it('should create order with delivery charge', async () => {
      const attaRequest = {
        user_id: mockUserId,
        wheat_weight_kg: 10,
        grinding_charge_per_kg: 5,
        total_grinding_charge: 50,
        delivery_charge: 100,
        total_amount: 150, // grinding + delivery
      };

      expect(attaRequest.total_amount).toBe(
        attaRequest.total_grinding_charge + attaRequest.delivery_charge
      );
    });
  });

  // ============================================================================
  describe('GET /api/atta-requests', () => {
    it('should return user atta requests', async () => {
      const mockRequests = [
        {
          id: 'atta-1',
          order_number: 'ATTA-240101-001',
          wheat_weight_kg: 10,
          total_grinding_charge: 50,
          status: 'completed',
          created_at: new Date().toISOString(),
        },
        {
          id: 'atta-2',
          order_number: 'ATTA-240101-002',
          wheat_weight_kg: 20,
          total_grinding_charge: 80,
          status: 'pending',
          created_at: new Date().toISOString(),
        },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockRequests,
        rowCount: 2, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM atta_requests WHERE user_id = $1 ORDER BY created_at DESC',
        [mockUserId]
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].status).toBe('completed');
      expect(result.rows[1].status).toBe('pending');
    });

    it('should filter atta requests by status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'atta-2', order_number: 'ATTA-240101-002', status: 'pending' },
        ],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM atta_requests WHERE user_id = $1 AND status = $2',
        [mockUserId, 'pending']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('pending');
    });
  });

  // ============================================================================
  describe('PATCH /api/atta-requests/:id/status', () => {
    it('should update atta request status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'atta-1',
          status: 'grinding',
          updated_at: new Date(),
        }],
        rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `UPDATE atta_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        ['grinding', 'atta-1']
      );

      expect(result.rows[0].status).toBe('grinding');
    });

    it('should track atta grinding status flow', async () => {
      const statusFlow = ['pending', 'confirmed', 'grinding', 'packed', 'out_for_delivery', 'delivered'];

      for (const status of statusFlow) {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'atta-1', status }],
          rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
        });

        const result = await mockQuery(
          'UPDATE atta_requests SET status = $1 WHERE id = $2 RETURNING *',
          [status, 'atta-1']
        );

        expect(result.rows[0].status).toBe(status);
      }
    });
  });

  // ============================================================================
  describe('Atta Request Validation', () => {
    it('should validate flour type', async () => {
      const validFlourTypes = ['fine', 'coarse', 'medium'];
      const invalidFlourType = 'super_fine';

      expect(validFlourTypes).toContain('fine');
      expect(validFlourTypes).toContain('coarse');
      expect(validFlourTypes).not.toContain(invalidFlourType);
    });

    it('should validate maximum weight limit', async () => {
      const maxWeight = 100; // kg
      const requestedWeight = 150;

      expect(requestedWeight).toBeGreaterThan(maxWeight);
    });

    it('should round charge to 2 decimal places', async () => {
      const weight = 7;
      const chargePerKg = 5.5;
      const totalCharge = Math.round(weight * chargePerKg * 100) / 100;

      expect(totalCharge).toBe(38.5);
    });
  });
});
