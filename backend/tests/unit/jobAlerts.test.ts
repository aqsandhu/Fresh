// A failed background job (the daily books check is an anti-corruption control)
// must reach the owner — not only the server log — and must not flood the bell.
import { query } from '../../src/config/database';
import { reportJobFailure, resetJobAlerts } from '../../src/utils/jobAlerts';

jest.mock('../../src/config/socket', () => ({ emitToSuperAdmins: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { emitToSuperAdmins } = require('../../src/config/socket');
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('reportJobFailure', () => {
  beforeEach(() => {
    resetJobAlerts();
    mockQuery.mockReset();
    mockQuery.mockImplementation((async (sql: unknown) =>
      String(sql).startsWith('SELECT id FROM users') ? { rows: [{ id: 'owner-1' }, { id: 'owner-2' }] } : { rows: [] }) as never);
  });

  it('notifies every super admin and sends a live alert', async () => {
    const sent = await reportJobFailure('reconciliation', 'The daily books check', new Error('relation "stock_snapshots" does not exist'));
    expect(sent).toBe(true);
    const inserts = mockQuery.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO notifications'));
    expect(inserts).toHaveLength(2);
    expect(String((inserts[0][1] as unknown[])[2])).toContain('stock_snapshots');
    expect(emitToSuperAdmins).toHaveBeenCalledWith('job:failed', expect.objectContaining({ job: 'reconciliation' }));
  });

  it('a job that keeps failing alerts once, not on every run', async () => {
    await reportJobFailure('reconciliation', 'The daily books check', new Error('x'));
    const again = await reportJobFailure('reconciliation', 'The daily books check', new Error('x'));
    expect(again).toBe(false);
    expect(mockQuery.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO notifications'))).toHaveLength(2);
  });

  it('a broken notification path never throws into the scheduler', async () => {
    mockQuery.mockRejectedValue(new Error('database is down') as never);
    await expect(reportJobFailure('reminders', 'Reminders', new Error('y'))).resolves.toBe(true);
  });
});
