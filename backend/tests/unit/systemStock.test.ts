// ============================================================================
// SYSTEM STOCK — reservation model unit tests.
// Locks the corruption-sensitive core: reserve is atomic (guard available>=need),
// release/commit floor at 0, and every change writes the right ledger row so
// balance == Σ delta (reserve/release delta 0; sale delta -need).
// ============================================================================

import { jest } from '@jest/globals';
import type { PoolClient } from 'pg';
import {
  reservedColumn,
  reserveProductStock,
  releaseProductReservation,
  commitProductSale,
} from '@/utils/systemStock';

function mockClient(updateRowCount = 1): {
  client: PoolClient;
  calls: Array<{ sql: string; params: unknown[] }>;
} {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO stock_movements')) return { rows: [], rowCount: 1 };
      // UPDATE products ...
      return { rows: updateRowCount > 0 ? [{ id: 'p1' }] : [], rowCount: updateRowCount };
    }),
  } as unknown as PoolClient;
  return { client, calls };
}

describe('reservedColumn', () => {
  it('whitelists the reserved column per quality', () => {
    expect(reservedColumn('A')).toBe('reserved_quantity');
    expect(reservedColumn('B')).toBe('reserved_quantity_b');
    expect(reservedColumn('C')).toBe('reserved_quantity_c');
    expect(reservedColumn('garbage')).toBe('reserved_quantity'); // normalizes to A
  });
});

describe('reserveProductStock', () => {
  it('reserves atomically with an available>=need guard + writes a delta-0 ledger row', async () => {
    const { client, calls } = mockClient(1);
    const ok = await reserveProductStock(client, { productId: 'p1', quality: 'A', need: 2, orderId: 'o1' });
    expect(ok).toBe(true);
    const upd = calls.find((c) => c.sql.includes('UPDATE products'))!;
    expect(upd.sql).toContain('reserved_quantity = reserved_quantity + $1');
    expect(upd.sql).toContain('(stock_quantity - reserved_quantity) >= $1'); // oversell guard
    expect(upd.params[0]).toBe(2);
    const mv = calls.find((c) => c.sql.includes('INSERT INTO stock_movements'))!;
    expect(mv.params).toEqual(['p1', 'A', null, 0, 'reserve', 'o1', null, expect.any(String), null]);
  });

  it('returns false (and writes NO ledger row) when stock is insufficient', async () => {
    const { client, calls } = mockClient(0);
    const ok = await reserveProductStock(client, { productId: 'p1', quality: 'B', need: 99 });
    expect(ok).toBe(false);
    expect(calls.some((c) => c.sql.includes('INSERT INTO stock_movements'))).toBe(false);
  });

  it('uses the per-quality reserved + stock columns', async () => {
    const { client, calls } = mockClient(1);
    await reserveProductStock(client, { productId: 'p1', quality: 'C', need: 1 });
    const upd = calls.find((c) => c.sql.includes('UPDATE products'))!;
    expect(upd.sql).toContain('reserved_quantity_c = reserved_quantity_c + $1');
    expect(upd.sql).toContain('(stock_quantity_c - reserved_quantity_c) >= $1');
  });
});

describe('releaseProductReservation', () => {
  it('floors reserved at 0 and writes a delta-0 release row', async () => {
    const { client, calls } = mockClient(1);
    await releaseProductReservation(client, { productId: 'p1', quality: 'A', need: 3, orderId: 'o1' });
    const upd = calls.find((c) => c.sql.includes('UPDATE products'))!;
    expect(upd.sql).toContain('reserved_quantity = GREATEST(0, reserved_quantity - $1)');
    const mv = calls.find((c) => c.sql.includes('INSERT INTO stock_movements'))!;
    expect(mv.params[3]).toBe(0); // delta
    expect(mv.params[4]).toBe('release');
  });
});

describe('commitProductSale', () => {
  it('decrements reserved + on_hand (floored) and writes a sale row with delta -need', async () => {
    const { client, calls } = mockClient(1);
    await commitProductSale(client, { productId: 'p1', quality: 'A', need: 2, orderId: 'o1' });
    const upd = calls.find((c) => c.sql.includes('UPDATE products'))!;
    expect(upd.sql).toContain('reserved_quantity = GREATEST(0, reserved_quantity - $1)');
    expect(upd.sql).toContain('stock_quantity = GREATEST(0, stock_quantity - $1)');
    expect(upd.sql).toContain('stock_status'); // quality-A flag recomputed
    const mv = calls.find((c) => c.sql.includes('INSERT INTO stock_movements'))!;
    expect(mv.params[3]).toBe(-2); // delta = -need
    expect(mv.params[4]).toBe('sale');
  });

  it('does not touch stock_status for B/C tiers', async () => {
    const { client, calls } = mockClient(1);
    await commitProductSale(client, { productId: 'p1', quality: 'B', need: 1 });
    const upd = calls.find((c) => c.sql.includes('UPDATE products'))!;
    expect(upd.sql).toContain('stock_quantity_b = GREATEST(0, stock_quantity_b - $1)');
    expect(upd.sql).not.toContain('stock_status');
  });

  it('is a no-op for non-positive quantities', async () => {
    const { client, calls } = mockClient(1);
    await commitProductSale(client, { productId: 'p1', quality: 'A', need: 0 });
    expect(calls).toHaveLength(0);
  });
});
