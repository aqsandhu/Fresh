import { isRealIsoDate } from '../../src/utils/isoDate';

// N2 / N4 (session 10): '2026-02-30' passed the YYYY-MM-DD pattern, reached
// Postgres' ::date cast and came back as a 500.
describe('isRealIsoDate', () => {
  it.each(['2026-11-21', '2028-02-29', '2026-12-31', '2026-01-01'])('%s is a real day', (d) => {
    expect(isRealIsoDate(d)).toBe(true);
  });

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '26-11-21', '2026-11-21T00:00', ''])(
    '%s is refused',
    (d) => {
      expect(isRealIsoDate(d)).toBe(false);
    }
  );
});
