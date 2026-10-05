// ============================================================================
// WEBHOOK ROUTES — REAL integration tests
// All webhooks share one HMAC contract: signature over the raw body with
// WEBHOOK_SECRET. The SMS webhook used to skip verification entirely —
// these tests pin that every route now rejects unsigned calls.
// ============================================================================

import crypto from 'crypto';
import { jest } from '@jest/globals';
import request from 'supertest';
import { query } from '@/config/database';
import webhookRoutes from '@/routes/webhook.routes';
import { buildApp } from './helpers';

const mockQuery = query as jest.MockedFunction<typeof query>;
const app = buildApp('/api/webhooks', webhookRoutes);

const SECRET = 'test-webhook-secret';

function ok<T>(rows: T[], command = 'SELECT'): any {
  return { rows, rowCount: rows.length, command, oid: 0, fields: [] };
}

function sign(body: object): string {
  // No rawBody in the test app — the controller falls back to
  // JSON.stringify(req.body), so signing the same serialisation matches.
  return crypto.createHmac('sha256', SECRET).update(JSON.stringify(body)).digest('hex');
}

beforeAll(() => {
  process.env.WEBHOOK_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.WEBHOOK_SECRET;
});

describe('POST /api/webhooks/sms', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an unsigned SMS webhook with 401 (no unauthenticated writes)', async () => {
    const res = await request(app)
      .post('/api/webhooks/sms')
      .set('x-webhook-source', 'sms_gateway')
      .send({ message_id: 'msg-1', status: 'delivered' });

    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects a tampered signature with 401', async () => {
    const body = { message_id: 'msg-1', status: 'delivered' };
    const res = await request(app)
      .post('/api/webhooks/sms')
      .set('x-webhook-source', 'sms_gateway')
      .set('x-webhook-signature', sign({ message_id: 'OTHER' }))
      .send(body);

    expect(res.status).toBe(401);
  });

  it('processes a correctly signed SMS webhook', async () => {
    mockQuery
      // claimWebhook INSERT ... ON CONFLICT
      .mockResolvedValueOnce(ok([{ id: 'log-1' }], 'INSERT'))
      // UPDATE notifications
      .mockResolvedValueOnce(ok([], 'UPDATE'))
      // updateWebhookLog
      .mockResolvedValueOnce(ok([], 'UPDATE'));

    const body = { message_id: 'msg-1', status: 'delivered' };
    const res = await request(app)
      .post('/api/webhooks/sms')
      .set('x-webhook-source', 'sms_gateway')
      .set('x-webhook-signature', sign(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/webhooks/order-status', () => {
  beforeEach(() => jest.clearAllMocks());

  it('still rejects unsigned order-status webhooks with 401', async () => {
    const res = await request(app)
      .post('/api/webhooks/order-status')
      .set('x-webhook-source', 'partner')
      .send({ order_id: 'o-1', status: 'confirmed' });

    expect(res.status).toBe(401);
  });
});

describe('WEBHOOK_ALLOW_UNSIGNED is a non-production convenience only', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.WEBHOOK_ALLOW_UNSIGNED;
  });

  it('still rejects unsigned webhooks in production even when the flag is set', async () => {
    process.env.WEBHOOK_ALLOW_UNSIGNED = 'true';
    process.env.NODE_ENV = 'production';

    const res = await request(app)
      .post('/api/webhooks/sms')
      .set('x-webhook-source', 'sms_gateway')
      .send({ message_id: 'msg-1', status: 'delivered' });

    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('accepts unsigned webhooks outside production when explicitly opted in', async () => {
    process.env.WEBHOOK_ALLOW_UNSIGNED = 'true';
    process.env.NODE_ENV = 'test';
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'log-1' }], 'INSERT'))
      .mockResolvedValueOnce(ok([], 'UPDATE'))
      .mockResolvedValueOnce(ok([], 'UPDATE'));

    const res = await request(app)
      .post('/api/webhooks/sms')
      .set('x-webhook-source', 'sms_gateway')
      .send({ message_id: 'msg-1', status: 'delivered' });

    expect(res.status).toBe(200);
  });

  it('never accepts an unsigned webhook without the explicit opt-in, even outside production', async () => {
    process.env.NODE_ENV = 'test';

    const res = await request(app)
      .post('/api/webhooks/sms')
      .set('x-webhook-source', 'sms_gateway')
      .send({ message_id: 'msg-1', status: 'delivered' });

    expect(res.status).toBe(401);
  });
});
