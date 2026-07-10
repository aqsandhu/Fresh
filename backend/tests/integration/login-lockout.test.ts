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
