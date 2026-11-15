// Phone numbers, CNICs, passwords, codes and tokens must never reach a log line.
import { Writable } from 'stream';
import winston from 'winston';
import { redactLogValue, redactString } from '../../src/utils/redact';

describe('redactString', () => {
  it.each([
    ['login +923001234567 ok', 'login ***567 ok'],
    ['call 03001234567', 'call ***567'],
    ['call 0300-1234567 now', 'call ***567 now'],
    ['00923001234567', '***567'],
    ['GET /api/auth/check?phone=923001234567 200', 'GET /api/auth/check?phone=***567 200'],
    ['Key (phone)=(+923001234567) already exists.', 'Key (phone)=(***567) already exists.'],
    ['cnic 35202-1234567-1 on file', 'cnic *****-*******-* on file'],
  ])('%s', (input, out) => {
    expect(redactString(input)).toBe(out);
  });

  it.each([
    'order ORD-20261115-0001',
    'id 3a1b2c3d-4e5f-4a7b-8c9d-930012345678',
    'took 1731600000000 ms',
    'total 1234.50',
    'uploads/products/03001234567x.jpg',
  ])('leaves alone: %s', (text) => {
    expect(redactString(text)).toBe(text);
  });
});

describe('redactLogValue', () => {
  it('hides phone-like and secret keys, keeps ids', () => {
    const out = redactLogValue({
      userId: 'u-1',
      phone: '+923001234567',
      normalizedPhone: '+923009998887',
      customer_phone: 3001234567,
      show_customer_phone: true,
      password: 'Admin12345',
      otp: '123789',
      refreshToken: 'eyJ...',
      code: '22P02',
      nested: { body: { phone: '03001234567', pin: '1234' } },
    });
    expect(out).toEqual({
      userId: 'u-1',
      phone: '***567',
      normalizedPhone: '***887',
      customer_phone: '***567',
      show_customer_phone: true,
      password: '[redacted]',
      otp: '[redacted]',
      refreshToken: '[redacted]',
      code: '22P02',
      nested: { body: { phone: '***567', pin: '[redacted]' } },
    });
  });

  it('turns an Error into a readable, redacted copy without changing the original', () => {
    const err = Object.assign(new Error('duplicate +923001234567'), { code: '23505', detail: 'Key (phone)=(03001234567) already exists.' });
    const out = redactLogValue({ error: err }) as { error: Record<string, unknown> };
    expect(out.error).toMatchObject({ name: 'Error', message: 'duplicate ***567', code: '23505', detail: 'Key (phone)=(***567) already exists.' });
    expect(err.message).toBe('duplicate +923001234567');
  });

  it('survives cycles', () => {
    const a: Record<string, unknown> = { phone: '03001234567' };
    a.self = a;
    expect(redactLogValue(a)).toEqual({ phone: '***567', self: '[circular]' });
  });
});

describe('the real logger', () => {
  // tests/setup.ts replaces the logger with a mock for every suite; this one needs the real thing.
  const logger: winston.Logger = jest.requireActual('../../src/utils/logger').default;
  it('writes no phone number, password or code', async () => {
    let written = '';
    const sink = new winston.transports.Stream({
      stream: new Writable({ write(chunk, _enc, cb) { written += chunk.toString(); cb(); } }),
      format: winston.format.json(),
    });
    logger.add(sink);
    try {
      logger.info('Admin login attempt received from +923001234567', { phone: '03001234567', password: 'Admin12345', otp: '123789', userId: 'u-9' });
      await new Promise((r) => setImmediate(r));
    } finally {
      logger.remove(sink);
    }
    expect(written).toContain('u-9');
    expect(written).toContain('***567');
    expect(written).not.toMatch(/3001234567|Admin12345|123789/);
  });
});

describe('Sentry events', () => {
  // Imported lazily so the Sentry SDK is only loaded by this block.
  const { scrubSentryEvent } = jest.requireActual('../../src/config/sentry');

  it('scrubs the request, extra data, messages and breadcrumbs', () => {
    const event = scrubSentryEvent({
      message: 'failed for 03001234567',
      request: {
        url: 'https://api.test/api/auth/check?phone=923001234567',
        headers: { authorization: 'Bearer eyJabc', cookie: 'fb_rt=xyz', 'user-agent': 'jest' },
        data: JSON.stringify({ phone: '+923001234567', password: 'Admin12345', name: 'Ali' }),
      },
      extra: { phone: '03001234567', orderId: 'o-1' },
      exception: { values: [{ type: 'Error', value: 'Key (phone)=(+923001234567) already exists.' }] },
      breadcrumbs: [{ message: 'GET /x?phone=03001234567', data: { otp: '123789' } }],
    });
    const text = JSON.stringify(event);
    expect(text).not.toMatch(/3001234567|Admin12345|123789|eyJabc|xyz/);
    expect(text).toContain('Ali');
    expect(text).toContain('o-1');
    expect(text).toContain('jest');
  });
});
