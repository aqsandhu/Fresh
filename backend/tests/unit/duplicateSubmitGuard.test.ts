// A34 (round 7): the same money request pressed 3 times at once was booked
// 3 times. The guard lets the first through and refuses identical repeats.
const mockQuery = jest.fn();
jest.mock('@/config/database', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));
jest.mock('@/utils/logger', () => ({ __esModule: true, default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

import { EventEmitter } from 'events';
import { duplicateSubmitGuard, requestFingerprint, stableJson } from '@/middleware/duplicateSubmitGuard';
import { ConflictError } from '@/middleware/errorHandler';

const req = (body: unknown, extra: Record<string, unknown> = {}) =>
  ({ method: 'POST', originalUrl: '/api/admin/complaints/c1/refund', body, user: { id: 'admin-1' }, ...extra }) as never;
const res = () => Object.assign(new EventEmitter(), { statusCode: 200 }) as never as EventEmitter & { statusCode: number };

/** In-memory stand-in for the request_guards upsert. */
function fakeTable() {
  const rows = new Map<string, number>();
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/^\s*CREATE TABLE/i.test(sql)) return { rows: [] };
    if (/INSERT INTO request_guards/.test(sql)) {
      const [key] = params as [string];
      const now = Date.now();
      const exp = rows.get(key);
      if (exp !== undefined && exp >= now) return { rows: [] };
      rows.set(key, now + 15000);
      return { rows: [{ key }] };
    }
    if (/DELETE FROM request_guards WHERE key/.test(sql)) { rows.delete((params as [string])[0]); return { rows: [] }; }
    return { rows: [] };
  });
  return rows;
}

const run = async (r: unknown, s: unknown = res()) => {
  let err: unknown = 'not-called';
  await duplicateSubmitGuard(r as never, s as never, (e?: unknown) => { err = e; });
  return err;
};

beforeEach(() => mockQuery.mockReset());

it('same body in a different key order is the same request', () => {
  expect(stableJson({ a: 1, b: { d: 2, c: 3 } })).toBe(stableJson({ b: { c: 3, d: 2 }, a: 1 }));
  expect(requestFingerprint(req({ amount: 300, reason: 'x' }))).toBe(requestFingerprint(req({ reason: 'x', amount: 300 })));
});

it('a different amount, URL or admin is a different request', () => {
  const base = requestFingerprint(req({ amount: 300 }));
  expect(requestFingerprint(req({ amount: 301 }))).not.toBe(base);
  expect(requestFingerprint(req({ amount: 300 }, { originalUrl: '/api/admin/complaints/c2/refund' }))).not.toBe(base);
  expect(requestFingerprint(req({ amount: 300 }, { user: { id: 'admin-2' } }))).not.toBe(base);
});

it('a triple press: the first goes through, the repeats get 409 and nothing is booked twice', async () => {
  fakeTable();
  const results = [await run(req({ amount: 300 })), await run(req({ amount: 300 })), await run(req({ amount: 300 }))];
  expect(results[0]).toBeUndefined();
  expect(results[1]).toBeInstanceOf(ConflictError);
  expect(results[2]).toBeInstanceOf(ConflictError);
});

it('a failed first attempt releases the guard so the corrected retry works', async () => {
  fakeTable();
  const r1 = res();
  expect(await run(req({ amount: 300 }), r1)).toBeUndefined();
  r1.statusCode = 400;
  r1.emit('finish');
  await new Promise((r) => setTimeout(r, 0));
  expect(await run(req({ amount: 300 }))).toBeUndefined();
});

it('reads (GET) and unsigned requests are never guarded', async () => {
  fakeTable();
  expect(await run(req({}, { method: 'GET' }))).toBeUndefined();
  expect(await run(req({}, { method: 'GET' }))).toBeUndefined();
  expect(await run(req({ a: 1 }, { user: undefined }))).toBeUndefined();
  expect(mockQuery).not.toHaveBeenCalled();
});

it('if the guard table cannot be used, the request still goes through (old behaviour)', async () => {
  mockQuery.mockRejectedValue(new Error('db down'));
  expect(await run(req({ amount: 1 }))).toBeUndefined();
});

it('a request that went to the approval queue (202) is released — the queue merges repeats itself', async () => {
  fakeTable();
  const r1 = res();
  expect(await run(req({ amount: 6000 }), r1)).toBeUndefined();
  r1.statusCode = 202;
  r1.emit('finish');
  await new Promise((r) => setTimeout(r, 0));
  expect(await run(req({ amount: 6000 }))).toBeUndefined();
});
