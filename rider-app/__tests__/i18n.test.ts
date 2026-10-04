import en, { TranslationKey } from '../src/i18n/en';
import ur from '../src/i18n/ur';
import { interpolate, translate, tEnum } from '../src/i18n';

describe('i18n dictionaries', () => {
  const keys = Object.keys(en) as TranslationKey[];

  it('has an Urdu string for every English key', () => {
    const missing = keys.filter((k) => !(k in ur));
    expect(missing).toEqual([]);
  });

  it('has no empty Urdu strings except the deliberately blank unit.full', () => {
    const empty = keys.filter((k) => k !== 'unit.full' && !String(ur[k]).trim());
    expect(empty).toEqual([]);
  });

  it('keeps the same {placeholders} in both languages', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) || []).sort();
    const mismatched = keys.filter((k) => placeholders(en[k]).join() !== placeholders(ur[k]).join());
    expect(mismatched).toEqual([]);
  });
});

describe('interpolate / translate', () => {
  it('replaces placeholders and leaves unknown ones visible', () => {
    expect(interpolate('Collect {amount} from {who}', { amount: 'Rs. 500' })).toBe('Collect Rs. 500 from {who}');
    expect(interpolate('No params')).toBe('No params');
  });

  it('translates in both languages and falls back to English', () => {
    expect(translate('en', 'tasks.collect', { amount: 'Rs. 1,200' })).toBe('Collect Rs. 1,200');
    expect(translate('ur', 'tasks.collect', { amount: 'Rs. 1,200' })).toContain('Rs. 1,200');
    // @ts-expect-error unknown key falls back to the key itself
    expect(translate('en', 'does.not.exist')).toBe('does.not.exist');
  });

  it('tEnum maps backend enums and shows unknown values readably', () => {
    expect(tEnum('en', 'taskStatus', 'in_progress')).toBe('On the way');
    expect(tEnum('ur', 'taskStatus', 'completed')).toBe('پہنچا دیا');
    expect(tEnum('en', 'unit', 'half_kg')).toBe('½ kg');
    expect(tEnum('en', 'taskStatus', 'weird_state')).toBe('weird state');
    expect(tEnum('en', 'taskStatus', null)).toBe('');
  });
});
