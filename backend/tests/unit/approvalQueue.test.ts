/**
 * Owner's decision J1 (W10): two-admin actions sent without an approval code
 * wait in a queue and run again on approval. These pin down that the queue
 * never stores secrets, knows the route it came from, and that every action
 * it can replay is a real route.
 */
import fs from 'fs';
import path from 'path';

const mockQuery = jest.fn();
jest.mock('../../src/config/database', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));
jest.mock('../../src/utils/cityScope', () => ({ resolveCityScope: async () => ({ cityId: 'city-1', unrestricted: false, dbReady: true }) }));
jest.mock('../../src/config/socket', () => ({ emitToCityAdmins: jest.fn() }));

import { enqueueApproval, replayKeyOf } from '../../src/utils/approvalQueue';

const fakeReq = (over: Record<string, unknown> = {}) => ({
  method: 'POST', baseUrl: '/api/finance', route: { path: '/expenses' }, params: {}, query: {},
  body: { category: 'Repairs', amount: 6000, approval_phone: '03001112222', approval_password: '123456', password: 'secret', otp: '1' },
  user: { id: 'staff-1', role: 'admin' }, headers: {}, ...over,
}) as never;

beforeEach(() => mockQuery.mockReset());

it('knows the route the entry came in on', () => {
  expect(replayKeyOf(fakeReq())).toBe('POST /api/finance/expenses');
  expect(replayKeyOf(fakeReq({ route: undefined }))).toBeNull();
});

it('stores the entry without approval codes or passwords', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 'req-1' }] });
  const out = await enqueueApproval(fakeReq(), { kind: 'expense', label: 'an expense', value: 6000 });
  expect(out).toEqual({ id: 'req-1' });
  const [sql, params] = mockQuery.mock.calls[0];
  expect(String(sql)).toContain('INSERT INTO approval_requests');
  const payload = JSON.parse(params[5]);
  expect(payload.body).toEqual({ category: 'Repairs', amount: 6000 });
  expect(params[4]).toBe('POST /api/finance/expenses');
  expect(params[7]).toBe('staff-1');
});

it('the same entry pressed twice returns the waiting one', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'req-1' }] });
  expect(await enqueueApproval(fakeReq(), { kind: 'expense', label: 'an expense', value: 6000 })).toEqual({ id: 'req-1' });
});

it('outside a real request nothing is queued', async () => {
  expect(await enqueueApproval(fakeReq({ route: undefined }), { kind: 'expense', label: 'x', value: 1 })).toBeNull();
  expect(mockQuery).not.toHaveBeenCalled();
});

it('every action the queue can run again is a real route', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/controllers/admin/approvals.controller.ts'), 'utf8');
  const keys = Array.from(src.matchAll(/'(POST) (\/api\/(admin|finance))(\/[^']+)':/g)).map((m) => ({ base: m[3], path: m[4] }));
  expect(keys.length).toBeGreaterThanOrEqual(9);
  const routes: Record<string, string> = {
    admin: fs.readFileSync(path.join(__dirname, '../../src/routes/admin.routes.ts'), 'utf8'),
    finance: fs.readFileSync(path.join(__dirname, '../../src/routes/finance.routes.ts'), 'utf8'),
  };
  for (const k of keys) {
    const re = new RegExp(`router\\.post\\(\\s*'${k.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`);
    expect({ route: `${k.base}${k.path}`, found: re.test(routes[k.base]) }).toEqual({ route: `${k.base}${k.path}`, found: true });
  }
});
