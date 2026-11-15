// ============================================================================
// PASSWORD LOGIN — PER-ACCOUNT LOCKOUT integration tests
// The PIN flow always had a per-account lockout; admin/rider/customer
// PASSWORD logins only had the per-IP limiter, so a botnet rotating IPs could
// brute-force one known account. These tests pin the fix: after
// PIN_FAIL_THRESHOLD wrong passwords the ACCOUNT locks (429 + Retry-After)
// regardless of source, and a correct login clears the counter.
// ============================================================================

import { jest } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { query } from '@/config/database';
import { PIN_FAIL_THRESHOLD } from '@/config/pinLockout';
import adminRoutes from '@/routes/admin.routes';
import riderRoutes from '@/routes/rider.routes';
import authRoutes from '@/routes/auth.routes';
import { buildApp } from './helpers';

const mockQuery = query as jest.MockedFunction<typeof query>;

const adminApp = buildApp('/api/admin', adminRoutes);
const riderApp = buildApp('/api/rider', riderRoutes);
const authApp = buildApp('/api/auth', authRoutes);

const PASSWORD = 'Secret123!';
const HASH = bcrypt.hashSync(PASSWORD, 4);

function ok<T>(rows: T[]): any {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

// The lockout store is a module-level map — a unique phone per test keeps
// cases isolated from each other.
let counter = 10;
const uniquePhone = () => `+92300111${(counter++).toString().padStart(4, '0')}`;

function mockAdminDb(phone: string): void {
  mockQuery.mockImplementation((async (sql: unknown) => {
    const text = String(sql);
    if (text.includes('JOIN admins')) {
      return ok([
        {
          id: 'admin-1',
          phone,
          full_name: 'Boss',
          email: null,
          password_hash: HASH,
          role: 'admin',
          status: 'active',
          admin_role_id: null,
        },
      ]);
    }
    return ok([]);
  }) as never);
}

function mockRiderDb(phone: string): void {
  mockQuery.mockImplementation((async (sql: unknown) => {
    const text = String(sql);
    if (text.includes('JOIN riders')) {
      return ok([
        {
          id: 'user-r1',
          phone,
          full_name: 'Rider',
          email: null,
          password_hash: HASH,
          role: 'rider',
          status: 'active',
          rider_id: 'rider-1',
          rider_status: 'available',
          verification_status: 'verified',
        },
      ]);
    }
    return ok([]);
  }) as never);
}

function mockCustomerDb(phone: string): void {
  mockQuery.mockImplementation((async (sql: unknown) => {
    const text = String(sql);
    if (text.includes('FROM users WHERE phone')) {
      return ok([
        {
          id: 'user-c1',
          phone,
          full_name: 'Customer',
          email: null,
          password_hash: HASH,
          role: 'customer',
          status: 'active',
          is_phone_verified: true,
        },
      ]);
    }
    return ok([]);
  }) as never);
}

describe('Admin login per-account lockout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('locks the account after PIN_FAIL_THRESHOLD wrong passwords, even for the CORRECT password afterwards', async () => {
    const phone = uniquePhone();
    mockAdminDb(phone);

    for (let i = 1; i < PIN_FAIL_THRESHOLD; i++) {
      const res = await request(adminApp)
        .post('/api/admin/login')
        .send({ phone, password: 'wrong-password' });
      expect(res.status).toBe(401);
    }

    // The threshold-hitting attempt opens the lockout window.
    const locking = await request(adminApp)
      .post('/api/admin/login')
      .send({ phone, password: 'wrong-password' });
    expect(locking.status).toBe(429);
    expect(Number(locking.headers['retry-after'])).toBeGreaterThan(0);

    // Even the RIGHT password is refused while the account is locked.
    const correct = await request(adminApp)
      .post('/api/admin/login')
      .send({ phone, password: PASSWORD });
    expect(correct.status).toBe(429);
  });

  it('clears the failure counter on a successful login', async () => {
    const phone = uniquePhone();
    mockAdminDb(phone);

    // Two failures, then a success.
    for (let i = 0; i < 2; i++) {
      await request(adminApp).post('/api/admin/login').send({ phone, password: 'nope-nope' });
    }
    const success = await request(adminApp)
      .post('/api/admin/login')
      .send({ phone, password: PASSWORD });
    expect(success.status).toBe(200);
    expect(success.body.success).toBe(true);

    // A fresh round of (threshold - 1) failures must NOT lock — proof the
    // counter reset instead of accumulating 2 + 4 ≥ threshold.
    let last = 0;
    for (let i = 1; i < PIN_FAIL_THRESHOLD; i++) {
      const res = await request(adminApp)
        .post('/api/admin/login')
        .send({ phone, password: 'nope-nope' });
      last = res.status;
    }
    expect(last).toBe(401);
  });

  it('counts attempts against unknown phones so admin accounts cannot be probed for free', async () => {
    const phone = uniquePhone();
    // No admin row for this phone at all.
    mockQuery.mockImplementation((async () => ok([])) as never);

    for (let i = 0; i < PIN_FAIL_THRESHOLD; i++) {
      const res = await request(adminApp)
        .post('/api/admin/login')
        .send({ phone, password: 'guess-guess' });
      expect(res.status).toBe(401);
    }

    // The lock opened on the threshold failure — the next attempt is refused
    // before any credential check.
    const res = await request(adminApp)
      .post('/api/admin/login')
      .send({ phone, password: 'guess-guess' });
    expect(res.status).toBe(429);
  });
});

describe('Rider login per-account lockout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('locks the account after PIN_FAIL_THRESHOLD wrong passwords', async () => {
    const phone = uniquePhone();
    mockRiderDb(phone);

    let statuses: number[] = [];
    for (let i = 0; i < PIN_FAIL_THRESHOLD; i++) {
      const res = await request(riderApp)
        .post('/api/rider/login')
        .send({ phone, password: 'wrong-password' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, -1)).toEqual(Array(PIN_FAIL_THRESHOLD - 1).fill(401));
    expect(statuses[statuses.length - 1]).toBe(429);

    const correct = await request(riderApp)
      .post('/api/rider/login')
      .send({ phone, password: PASSWORD });
    expect(correct.status).toBe(429);
  });
});

describe('Customer password login per-account lockout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('locks the account after PIN_FAIL_THRESHOLD wrong passwords', async () => {
    const phone = uniquePhone();
    mockCustomerDb(phone);

    for (let i = 1; i < PIN_FAIL_THRESHOLD; i++) {
      const res = await request(authApp)
        .post('/api/auth/login')
        .send({ phone, password: 'wrong-password' });
      expect(res.status).toBe(401);
    }

    const locking = await request(authApp)
      .post('/api/auth/login')
      .send({ phone, password: 'wrong-password' });
    expect(locking.status).toBe(429);
  });
});

// Admin two-step login (config/admin2fa.ts). It follows the OTP rule used
// everywhere else: with OTP bypass on, the fixed bypass code is the second step.
describe('Admin two-step login (OTP bypass rule)', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OTP_BYPASS_ENABLED = 'true';
    process.env.OTP_BYPASS_CODE = '246810';
    delete process.env.ADMIN_2FA_ENABLED;
  });
  afterEach(() => {
    process.env.OTP_BYPASS_ENABLED = saved.OTP_BYPASS_ENABLED;
    process.env.OTP_BYPASS_CODE = saved.OTP_BYPASS_CODE;
    process.env.ADMIN_2FA_ENABLED = saved.ADMIN_2FA_ENABLED;
    if (saved.OTP_BYPASS_ENABLED === undefined) delete process.env.OTP_BYPASS_ENABLED;
    if (saved.OTP_BYPASS_CODE === undefined) delete process.env.OTP_BYPASS_CODE;
    if (saved.ADMIN_2FA_ENABLED === undefined) delete process.env.ADMIN_2FA_ENABLED;
  });

  it('a correct password alone returns a challenge and NO tokens', async () => {
    const phone = uniquePhone();
    mockAdminDb(phone);
    const res = await request(adminApp).post('/api/admin/login').send({ phone, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.requires_otp).toBe(true);
    expect(res.body.data.otp_bypass).toBe(true);
    expect(res.body.data.tokens).toBeUndefined();
    expect(res.body.data.user).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('246810'); // the code is never echoed
  });

  it('password + the bypass code signs in; a wrong code does not', async () => {
    const phone = uniquePhone();
    mockAdminDb(phone);
    const wrong = await request(adminApp).post('/api/admin/login').send({ phone, password: PASSWORD, otp: '000000' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.data?.tokens).toBeUndefined();

    const right = await request(adminApp).post('/api/admin/login').send({ phone, password: PASSWORD, otp: '246810' });
    expect(right.status).toBe(200);
    expect(right.body.data.tokens.accessToken).toBeTruthy();
  });

  it('wrong codes count towards the lockout even though the password is right', async () => {
    const phone = uniquePhone();
    mockAdminDb(phone);
    let last = 0;
    for (let i = 0; i < PIN_FAIL_THRESHOLD; i++) {
      last = (await request(adminApp).post('/api/admin/login').send({ phone, password: PASSWORD, otp: '111111' })).status;
    }
    expect(last).toBe(429);
    // Locked: even the right code is refused now.
    const res = await request(adminApp).post('/api/admin/login').send({ phone, password: PASSWORD, otp: '246810' });
    expect(res.status).toBe(429);
  });

  it('the code is ignored when the wrong password is sent with it', async () => {
    const phone = uniquePhone();
    mockAdminDb(phone);
    const res = await request(adminApp).post('/api/admin/login').send({ phone, password: 'wrong-password', otp: '246810' });
    expect(res.status).toBe(401);
  });

  it('ADMIN_2FA_ENABLED=false switches the second step off', async () => {
    process.env.ADMIN_2FA_ENABLED = 'false';
    const phone = uniquePhone();
    mockAdminDb(phone);
    const res = await request(adminApp).post('/api/admin/login').send({ phone, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
  });
});
