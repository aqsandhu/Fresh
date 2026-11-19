// F1 (W20): the typed view of a caught error — same object, typed fields.
import { asCaughtError, caughtMessage } from '../../src/utils/caughtError';

describe('caught errors', () => {
  it('an Error with our http marker is the same object, fields readable', () => {
    const e = Object.assign(new Error('Only an out-for-delivery order can be returned'), { http: 409 });
    const view = asCaughtError(e);
    expect(view).toBe(e);
    expect(view.http).toBe(409);
    expect(view.message).toMatch(/out-for-delivery/);
  });

  it('a Postgres error keeps its code / detail / constraint', () => {
    const pg = { code: '23505', detail: 'Key (phone)=(1) already exists.', constraint: 'users_phone_key', message: 'duplicate key' };
    expect(asCaughtError(pg)).toMatchObject({ code: '23505', constraint: 'users_phone_key' });
  });

  it('a thrown string or nothing still reads safely', () => {
    expect(asCaughtError('boom')).toEqual({ message: 'boom' });
    expect(asCaughtError(undefined).message).toBeUndefined();
    expect(caughtMessage(null, 'fallback')).toBe('fallback');
    expect(caughtMessage(new Error('x'))).toBe('x');
  });
});
