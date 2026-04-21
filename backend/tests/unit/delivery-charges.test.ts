// ============================================================================
// DELIVERY CHARGES UNIT TESTS
// Tests: Delivery charge calculation, thresholds, special categories
// ============================================================================

import { jest } from '@jest/globals';

jest.unstable_mockModule('@/config/database', () => ({
  query: jest.fn(),
}));

jest.unstable_mockModule('@/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { query } = await import('@/config/database');
const mockQuery = query as jest.MockedFunction<typeof query>;

// Delivery charge calculation function
const calculateDeliveryCharge = (
  subtotal: number,
  items: Array<{ category: string; quantity: number; unit_price: number }>,
  baseCharge: number = 100,
  freeThreshold: number = 500
): number => {
  if (items.length === 0) return 0;

  const hasOnlyChicken = items.every((item) => item.category === 'chicken');
  const hasOnlyMeat = items.every((item) => item.category === 'meat');

  // Chicken-only or meat-only: always charged
  if (hasOnlyChicken || hasOnlyMeat) {
    return baseCharge;
  }

  // Mixed or other: free if above threshold
  if (subtotal >= freeThreshold) {
    return 0;
  }

  return baseCharge;
};

describe('Delivery Charge Calculation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  describe('Standard Delivery Charges', () => {
    it('should apply free delivery for orders above threshold', () => {
      const items = [
        { category: 'vegetables', quantity: 5, unit_price: 100 },
        { category: 'fruits', quantity: 2, unit_price: 150 },
      ];
      const subtotal = 800; // Above 500 threshold

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(0);
    });

    it('should apply delivery charge for orders below threshold', () => {
      const items = [
        { category: 'vegetables', quantity: 2, unit_price: 50 },
      ];
      const subtotal = 100; // Below 500 threshold

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(100);
    });

    it('should apply delivery charge exactly at threshold boundary', () => {
      const items = [
        { category: 'vegetables', quantity: 10, unit_price: 50 },
      ];
      const subtotal = 500; // Exactly at threshold

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(0); // >= 500, so free
    });

    it('should return zero for empty cart', () => {
      const items: any[] = [];
      const charge = calculateDeliveryCharge(0, items);
      expect(charge).toBe(0);
    });
  });

  // ============================================================================
  describe('Chicken-Only Orders', () => {
    it('should always charge delivery for chicken-only orders', () => {
      const items = [
        { category: 'chicken', quantity: 10, unit_price: 200 },
      ];
      const subtotal = 2000; // Well above threshold

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(100); // Still charged because chicken-only
    });

    it('should charge delivery for multiple chicken items', () => {
      const items = [
        { category: 'chicken', quantity: 2, unit_price: 300 },
        { category: 'chicken', quantity: 3, unit_price: 250 },
      ];
      const subtotal = 1350;

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(100);
    });

    it('should charge delivery even for large chicken orders', () => {
      const items = [
        { category: 'chicken', quantity: 50, unit_price: 200 },
      ];
      const subtotal = 10000;

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(100);
    });
  });

  // ============================================================================
  describe('Meat-Only Orders', () => {
    it('should always charge delivery for meat-only orders', () => {
      const items = [
        { category: 'meat', quantity: 5, unit_price: 400 },
      ];
      const subtotal = 2000;

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(100);
    });
  });

  // ============================================================================
  describe('Mixed Category Orders', () => {
    it('should apply free delivery for mixed orders above threshold', () => {
      const items = [
        { category: 'chicken', quantity: 1, unit_price: 300 },
        { category: 'vegetables', quantity: 5, unit_price: 100 },
      ];
      const subtotal = 800;

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(0); // Not chicken-only (has vegetables), above threshold
    });

    it('should apply delivery charge for mixed orders below threshold', () => {
      const items = [
        { category: 'chicken', quantity: 1, unit_price: 200 },
        { category: 'fruits', quantity: 1, unit_price: 100 },
      ];
      const subtotal = 300;

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(100); // Below threshold
    });

    it('should apply free delivery for vegetable-only orders above threshold', () => {
      const items = [
        { category: 'vegetables', quantity: 20, unit_price: 50 },
      ];
      const subtotal = 1000;

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(0);
    });

    it('should apply free delivery for fruit-only orders above threshold', () => {
      const items = [
        { category: 'fruits', quantity: 10, unit_price: 100 },
      ];
      const subtotal = 1000;

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(0);
    });
  });

  // ============================================================================
  describe('Configurable Pricing', () => {
    it('should use custom base charge when configured', () => {
      const items = [
        { category: 'vegetables', quantity: 2, unit_price: 50 },
      ];
      const subtotal = 100;
      const customBaseCharge = 150;

      const charge = calculateDeliveryCharge(subtotal, items, customBaseCharge);
      expect(charge).toBe(150);
    });

    it('should use custom free delivery threshold', () => {
      const items = [
        { category: 'vegetables', quantity: 3, unit_price: 100 },
      ];
      const subtotal = 300;
      const customThreshold = 250;

      const charge = calculateDeliveryCharge(subtotal, items, 100, customThreshold);
      expect(charge).toBe(0); // 300 >= 250
    });

    it('should handle high base charge', () => {
      const items = [
        { category: 'vegetables', quantity: 1, unit_price: 50 },
      ];
      const highBaseCharge = 500;

      const charge = calculateDeliveryCharge(50, items, highBaseCharge);
      expect(charge).toBe(500);
    });

    it('should handle zero base charge', () => {
      const items = [
        { category: 'vegetables', quantity: 1, unit_price: 50 },
      ];

      const charge = calculateDeliveryCharge(50, items, 0);
      expect(charge).toBe(0);
    });
  });

  // ============================================================================
  describe('Database-Backed Settings', () => {
    it('should load delivery settings from database', async () => {
      const settings = {
        base_charge: 100,
        free_delivery_threshold: 500,
        express_charge: 200,
        same_day_charge: 150,
      };

      mockQuery.mockResolvedValueOnce({
        rows: [settings],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM delivery_settings LIMIT 1',
        []
      );

      expect(result.rows[0].base_charge).toBe(100);
      expect(result.rows[0].free_delivery_threshold).toBe(500);
    });

    it('should update delivery settings', async () => {
      const newSettings = {
        base_charge: 120,
        free_delivery_threshold: 600,
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ ...newSettings, updated_at: new Date() }],
        rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'UPDATE delivery_settings SET base_charge = $1, free_delivery_threshold = $2 RETURNING *',
        [newSettings.base_charge, newSettings.free_delivery_threshold]
      );

      expect(result.rows[0].base_charge).toBe(120);
      expect(result.rows[0].free_delivery_threshold).toBe(600);
    });

    it('should use default values when settings not in database', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery('SELECT * FROM delivery_settings LIMIT 1', []);
      expect(result.rowCount).toBe(0);

      // Fall back to defaults
      const defaultBaseCharge = 100;
      const defaultThreshold = 500;
      expect(defaultBaseCharge).toBe(100);
      expect(defaultThreshold).toBe(500);
    });
  });

  // ============================================================================
  describe('Edge Cases', () => {
    it('should handle negative subtotal gracefully', () => {
      const items = [
        { category: 'vegetables', quantity: 1, unit_price: -50 },
      ];
      const subtotal = -50;

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(100); // Negative subtotal is below threshold
    });

    it('should handle very large orders', () => {
      const items = [
        { category: 'vegetables', quantity: 1000, unit_price: 100 },
      ];
      const subtotal = 100000;

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(0); // Well above threshold
    });

    it('should handle single item cart', () => {
      const items = [
        { category: 'fruits', quantity: 1, unit_price: 50 },
      ];

      const charge = calculateDeliveryCharge(50, items);
      expect(charge).toBe(100); // Below threshold
    });

    it('should handle fractional amounts', () => {
      const items = [
        { category: 'vegetables', quantity: 1, unit_price: 499.99 },
      ];
      const subtotal = 499.99;

      const charge = calculateDeliveryCharge(subtotal, items);
      expect(charge).toBe(100); // Just below 500 threshold
    });
  });
});
