/**
 * G36 (W24 confirmation round): a typo like 1,000,000,000,000 in a money box
 * (expense, worker salary, …) reached Postgres, overflowed the column
 * (SQLSTATE 22003) and the office saw "Internal server error". When the
 * request itself carries such a number it is the caller's mistake → 400 with
 * a clear message. An overflow our own SQL causes (nothing huge was sent)
 * stays a 500 so it reaches monitoring; a phone number is not "a number".
 */
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

import { clientInputError } from '../../src/middleware/errorHandler';

const overflow = Object.assign(new Error('numeric field overflow'), { code: '22003' });
const req = (body: unknown, query: unknown = {}) => ({ body, query, params: {}, path: '/api/finance/expenses', headers: {} }) as any;

describe('a number too large for the database (G36)', () => {
  it('sent by the caller → 400 with a clear message', () => {
    for (const body of [{ amount: 1e12 }, { amount: '99999999999' }, { items: [{ price: 5e10 }] }]) {
      const e = clientInputError(overflow, req(body));
      expect(e?.statusCode).toBe(400);
      expect(e?.message).toMatch(/too large/i);
    }
    expect(clientInputError(overflow, req({}, { limit: '10000000000' }))?.statusCode).toBe(400);
  });

  it('nothing huge in the request (our own SQL overflowed) → stays a server error', () => {
    expect(clientInputError(overflow, req({ amount: 500, phone: '03001112222', note: 'x' }))).toBeNull();
  });
});

// G37 (W25 round B — a fuzzer sent hostile input to all 211 write routes):
// a missing required value, a text longer than its column and a NUL character
// reached Postgres and came back as "Internal server error". When the
// request itself carries the problem it is the caller's mistake → 400.
describe('other database refusals caused by the request (G37)', () => {
  const pg = (code: string, message: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), { code, ...extra });

  it('text longer than its column', () => {
    const e = clientInputError(pg('22001', 'value too long for type character varying(255)'), req({ name: 'x'.repeat(300) }));
    expect(e?.statusCode).toBe(400);
    expect(e?.message).toMatch(/too long/i);
    // nothing that long was sent → our own bug, stays 500
    expect(clientInputError(pg('22001', 'value too long for type character varying(255)'), req({ name: 'short' }))).toBeNull();
  });

  it('a NUL character in the text', () => {
    const e = clientInputError(pg('22021', 'invalid byte sequence for encoding "UTF8": 0x00'), req({ note: 'a\u0000b' }));
    expect(e?.statusCode).toBe(400);
    expect(clientInputError(pg('22021', 'invalid byte sequence for encoding "UTF8": 0x00'), req({ note: 'ok' }))).toBeNull();
  });

  it('a required value not sent (named in the answer)', () => {
    const missing = pg('23502', 'null value in column "start_time" of relation "time_slots" violates not-null constraint', { column: 'start_time' });
    const e = clientInputError(missing, req({}));
    expect(e?.statusCode).toBe(400);
    expect(e?.message).toMatch(/start_time/);
    // it WAS sent → our code dropped it, stays 500
    expect(clientInputError(missing, req({ start_time: '09:00' }))).toBeNull();
  });
});

describe('a status the list does not know (G37, query fuzz)', () => {
  const badEnum = Object.assign(new Error('invalid input value for enum atta_request_status: "%"'), { code: '22P02' });
  it('?status=% → 400, not a server error', () => {
    expect(clientInputError(badEnum, req({}, { status: '%' }))?.statusCode).toBe(400);
  });
  it('a value we wrote ourselves stays a server error', () => {
    expect(clientInputError(badEnum, req({}, { status: 'pending' }))).toBeNull();
  });
});
