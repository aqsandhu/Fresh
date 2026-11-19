// B32 (round 7): customer-written text in the customers CSV must not run as a
// spreadsheet formula when an admin opens the export.
import { csvCell } from '@/utils/csv';

describe('csvCell', () => {
  it.each([
    ['=HYPERLINK("http://x.example","click")', `"'=HYPERLINK(""http://x.example"",""click"")"`],
    ['+cmd|calc', "'+cmd|calc"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1)', "'@SUM(A1)"],
  ])('neutralises formula text %s', (input, expected) => {
    expect(csvCell(input, { text: true })).toBe(expected);
  });

  it('leaves normal names, numbers and phones alone', () => {
    expect(csvCell('Ali Khan', { text: true })).toBe('Ali Khan');
    expect(csvCell(12)).toBe('12');
    expect(csvCell('+923001234567')).toBe('+923001234567'); // server-checked phone, not free text
    expect(csvCell(null)).toBe('');
  });

  it('quotes commas, quotes and both kinds of line break', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\rline2')).toBe('"line1\rline2"');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });
});
