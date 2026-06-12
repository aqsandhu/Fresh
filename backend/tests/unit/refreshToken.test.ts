// ============================================================================
// REFRESH TOKEN SERVICE — revocation must FAIL CLOSED
// ----------------------------------------------------------------------------
// Every issued refresh token is persisted (authTokens.issueTokenPair), so
// "no active row" always means revoked/expired/forged. These tests pin the
// fail-closed contract: DB errors and missing rows both deny the refresh.
// ============================================================================

import { jest } from '@jest/globals';
import { query } from '@/config/database';
import {
  isRefreshTokenAllowed,
  hashRefreshToken,
  persistRefreshToken,
  revokeRefreshToken,
} from '@/services/refreshToken.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function ok<T>(rows: T[]): any {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

describe('isRefreshTokenAllowed', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows a token with an active row', async () => {
    mockQuery.mockResolvedValueOnce(ok([{ id: 'row-1' }]));
    await expect(isRefreshTokenAllowed('token-abc')).resolves.toBe(true);
  });

  it('denies a token with no active row (revoked/expired/forged)', async () => {
    mockQuery.mockResolvedValueOnce(ok([]));
    await expect(isRefreshTokenAllowed('token-abc')).resolves.toBe(false);
  });

  it('denies a token with no row even when the table is otherwise empty (no fail-open fallback)', async () => {
    // The old implementation issued a second "any row?" probe and allowed the
    // refresh when the table was empty. There must be exactly ONE query now.
    mockQuery.mockResolvedValue(ok([]));
    await expect(isRefreshTokenAllowed('token-abc')).resolves.toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('FAILS CLOSED when the database errors', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    await expect(isRefreshTokenAllowed('token-abc')).resolves.toBe(false);
  });

  it('queries by SHA-256 hash, never the raw token', async () => {
    mockQuery.mockResolvedValueOnce(ok([{ id: 'row-1' }]));
    await isRefreshTokenAllowed('token-abc');
    const params = mockQuery.mock.calls[0][1] as string[];
    expect(params[0]).toBe(hashRefreshToken('token-abc'));
    expect(params[0]).not.toContain('token-abc');
  });
});

describe('persist / revoke round-trip SQL', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists the hashed token with an expiry', async () => {
    mockQuery.mockResolvedValueOnce(ok([]));
    await persistRefreshToken('user-1', 'token-abc');
    const [sql, params] = mockQuery.mock.calls[0] as [string, any[]];
    expect(sql).toContain('INSERT INTO refresh_tokens');
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe(hashRefreshToken('token-abc'));
    expect(params[2]).toBeInstanceOf(Date);
  });

  it('revokes by hash', async () => {
    mockQuery.mockResolvedValueOnce(ok([]));
    await revokeRefreshToken('token-abc');
    const [sql, params] = mockQuery.mock.calls[0] as [string, any[]];
    expect(sql).toContain('SET revoked_at = NOW()');
    expect(params[0]).toBe(hashRefreshToken('token-abc'));
  });
});
