// ============================================================================
// PRODUCT ROUTES — REAL integration tests
// Exercises the actual router → optionalAuth → validate → controller chain,
// with the DB layer mocked. Verifies pagination shape, 404 handling, query
// validation, and the ORDER BY whitelist that guards against SQL injection.
// ============================================================================

import { jest } from '@jest/globals';
import request from 'supertest';
import { query } from '@/config/database';
import { hasVariableWeightColumns, hasUnitToggleColumns, hasQualityCatalogColumns } from '@/config/productSchema';
import { hasFeedbackTables } from '@/config/feedbackSchema';
import productRoutes from '@/routes/product.routes';
import { buildApp } from './helpers';

const mockQuery = query as jest.MockedFunction<typeof query>;
const app = buildApp('/api/products', productRoutes);

function ok<T>(rows: T[]): any {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

// The product SELECTs add variable-weight (migration 23), rating (migration 24)
// and unit-toggle (migration 25) columns only when those migrations are present.
// Prime all three cached probes to "absent" so each test's mock sequence (count,
// then list) isn't thrown off by an extra information_schema query.
beforeAll(async () => {
  mockQuery.mockResolvedValueOnce(ok([]));
  await hasVariableWeightColumns();
  mockQuery.mockResolvedValueOnce(ok([]));
  await hasFeedbackTables();
  mockQuery.mockResolvedValueOnce(ok([]));
  await hasUnitToggleColumns();
  // Quality tiers (migration 34) — prime to "absent" so the consumer SELECTs use
  // the legacy column set and each test's count→list mock sequence stays aligned.
  mockQuery.mockResolvedValueOnce(ok([]));
  await hasQualityCatalogColumns();
});

describe('GET /api/products', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a paginated list of active products', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ count: '2' }])) // COUNT(*)
      .mockResolvedValueOnce(
        ok([
          { id: 'p1', name_en: 'Apples', price: '150' },
          { id: 'p2', name_en: 'Bananas', price: '80' },
        ])
      );

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20, total: 2, totalPages: 1 });
  });

  it('rejects attacker input in ORDER BY before touching SQL', async () => {
    const res = await request(app).get('/api/products?sortBy=price);DROP%20TABLE%20products;--');

    expect(res.status).toBe(422);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('binds the search term as a parameter rather than concatenating it', async () => {
    mockQuery.mockResolvedValueOnce(ok([{ count: '0' }])).mockResolvedValueOnce(ok([]));

    await request(app).get("/api/products?search=' OR 1=1--");

    const [, listParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    // The raw search text only appears inside a bound parameter (wrapped in %…%),
    // never spliced into the SQL string itself.
    const listSql = String(mockQuery.mock.calls[1][0]);
    expect(listSql).not.toContain('OR 1=1');
    expect(listParams.some((p) => String(p).includes("OR 1=1"))).toBe(true);
  });
});

describe('GET /api/products/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 404 for a non-UUID product id without touching Postgres', async () => {
    const res = await request(app).get('/api/products/banana');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 404 when the product does not exist', async () => {
    mockQuery.mockResolvedValueOnce(ok([])); // no row

    const res = await request(app).get('/api/products/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for related products when the id is not a UUID', async () => {
    const res = await request(app).get('/api/products/banana/related');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('GET /api/products sort mapping', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps sortBy=popularity to the real order_count column (was a guaranteed SQL 500)', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ count: '1' }]))
      .mockResolvedValueOnce(ok([{ id: 'p1', name_en: 'Apples', price: '150' }]));

    const res = await request(app).get('/api/products?sortBy=popularity');

    expect(res.status).toBe(200);
    const listSql = String(mockQuery.mock.calls[1][0]);
    expect(listSql).toContain('ORDER BY p.order_count');
    expect(listSql).not.toContain('p.popularity');
  });

  it('falls back to created_at for unknown sortBy values', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ count: '0' }]))
      .mockResolvedValueOnce(ok([]));

    const res = await request(app).get('/api/products?sortBy=name');

    expect(res.status).toBe(200);
    const listSql = String(mockQuery.mock.calls[1][0]);
    // `name` maps to the real name_en column.
    expect(listSql).toContain('ORDER BY p.name_en');
  });
});
