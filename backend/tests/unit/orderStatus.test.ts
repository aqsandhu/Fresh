// ============================================================================
// ORDER STATUS STATE MACHINE + CANCEL SIDE-EFFECTS — unit tests
// Guards the shared logic all three status-change paths (customer cancel,
// admin panel, webhooks) rely on: illegal transitions are rejected and a
// cancellation puts back exactly what the order consumed (fraction-aware
// stock + the time-slot seat).
// ============================================================================

import { jest } from '@jest/globals';
import type { PoolClient } from 'pg';
import {
  ORDER_STATUS_TIMESTAMPS,
  isValidOrderTransition,
  restoreOrderInventory,
} from '@/utils/orderStatus';

describe('isValidOrderTransition', () => {
  it('allows the normal forward lifecycle', () => {
    expect(isValidOrderTransition('pending', 'confirmed')).toBe(true);
    expect(isValidOrderTransition('confirmed', 'preparing')).toBe(true);
    expect(isValidOrderTransition('preparing', 'ready_for_pickup')).toBe(true);
    expect(isValidOrderTransition('ready_for_pickup', 'out_for_delivery')).toBe(true);
    expect(isValidOrderTransition('out_for_delivery', 'delivered')).toBe(true);
    expect(isValidOrderTransition('delivered', 'refunded')).toBe(true);
  });

  it('allows cancelling from any pre-delivery state', () => {
    for (const from of ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery']) {
      expect(isValidOrderTransition(from, 'cancelled')).toBe(true);
    }
  });

  it('treats same-status updates as a no-op (valid)', () => {
    expect(isValidOrderTransition('confirmed', 'confirmed')).toBe(true);
  });

  it('rejects skipping ahead or moving backwards', () => {
    expect(isValidOrderTransition('pending', 'delivered')).toBe(false);
    expect(isValidOrderTransition('pending', 'out_for_delivery')).toBe(false);
    expect(isValidOrderTransition('delivered', 'pending')).toBe(false);
    expect(isValidOrderTransition('out_for_delivery', 'confirmed')).toBe(false);
  });

  it('never revives a cancelled or refunded order', () => {
    for (const to of ['pending', 'confirmed', 'delivered', 'out_for_delivery']) {
      expect(isValidOrderTransition('cancelled', to)).toBe(false);
      expect(isValidOrderTransition('refunded', to)).toBe(false);
    }
  });

  it('rejects unknown statuses outright', () => {
    expect(isValidOrderTransition('garbage', 'confirmed')).toBe(false);
  });

  it('has a timestamp column for every stampable status', () => {
    expect(ORDER_STATUS_TIMESTAMPS).toMatchObject({
      confirmed: 'confirmed_at',
      cancelled: 'cancelled_at',
      delivered: 'delivered_at',
    });
  });
});

describe('restoreOrderInventory', () => {
  function mockClient(itemRows: Array<Record<string, unknown>>): {
    client: PoolClient;
    calls: Array<{ sql: string; params: unknown[] }>;
  } {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('FROM order_items')) {
          return { rows: itemRows };
        }
        return { rows: [] };
      }),
    } as unknown as PoolClient;
    return { client, calls };
  }

  it('releases the time-slot seat when the order had one', async () => {
    const { client, calls } = mockClient([]);
    await restoreOrderInventory(client, { id: 'order-1', time_slot_id: 'slot-9' });

    const slotCall = calls.find((c) => c.sql.includes('time_slots'));
    expect(slotCall).toBeDefined();
    expect(slotCall!.sql).toContain('GREATEST(0, booked_orders - 1)');
    expect(slotCall!.params).toEqual(['slot-9']);
  });

  it('skips the slot update when there is no time slot', async () => {
    const { client, calls } = mockClient([]);
    await restoreOrderInventory(client, { id: 'order-1', time_slot_id: null });
    expect(calls.some((c) => c.sql.includes('time_slots'))).toBe(false);
  });

  it('restores stock fraction-aware per item (half_kg puts back 0.5 per unit)', async () => {
    const { client, calls } = mockClient([
      { product_id: 'p-full', quantity: 2, unit: 'full' },
      { product_id: 'p-half', quantity: 3, unit: 'half_kg' },
      { product_id: 'p-quarter', quantity: 4, unit: 'quarter_kg' },
    ]);
    await restoreOrderInventory(client, { id: 'order-1' });

    const stockCalls = calls.filter((c) => c.sql.includes('stock_quantity = stock_quantity +'));
    expect(stockCalls).toHaveLength(3);
    expect(stockCalls[0].params).toEqual([2, 'p-full']); // 2 × 1
    expect(stockCalls[1].params).toEqual([1.5, 'p-half']); // 3 × 0.5
    expect(stockCalls[2].params).toEqual([1, 'p-quarter']); // 4 × 0.25
  });
});
