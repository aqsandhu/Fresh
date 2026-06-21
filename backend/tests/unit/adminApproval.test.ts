// ============================================================================
// TWO-PERSON APPROVAL — the shared high-value money/stock sign-off primitive
// (utils/adminApproval) that backs free-order, refund, and stock controls.
// ============================================================================

import { jest } from '@jest/globals';
import { approvalForValue, verifySecondApprover, APPROVAL_VALUE_THRESHOLD } from '@/utils/adminApproval';

const fakeReq = (over: any = {}) => ({ user: { id: 'admin-self' }, body: {}, ...over }) as any;

describe('approvalForValue', () => {
  it('does not require a second admin below the threshold', async () => {
    const client = { query: jest.fn() } as any;
    const out = await approvalForValue(client, fakeReq(), APPROVAL_VALUE_THRESHOLD - 1);
    expect(out).toEqual({ approvedBy: null, approvedAt: null });
    expect(client.query).not.toHaveBeenCalled();
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

  it('rejects when no matching active admin is found (401)', async () => {
    const client = { query: jest.fn<any>().mockResolvedValue({ rows: [] }) } as any;
    await expect(verifySecondApprover(client, fakeReq(), '03001234567', 'pw'))
      .rejects.toMatchObject({ http: 401 });
  });

  it('requires login (401) when there is no acting admin', async () => {
    const client = { query: jest.fn() } as any;
    await expect(verifySecondApprover(client, fakeReq({ user: undefined }), '03001234567', 'pw'))
      .rejects.toMatchObject({ http: 401 });
  });
});
