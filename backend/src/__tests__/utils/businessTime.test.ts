import { pktDateString, weekdayOfDate, isTodaySql, localDate } from '../../utils/businessTime';

describe('business time (Asia/Karachi)', () => {
  it('rolls the date at Pakistan midnight, not UTC midnight', () => {
    expect(pktDateString(new Date('2026-10-31T18:59:00Z'))).toBe('2026-10-31'); // 23:59 PKT
    expect(pktDateString(new Date('2026-10-31T19:00:00Z'))).toBe('2026-11-01'); // 00:00 PKT
  });

  it('weekday of a calendar date does not depend on the server timezone', () => {
    expect(weekdayOfDate('2026-11-01')).toBe(0); // Sunday
    expect(weekdayOfDate('2026-10-31')).toBe(6); // Saturday
  });

  it('SQL fragments are explicit about the zone', () => {
    expect(localDate('o.placed_at')).toBe("(o.placed_at AT TIME ZONE 'Asia/Karachi')::date");
    expect(isTodaySql('x')).toContain("AT TIME ZONE 'Asia/Karachi'");
    expect(isTodaySql('x')).not.toContain('CURRENT_DATE');
  });
});
