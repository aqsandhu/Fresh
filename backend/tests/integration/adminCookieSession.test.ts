// Admin panel session in HttpOnly cookies (owner decision Q2: the panel is on
// admin.<site>, the API on api.<site>). The panel says so with
// X-Client-Platform: admin-cookie; its cookies have their own names, so an
// admin session and a customer session can never stand in for each other.
import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import type { Request, Response } from 'express';
import { query } from '@/config/database';
import authRoutes from '@/routes/auth.routes';
import { buildApp, signAccessToken } from './helpers';
import {
  adminCookiesEnabled,
  clearSessionCookies,
  isAdminCookieClient,
  setSessionCookies,
} from '@/utils/authCookies';

const mockQuery = query as jest.MockedFunction<typeof query>;
const app = buildApp('/api/auth', authRoutes);
const ok = (rows: unknown[]) => ({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] }) as never;

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  jest.clearAllMocks();
});

const reqWith = (platform?: string) => ({ get: (h: string) => (h.toLowerCase() === 'x-client-platform' ? platform : undefined) }) as never;

describe('who gets a cookie session', () => {
  it('is on in production, off elsewhere, and the env flag wins', () => {
    delete process.env.ADMIN_AUTH_COOKIES;
    process.env.NODE_ENV = 'production';
    expect(adminCookiesEnabled()).toBe(true);
    process.env.NODE_ENV = 'development';
    expect(adminCookiesEnabled()).toBe(false);
    process.env.ADMIN_AUTH_COOKIES = 'true';
    expect(adminCookiesEnabled()).toBe(true);
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_AUTH_COOKIES = 'false';
    expect(adminCookiesEnabled()).toBe(false);
  });

  it('only a panel that asks for it (admin-cookie) — an older bearer-mode panel keeps its tokens', () => {
    process.env.ADMIN_AUTH_COOKIES = 'true';
    expect(isAdminCookieClient(reqWith('admin-cookie'))).toBe(true);
    expect(isAdminCookieClient(reqWith('admin'))).toBe(false);
    expect(isAdminCookieClient(reqWith('website'))).toBe(false);
    expect(isAdminCookieClient(reqWith(undefined))).toBe(false);
  });
});

describe('the cookies themselves', () => {
  const mini = express();
  mini.post('/set', (req: Request, res: Response) => {
    setSessionCookies(req, res, { accessToken: signAccessToken({ role: 'admin' }), refreshToken: 'r.r.r' });
    res.json({ ok: true });
  });
  mini.post('/clear', (req: Request, res: Response) => {
    clearSessionCookies(req, res);
    res.json({ ok: true });
  });

  it('admin: own names, HttpOnly, SameSite=Strict, no Domain, refresh only under /api/auth', async () => {
    process.env.ADMIN_AUTH_COOKIES = 'true';
    const res = await request(mini).post('/set').set('X-Client-Platform', 'admin-cookie');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const access = cookies.find((c) => c.startsWith('admin_token='))!;
    const refresh = cookies.find((c) => c.startsWith('admin_refresh='))!;
    expect(cookies.some((c) => /^(token|refreshToken)=/.test(c))).toBe(false);
    for (const c of [access, refresh]) {
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/SameSite=Strict/i);
      expect(c).not.toMatch(/Domain=/i);
    }
    expect(refresh).toMatch(/Path=\/api\/auth/);
  });

  it('logout clears the admin cookies for an admin-cookie caller', async () => {
    process.env.ADMIN_AUTH_COOKIES = 'true';
    const res = await request(mini).post('/clear').set('X-Client-Platform', 'admin-cookie');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('admin_token=;'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('admin_refresh=;'))).toBe(true);
  });
});

describe('reading the session', () => {
  const me = (cookie: string, platform?: string) => {
    const r = request(app).get('/api/auth/me').set('Cookie', cookie);
    return platform ? r.set('X-Client-Platform', platform) : r;
  };
  const adminToken = signAccessToken({ userId: 'admin-1', role: 'admin' });
  const customerToken = signAccessToken({ userId: 'user-1', role: 'customer' });
  beforeEach(() => {
    process.env.ADMIN_AUTH_COOKIES = 'true';
    mockQuery.mockImplementation((async (_sql: string, params?: unknown[]) =>
      ok([{ id: params?.[0] ?? 'user-1', phone: '+923001234567', role: params?.[0] === 'admin-1' ? 'admin' : 'customer', status: 'active', full_name: 'X' }])) as never);
  });

  it('the admin cookie signs in a panel that sends admin-cookie', async () => {
    expect((await me(`admin_token=${adminToken}`, 'admin-cookie')).status).toBe(200);
  });

  it('the admin cookie is ignored for anyone else (website, apps, plain requests)', async () => {
    expect((await me(`admin_token=${adminToken}`, 'website')).status).toBe(401);
    expect((await me(`admin_token=${adminToken}`)).status).toBe(401);
  });

  it('a customer cookie never signs in the admin panel', async () => {
    expect((await me(`token=${customerToken}`, 'admin-cookie')).status).toBe(401);
    expect((await me(`token=${customerToken}`, 'website')).status).toBe(200);
  });
});
