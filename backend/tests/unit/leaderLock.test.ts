// ============================================================================
// LEADER LOCK — unit tests
// Schedulers run inside the web process; runExclusively must make a job run
// on exactly one instance (advisory lock) and always end its transaction.
// ============================================================================

import { jest } from '@jest/globals';

const mockClientQuery = jest.fn<any>();
jest.mock('@/config/database', () => ({
  query: jest.fn(),
  withClient: jest.fn(async (fn: any) => fn({ query: mockClientQuery })),
  withTransaction: jest.fn(),
  testConnection: jest.fn(),
  closePool: jest.fn(),
}));

import { runExclusively } from '@/utils/leaderLock';

function answer(lockWon: boolean) {
  mockClientQuery.mockImplementation(async (sql: string) => {
    if (String(sql).includes('pg_try_advisory_xact_lock')) {
      return { rows: [{ ok: lockWon }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

const sqlCalls = () => mockClientQuery.mock.calls.map((c) => String(c[0]));

describe('runExclusively', () => {
  beforeEach(() => mockClientQuery.mockReset());

  it('runs the job when the advisory lock is won and releases it afterwards', async () => {
    answer(true);
    const job = jest.fn<any>().mockResolvedValue(42);

    const result = await runExclusively('scheduler:test', job);

    expect(result).toBe(42);
    expect(job).toHaveBeenCalledTimes(1);
    const sqls = sqlCalls();
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toContain('pg_try_advisory_xact_lock');
    expect(sqls[sqls.length - 1]).toBe('ROLLBACK');
  });

  it('skips the job (returns null) when another instance holds the lock', async () => {
    answer(false);
    const job = jest.fn<any>().mockResolvedValue('should not run');

    const result = await runExclusively('scheduler:test', job);

    expect(result).toBeNull();
    expect(job).not.toHaveBeenCalled();
    expect(sqlCalls()[sqlCalls().length - 1]).toBe('ROLLBACK');
  });

  it('still ends the transaction when the job throws, and propagates the error', async () => {
    answer(true);
    const job = jest.fn<any>().mockRejectedValue(new Error('boom'));

    await expect(runExclusively('scheduler:test', job)).rejects.toThrow('boom');
    expect(sqlCalls()[sqlCalls().length - 1]).toBe('ROLLBACK');
  });

  it('uses the lock name as the advisory-lock key', async () => {
    answer(true);
    await runExclusively('scheduler:reconciliation', async () => undefined);
    const lockCall = mockClientQuery.mock.calls.find((c) =>
      String(c[0]).includes('pg_try_advisory_xact_lock')
    );
    expect(lockCall?.[1]).toEqual(['scheduler:reconciliation']);
  });
});
