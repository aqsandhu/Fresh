import { resolveDutyStatus, syncRiderAvailability, syncRidersAvailability } from '../../utils/riderAvailability';

jest.mock('../../config/database', () => ({ query: jest.fn() }));

describe('resolveDutyStatus', () => {
  it('turns "available" into "busy" while the rider still carries tasks', () => {
    expect(resolveDutyStatus('available', true)).toBe('busy');
    expect(resolveDutyStatus('available', false)).toBe('available');
  });

  it('never changes an explicit off-duty request', () => {
    expect(resolveDutyStatus('offline', true)).toBe('offline');
    expect(resolveDutyStatus('on_leave', true)).toBe('on_leave');
  });
});

describe('syncRiderAvailability', () => {
  it('runs one UPDATE that keeps offline/on_leave and derives busy/available from active tasks', async () => {
    const runner = { query: jest.fn().mockResolvedValue({ rows: [{ status: 'busy' }] }) };
    const status = await syncRiderAvailability('rider-1', runner as any);
    expect(status).toBe('busy');
    expect(runner.query).toHaveBeenCalledTimes(1);
    const [sql, params] = runner.query.mock.calls[0];
    expect(sql).toMatch(/WHEN r\.status IN \('offline', 'on_leave'\) THEN r\.status/);
    expect(sql).toMatch(/t\.status IN \('assigned', 'in_progress'\)/);
    expect(params).toEqual(['rider-1']);
  });

  it('is a no-op without a rider id', async () => {
    const runner = { query: jest.fn() };
    expect(await syncRiderAvailability(null, runner as any)).toBeNull();
    expect(runner.query).not.toHaveBeenCalled();
  });

  it('syncs each distinct rider once', async () => {
    const runner = { query: jest.fn().mockResolvedValue({ rows: [{ status: 'available' }] }) };
    await syncRidersAvailability(['a', 'b', 'a', null, undefined], runner as any);
    expect(runner.query).toHaveBeenCalledTimes(2);
    expect(runner.query.mock.calls.map((c: any[]) => c[1][0])).toEqual(['a', 'b']);
  });
});
