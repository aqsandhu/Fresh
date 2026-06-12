// ============================================================================
// ATTA CHAKKI ROUTES — REAL integration tests
// Atta request routes sit behind `authenticate`; create also runs
// `validate(attaSchemas.create)`. These verify the real guard chain.
// ============================================================================

import { jest } from '@jest/globals';
import request from 'supertest';
import { query } from '@/config/database';
import attaRoutes from '@/routes/atta.routes';
import { buildApp, signAccessToken } from './helpers';

const mockQuery = query as jest.MockedFunction<typeof query>;
const app = buildApp('/api/atta-requests', attaRoutes);

describe('Atta request auth gate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an unauthenticated list with 401', async () => {
    const res = await request(app).get('/api/atta-requests');
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects a create with an invalid body (422) before hitting the DB', async () => {
    const res = await request(app)
      .post('/api/atta-requests')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ wheat_quantity_kg: -5 });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
