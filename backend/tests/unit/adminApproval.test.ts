// ============================================================================
// TWO-PERSON APPROVAL — the shared high-value money/stock sign-off primitive
// (utils/adminApproval) that backs free-order, refund, and stock controls.
// ============================================================================

import { jest } from '@jest/globals';

// Migration-60 probe: default ON for these tests; one test turns it off.
let logReady = true;
jest.mock('@/config/controlsSchema', () => ({
  hasApprovalValueLog: async () => logReady,
}));

import { approvalForValue, verifySecondApprover, APPROVAL_VALUE_THRESHOLD } from '@/utils/adminApproval';

const fakeReq = (over: any = {}) => ({ user: { id: 'admin-self' }, body: {}, ...over }) as any;

describe('approvalForValue', () => {
  it('does not require a second admin below the threshold (no log table yet)', async () => {
    logReady = false;
    const client = { query: jest.fn() } as any;
    const out = await approvalForValue(client, fakeReq(), APPROVAL_VALUE_THRESHOLD - 1);
    expect(out).toEqual({ approvedBy: null, approvedAt: null });
    expect(client.query).not.toHaveBeenCalled();
    logReady = true;
  });

  it('logs a small value-out action without asking for approval', async () => {
    const client = { query: jest.fn<any>().mockResolvedValueOnce({ rows: [{ total: '0' }] }).mockResolvedValue({ rows: [] }) } as any;
    const out = await approvalForValue(client, fakeReq(), 1000, { kind: 'waste' });
    expect(out.approvedBy).toBeNull();
    expect(String(client.query.mock.calls[1][0])).toContain('INSERT INTO approval_value_log');
    expect(client.query.mock.calls[1][1]).toEqual(['admin-self', 'waste', 1000, null]);
  });

  it('salami-slicing: small actions that add up past the DAILY limit need a second admin', async () => {
    const already = APPROVAL_VALUE_THRESHOLD - 100; // today's un-approved total so far
    const client = { query: jest.fn<any>().mockResolvedValueOnce({ rows: [{ total: String(already) }] }) } as any;
    await expect(approvalForValue(client, fakeReq({ body: {} }), 200, { kind: 'convert' }))
      .rejects.toMatchObject({ http: 400, message: expect.stringContaining('per day') });
  });

  it('requires approver phone + password at/above the threshold', async () => {
    const client = { query: jest.fn() } as any;
    await expect(approvalForValue(client, fakeReq({ body: {} }), APPROVAL_VALUE_THRESHOLD))
      .rejects.toMatchObject({ http: 400 });
  });
});

describe('verifySecondApprover', () => {
  it('rejects an invalid approver phone (400)', async () => {
    const client = { query: jest.fn() } as any;
    await expect(verifySecondApprover(client, fakeReq(), 'not-a-phone', 'pw'))
      .rejects.toMatchObject({ http: 400 });
  });

  // 400, not 401: a wrong approver password must not look like an expired
  // session (the admin panel logs the acting admin out on 401).
  it('rejects when no matching active admin is found (400)', async () => {
    const client = { query: jest.fn<any>().mockResolvedValue({ rows: [] }) } as any;
    await expect(verifySecondApprover(client, fakeReq(), '03001234567', 'pw'))
      .rejects.toMatchObject({ http: 400 });
  });

  it('requires login (401) when there is no acting admin', async () => {
    const client = { query: jest.fn() } as any;
    await expect(verifySecondApprover(client, fakeReq({ user: undefined }), '03001234567', 'pw'))
      .rejects.toMatchObject({ http: 401 });
  });
});
