import { addDays, needsSecondAdmin, periodFor } from '../auditPeriod';

describe('audit period presets', () => {
  // 2026-11-12 is a Thursday.
  const today = '2026-11-12';
  const p = (preset: Parameters<typeof periodFor>[0], month = '2026-11', from = '', to = '') => periodFor(preset, today, month, from, to);

  it('weeks run Monday to Sunday', () => {
    expect(p('this_week')).toEqual({ from: '2026-11-09', to: '2026-11-12' });
    expect(p('last_week')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  });
  it('months', () => {
    expect(p('this_month')).toEqual({ from: '2026-11-01', to: '2026-11-12' });
    expect(p('last_month')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(p('month', '2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
  it('never ends after today', () => {
    expect(p('month', '2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-12' });
    expect(p('dates', '', '2026-11-01', '2026-12-31')).toEqual({ from: '2026-11-01', to: '2026-11-12' });
  });
  it('January looks back into the previous year', () => {
    expect(periodFor('last_month', '2027-01-05', '', '', '')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('recognises the server asking for a second admin', () => {
    expect(needsSecondAdmin("A second admin's approval is required for an expense worth Rs. 5,000 or more.")).toBe(true);
    expect(needsSecondAdmin('Enter a valid amount.')).toBe(false);
  });
});
