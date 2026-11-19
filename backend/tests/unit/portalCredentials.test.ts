/**
 * Bug B38 (round 10): a shareholder / OCP password or PIN change left every
 * token issued before it working for up to 12 hours (portal tokens have no
 * refresh token to revoke). A token issued before the account's last change is
 * now refused; one issued in the same second or later still works; accounts
 * that never changed (or a database before migration 74) refuse nothing.
 */
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

import { query } from '../../src/config/database';
import { markCredentialsChanged, tokenPredatesCredentialChange, hasCredentialsChangedColumn } from '../../src/utils/portalCredentials';

const mockQuery = query as unknown as jest.Mock;

describe('portal credential change (B38)', () => {
  const changed = '2026-11-19T10:00:00.700+00:00';
  const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

  it('a token issued before the change is refused', () => {
    expect(tokenPredatesCredentialChange(at('2026-11-19T09:59:59Z'), changed)).toBe(true);
    expect(tokenPredatesCredentialChange(at('2026-11-18T10:00:00Z'), new Date(changed))).toBe(true);
  });

  it('one issued in the same second or later works; never changed refuses nothing', () => {
    expect(tokenPredatesCredentialChange(at('2026-11-19T10:00:00Z'), changed)).toBe(false);
    expect(tokenPredatesCredentialChange(at('2026-11-19T10:05:00Z'), changed)).toBe(false);
    expect(tokenPredatesCredentialChange(at('2026-11-19T09:00:00Z'), null)).toBe(false);
    expect(tokenPredatesCredentialChange(undefined, changed)).toBe(false);
    expect(tokenPredatesCredentialChange(123, 'not a date')).toBe(false);
  });

  it('marking a change writes the time only once the column exists (migration 74)', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await markCredentialsChanged('order_collection_points', 'ocp-1');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{}] }).mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await markCredentialsChanged('shareholders', 's-1');
    expect(mockQuery).toHaveBeenLastCalledWith('UPDATE shareholders SET credentials_changed_at = NOW() WHERE id = $1', ['s-1']);
    // remembered: no second probe
    mockQuery.mockReset();
    await expect(hasCredentialsChangedColumn('shareholders')).resolves.toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(hasCredentialsChangedColumn('order_collection_points')).resolves.toBe(false);
  });
});
