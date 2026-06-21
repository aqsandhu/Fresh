import { unitLabelShort } from '@/lib/unitLabels';

describe('unitLabelShort', () => {
  it('maps known fractional units to their short label', () => {
    expect(unitLabelShort('half_kg')).toBe('½ kg');
    expect(unitLabelShort('quarter_kg')).toBe('¼ kg');
    expect(unitLabelShort('half_dozen')).toBe('½ dozen');
  });

  it('returns empty string for full/unknown/missing units', () => {
    expect(unitLabelShort('full')).toBe('');
    expect(unitLabelShort('weird')).toBe('');
    expect(unitLabelShort(null)).toBe('');
    expect(unitLabelShort(undefined)).toBe('');
  });
});
