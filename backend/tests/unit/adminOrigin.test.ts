// N8 (session 10): the admin cookie session answers only the admin panel.
import express from 'express';
import request from 'supertest';
import { adminCookieOriginGuard, allowedAdminOrigins } from '../../src/middleware/adminOrigin';

const app = express();
app.use(adminCookieOriginGuard);
app.get('/api/auth/socket-token', (_req, res) => res.json({ ok: true }));

const ADMIN = 'https://admin.freshbazar.example';
const saved = { ...process.env };

describe('adminCookieOriginGuard', () => {
  beforeEach(() => {
    process.env.ADMIN_AUTH_COOKIES = 'true';
    process.env.ADMIN_PANEL_ORIGIN = `${ADMIN}/, http://localhost:5173`;
  });
  afterAll(() => {
    process.env = saved;
  });

  it('reads one or more addresses, ignoring case, spaces and a trailing slash', () => {
    expect(allowedAdminOrigins()).toEqual([ADMIN, 'http://localhost:5173']);
    expect(allowedAdminOrigins({ ADMIN_PANEL_ORIGIN: '' } as NodeJS.ProcessEnv)).toEqual([]);
  });

  it('the admin panel itself goes through', async () => {
    const r = await request(app).get('/api/auth/socket-token').set('X-Client-Platform', 'admin-cookie').set('Origin', ADMIN);
    expect(r.status).toBe(200);
  });

  it('the website (same site, other origin) asking for the admin session is refused', async () => {
    const r = await request(app).get('/api/auth/socket-token').set('X-Client-Platform', 'admin-cookie').set('Origin', 'https://freshbazar.example');
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/admin panel/);
  });

  it('a Referer from elsewhere is refused when there is no Origin; "null" origins too', async () => {
    const viaReferer = await request(app).get('/api/auth/socket-token').set('X-Client-Platform', 'admin-cookie').set('Referer', 'https://evil.example/page');
    expect(viaReferer.status).toBe(403);
    const sandboxed = await request(app).get('/api/auth/socket-token').set('X-Client-Platform', 'admin-cookie').set('Origin', 'null');
    expect(sandboxed.status).toBe(403);
  });

  it('website / app callers (no admin-cookie header) and non-browser callers are untouched', async () => {
    expect((await request(app).get('/api/auth/socket-token').set('Origin', 'https://freshbazar.example')).status).toBe(200);
    expect((await request(app).get('/api/auth/socket-token').set('X-Client-Platform', 'admin-cookie')).status).toBe(200);
  });

  it('not configured = the old behaviour', async () => {
    delete process.env.ADMIN_PANEL_ORIGIN;
    const r = await request(app).get('/api/auth/socket-token').set('X-Client-Platform', 'admin-cookie').set('Origin', 'https://anything.example');
    expect(r.status).toBe(200);
  });
});
