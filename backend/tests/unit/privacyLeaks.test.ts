// Security round (15 Nov 2026): what the server writes to its log, sends to
// the error tracker and echoes back must not carry a customer's password, PIN,
// address, email or tokens. Each case here leaked before its fix (found by a
// live production-mode probe with a local Sentry capture server).
import express from 'express';
import request from 'supertest';
import Joi from 'joi';
import { redactLogValue, redactString, redactUrl, summarizeForTracker } from '../../src/utils/redact';
import { validate } from '../../src/middleware/validation';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';

const { scrubSentryEvent, scrubSentryBreadcrumb } = jest.requireActual('../../src/config/sentry');

describe('validation errors never carry the rejected value', () => {
  const app = express();
  app.use(express.json());
  app.post(
    '/x',
    validate(Joi.object({
      phone: Joi.string().pattern(/^03\d{9}$/).required(),
      newPassword: Joi.string().min(8).required(),
      pin: Joi.string().pattern(/^\d{4}$/),
    })),
    (_req, res) => res.json({ ok: true })
  );
  app.use(errorHandler);

  it('a too-short password / bad PIN is not echoed (body or message)', async () => {
    const res = await request(app).post('/x').send({ phone: '0321999888', newPassword: 'Secr3t', pin: '98a7' });
    expect(res.status).toBe(422);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/Secr3t|98a7|0321999888/);
    expect(res.body.error.map((e: { field: string }) => e.field).sort()).toEqual(['newPassword', 'phone', 'pin']);
    for (const e of res.body.error) expect(e).not.toHaveProperty('value');
  });
});

describe('logs', () => {
  it('a validation detail { field: password, value } is redacted even if a value slips in', () => {
    const out = JSON.stringify(redactLogValue({ validationErrors: [
      { field: 'newPassword', value: 'Secr3t' },
      { field: 'data.pin', value: '9876' },
      { field: 'phone', value: '03219998887' },
      { field: 'quantity', value: 3 },
    ] }));
    expect(out).not.toMatch(/Secr3t|9876|3219998887/);
    expect(out).toContain('***887');
    expect(out).toContain('"value":3');
  });

  it('emails are masked in free text; ids and plain words are left', () => {
    expect(redactString('Key (email)=(ali.khan@gmail.com) already exists')).toBe('Key (email)=(a***@gmail.com) already exists');
    expect(redactString('order 5f0c7e3a-1b2c-4d5e-8f90-123456789abc failed')).toBe('order 5f0c7e3a-1b2c-4d5e-8f90-123456789abc failed');
  });

  it('a URL keeps its path but query values are judged by name', () => {
    expect(redactUrl('/api/x?token=abc.def&phone=03001234567&page=2')).toBe('/api/x?token=[redacted]&phone=***567&page=2');
    expect(redactUrl('/api/products/5')).toBe('/api/products/5');
  });
});

describe('error tracker (Sentry) sees the shape, not the content', () => {
  it('summarizes a body: secrets, address text, email, coordinates out; ids, amounts, codes in', () => {
    const s = summarizeForTracker({
      written_address: 'House 12, Street 4, Gulberg',
      latitude: 32.57,
      email: 'ali@example.com',
      password: 'Admin12345',
      bank_account: 'PK36SCBL0000001123456702',
      product_id: '5f0c7e3a-1b2c-4d5e-8f90-123456789abc',
      quantity: 2,
      coupon: 'SAVE10',
      date: '2026-11-15',
      items: [{ product_id: '5f0c7e3a-1b2c-4d5e-8f90-123456789abc', note: 'please ring twice' }],
    });
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/Gulberg|32\.57|ali@|Admin12345|PK36|ring twice/);
    expect(s).toMatchObject({ quantity: 2, coupon: 'SAVE10', date: '2026-11-15', latitude: '[location]', email: '[email]' });
    expect(text).toContain('5f0c7e3a-1b2c-4d5e-8f90-123456789abc');
  });

  it('a multipart upload body (door photo + address) is not sent at all', () => {
    const event = scrubSentryEvent({
      request: {
        url: 'https://api.test/api/addresses',
        data: '------b\r\nContent-Disposition: form-data; name="written_address"\r\n\r\nHouse 12 Gulberg\r\n------b--',
        headers: { authorization: 'Bearer eyJabc' },
      },
    });
    const text = JSON.stringify(event);
    expect(text).not.toMatch(/Gulberg|eyJabc/);
    expect(event.request.data).toMatch(/non-JSON body not sent/);
  });

  it('cookies, query string and URL query are redacted', () => {
    const event = scrubSentryEvent({
      request: {
        url: 'https://api.test/api/x?token=abc123&page=2',
        query_string: 'token=abc123&phone=03001234567&page=2',
        cookies: { refreshToken: 'rt-secret', fb_session: 'sess-secret' },
      },
    });
    const text = JSON.stringify(event);
    expect(text).not.toMatch(/abc123|3001234567|rt-secret|sess-secret/);
    expect(text).toContain('page=2');
  });

  it('an outgoing-call breadcrumb does not carry an access token in its URL', () => {
    const b = scrubSentryBreadcrumb({
      category: 'http',
      data: { url: 'https://graph.example.com/v1/messages?access_token=EAAG-secret', method: 'POST', 'http.query': 'access_token=EAAG-secret' },
    });
    expect(JSON.stringify(b)).not.toContain('EAAG-secret');
    expect(b.data.method).toBe('POST');
  });
});

describe('404', () => {
  it('names the path only — the query string is not echoed', async () => {
    const app = express();
    app.use(notFoundHandler);
    const res = await request(app).get('/api/nope?phone=03001234567&password=Hunter22');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Route /api/nope not found');
  });
});
