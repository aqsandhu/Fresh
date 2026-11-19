// A40 (round 9): the OTP send gate on a REAL database. "Check limits" and
// "save the code" used to be seconds apart (the SMS call in between), so ten
// requests for one number at the same moment all passed and each sent an SMS.
/* eslint-disable @typescript-eslint/no-explicit-any */
const DATABASE_URL = process.env.E2E_DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

suite('OTP send gate on a real database (A40)', () => {
  let otp: any;
  let db: any;
  const phone = () => `+92399${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 10)}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.DB_SSL = 'false';
    db = await import('../../src/config/database');
    otp = await import('../../src/services/otpStore.service');
    await otp.ensureOtpTable();
  });
  afterAll(async () => {
    await db.closePool();
  });

  it('10 requests at once for one number → exactly one gets a slot', async () => {
    const p = phone();
    const results = await Promise.all(Array.from({ length: 10 }, () => otp.reserveOtpSend(p, '10.99.0.1')));
    expect(results.filter((r: any) => r.allowed)).toHaveLength(1);
    expect(results.filter((r: any) => !r.allowed && r.retryAfterSec > 0)).toHaveLength(9);
  });

  it('a failed send gives the slot back (no cooldown, no quota used)', async () => {
    const p = phone();
    const first = await otp.reserveOtpSend(p, null);
    expect(first.allowed).toBe(true);
    await otp.cancelOtpSend(first.reservationId);
    expect((await otp.reserveOtpSend(p, null)).allowed).toBe(true);
  });

  it('a reserved slot cannot be verified until the code is stored, then it can', async () => {
    const p = phone();
    const slot = await otp.reserveOtpSend(p, null);
    expect((await otp.verifyStoredOtp(p, '123456')).success).toBe(false);
    await otp.completeOtpSend(slot.reservationId, p, '654321', 'sms');
    expect((await otp.verifyStoredOtp(p, '654321')).success).toBe(true);
  });
});
