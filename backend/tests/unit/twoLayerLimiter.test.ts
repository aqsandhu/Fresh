// Busy read endpoints: per-session budget + per-IP ceiling. Many customers
// behind ONE address (mobile CGNAT, or every website visitor arriving through
// Vercel's proxy) must not use up each other's budget.
import express from 'express';
import request from 'supertest';
import type { Request } from 'express';

type Mod = typeof import('../../src/middleware/rateLimiter');

function loadInProduction(): Mod {
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let mod: Mod | undefined;
  jest.isolateModules(() => {
    mod = require('../../src/middleware/rateLimiter');
  });
  process.env.NODE_ENV = before;
  return mod!;
}

const tokenA = 'a'.repeat(40);
const tokenB = 'b'.repeat(40);

function app(mod: Mod, perSession: number, perIp: number) {
  const a = express();
  a.get('/x', ...mod.twoLayerLimiter({ name: 't', windowMs: 60_000, perSession, perIp, message: 'slow down' }), (_req, res) => res.json({ ok: true }));
  return a;
}

describe('sessionKey', () => {
  const { sessionKey } = loadInProduction();
  it('uses the bearer token or the token cookie, never shows the token', () => {
    const k = sessionKey({ headers: { authorization: `Bearer ${tokenA}` } } as unknown as Request);
    expect(k).toMatch(/^tk:[0-9a-f]{32}$/);
    expect(k).not.toContain(tokenA);
    expect(sessionKey({ headers: {}, cookies: { token: tokenA } } as unknown as Request)).toBe(k);
    expect(sessionKey({ headers: {} } as unknown as Request)).toBeNull();
    expect(sessionKey({ headers: { authorization: 'Bearer short' } } as unknown as Request)).toBeNull();
  });
});

describe('twoLayerLimiter', () => {
  it('two signed-in customers behind one address each get their own budget', async () => {
    const a = app(loadInProduction(), 3, 100);
    for (let i = 0; i < 3; i++) expect((await request(a).get('/x').set('Authorization', `Bearer ${tokenA}`)).status).toBe(200);
    expect((await request(a).get('/x').set('Authorization', `Bearer ${tokenA}`)).status).toBe(429);
    // A different customer on the same IP is not affected.
    expect((await request(a).get('/x').set('Authorization', `Bearer ${tokenB}`)).status).toBe(200);
  });

  it('anonymous visitors share only the high per-IP ceiling', async () => {
    const a = app(loadInProduction(), 3, 10);
    for (let i = 0; i < 10; i++) expect((await request(a).get('/x')).status).toBe(200);
    const blocked = await request(a).get('/x');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ success: false, message: 'slow down' });
  });

  it('made-up tokens do not escape the per-IP ceiling', async () => {
    const a = app(loadInProduction(), 3, 5);
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await request(a).get('/x').set('Authorization', `Bearer ${String(i).repeat(40)}`)).status);
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes.slice(5)).toEqual([429, 429]);
  });
});
