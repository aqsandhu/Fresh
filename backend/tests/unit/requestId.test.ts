// Every request gets one id: on the response (X-Request-Id), in the logs and —
// for a server fault — in the error body, so a failure report can be traced.
import express from 'express';
import request from 'supertest';
import { requestId } from '../../src/middleware/requestId';
import { errorHandler, asyncHandler } from '../../src/middleware/errorHandler';

function buildApp() {
  const app = express();
  app.use(requestId);
  app.get('/ok', (req, res) => res.json({ id: req.requestId }));
  app.get('/boom', asyncHandler(async () => { throw new Error('database exploded'); }));
  app.get('/orders/:id', asyncHandler(async () => {
    // What Postgres raises for `WHERE id = 'not-a-uuid'`.
    throw Object.assign(new Error('invalid input syntax for type uuid: "not-a-uuid"'), { code: '22P02' });
  }));
  app.get('/bug', asyncHandler(async () => {
    // Same SQLSTATE, but the bad value did NOT come from the request: our own bug.
    throw Object.assign(new Error('invalid input syntax for type uuid: "oops-from-code"'), { code: '22P02' });
  }));
  app.use(errorHandler);
  return app;
}

describe('request id', () => {
  const app = buildApp();

  it('gives every response an id and exposes the same id to the handler', async () => {
    const res = await request(app).get('/ok');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.id).toBe(res.headers['x-request-id']);
  });

  it('reuses a well-formed id from the caller, replaces anything else', async () => {
    const kept = await request(app).get('/ok').set('X-Request-Id', 'trace-abc_123.456');
    expect(kept.headers['x-request-id']).toBe('trace-abc_123.456');
    const replaced = await request(app).get('/ok').set('X-Request-Id', 'bad id\twith <junk>');
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('puts the id in the body of a server fault (and never the internal message in production)', async () => {
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
    expect(res.body.message).toBe('Internal server error');
  });
});

describe('malformed ids are the caller\'s mistake', () => {
  const app = buildApp();

  it('a bad id in the path is a 404, not a 500', async () => {
    const res = await request(app).get('/orders/not-a-uuid');
    expect(res.status).toBe(404);
    expect(res.body.requestId).toBeUndefined();
  });

  it('the same database error caused by our own code is still a 500', async () => {
    const res = await request(app).get('/bug');
    expect(res.status).toBe(500);
  });
});
