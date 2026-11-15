// What the customer pays and sees: size and quality prices (admin overrides
// win), which qualities are on sale, when a delivery slot locks, the WhatsApp
// order link, and the formatting helpers screens use.
import { Alert, Linking } from 'react-native';
import {
  qualityBasePrice, offeredQualities, qualityStock, getUnitOptions, priceForUnit, resolveLineUnitPrice,
  unitLabelShort, getUnitPickerPrompt, getUnitPickerDisplayLabel, unitPriceCaption,
} from '@/lib/unitPricing';
import { getSlotAvailability } from '@/lib/timeSlots';
import { buildWhatsAppUrl, openWhatsAppOrder } from '@/lib/whatsapp';
import { e164ToLocalPk } from '@/lib/phoneAutoFill';
import {
  formatCurrency, formatProductUnitSuffix, formatSlotTime, formatSlotTimeRange, getRelativeTime, isFreeDelivery,
  getVegFruitSubtotal, getDeliveryHint, getStatusColor, truncateText, formatPhoneNumber, getInitials, debounce, retry,
} from '@utils/helpers';
import type { StoreProduct } from '@app-types';

const p = (extra: Record<string, unknown> = {}) => ({ id: 'p', price: 200, unit: 'kg', stock: 5, ...extra } as unknown as StoreProduct);

describe('unit and quality prices', () => {
  it('kg: half and quarter derived, admin override wins, switched-off fractions hidden', () => {
    expect(getUnitOptions(p()).map((o) => [o.unit, o.price])).toEqual([['full', 200], ['half_kg', 100], ['quarter_kg', 50]]);
    expect(priceForUnit(p({ halfKgPrice: 95 }), 'half_kg')).toBe(95);
    expect(getUnitOptions(p({ allowQuarterKg: false })).map((o) => o.unit)).toEqual(['full', 'half_kg']);
  });

  it('dozen and piece', () => {
    expect(priceForUnit(p({ unit: 'dozen', price: 360 }), 'half_dozen')).toBe(180);
    expect(priceForUnit(p({ unit: 'dozen', price: 360, halfDozenPrice: 170 }), 'half_dozen')).toBe(170);
    expect(getUnitOptions(p({ unit: 'piece' }))).toEqual([{ unit: 'full', label: 'Per piece', price: 200, derived: false }]);
  });

  it('quality B/C: own price, own fraction overrides, own stock; offered only with a price', () => {
    const prod = p({ priceB: 150, halfKgPriceB: 70, stockQuantityB: 3 });
    expect(offeredQualities(prod)).toEqual(['A', 'B']);
    expect(qualityBasePrice(prod, 'C')).toBeNull();
    expect(priceForUnit(prod, 'half_kg', 'B')).toBe(70);
    expect(priceForUnit(prod, 'quarter_kg', 'B')).toBe(37.5);
    expect(qualityStock(prod, 'B')).toBe(3);
    expect(qualityStock(prod, 'C')).toBe(0);
    expect(qualityStock(prod)).toBe(5);
  });

  it('a line keeps the price it was added at', () => {
    expect(resolveLineUnitPrice({ product: p(), unit: 'half_kg', unitPrice: 120 })).toBe(120);
    expect(resolveLineUnitPrice({ product: p(), unit: 'half_kg' })).toBe(100);
  });

  it('picker labels and captions', () => {
    expect([unitLabelShort('half_kg'), unitLabelShort('quarter_kg'), unitLabelShort('half_dozen'), unitLabelShort('full')]).toEqual(['½ kg', '¼ kg', '½ dozen', '']);
    expect([getUnitPickerPrompt(p()), getUnitPickerPrompt(p({ unit: 'dozen' })), getUnitPickerPrompt(p({ unit: 'piece' }))]).toEqual(['Select Half Kg', 'Select Half Dozen', 'Select Unit']);
    const opts = getUnitOptions(p());
    expect(getUnitPickerDisplayLabel(p(), 'quarter_kg', opts)).toBe('Quarter Kg');
    expect(getUnitPickerDisplayLabel(p(), 'full', opts)).toBe('Select Half Kg');
    expect(getUnitPickerDisplayLabel(p(), 'half_dozen', opts)).toBe('Select Half Kg');
    expect([unitPriceCaption('half_kg'), unitPriceCaption('half_dozen'), unitPriceCaption(undefined)]).toEqual(['per ½ kg', 'per ½ dozen', '']);
  });
});

describe('delivery slot locking (today)', () => {
  const slot = { id: 's', start_time: '10:00:00', end_time: '14:00:00' };
  const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  it.each([
    ['before it starts', at(9), false, undefined],
    ['early in the window', at(11), false, undefined],
    ['past 60 % of the window', at(12, 30), true, 'mostly_passed'],
    ['after it ended', at(15), true, 'expired'],
  ])('%s', (_n, now, unavailable, reason) => {
    expect(getSlotAvailability(slot, 'today', 60, now)).toEqual(reason ? { unavailable, reason } : { unavailable });
  });
  it('tomorrow is always open; a slot without times is open', () => {
    expect(getSlotAvailability(slot, 'tomorrow', 60, at(23))).toEqual({ unavailable: false });
    expect(getSlotAvailability({ id: 'x' }, 'today')).toEqual({ unavailable: false });
  });
});

describe('WhatsApp order link', () => {
  it.each([
    ['0300-1234567', 'https://wa.me/923001234567'],
    ['+92 300 1234567', 'https://wa.me/923001234567'],
    ['3001234567', 'https://wa.me/923001234567'],
    ['https://wa.me/c/123', 'https://wa.me/c/123'],
    ['123', null],
    ['   ', null],
  ])('%s → %s', (raw, url) => {
    expect(buildWhatsAppUrl(raw)).toBe(url);
  });

  it('opens WhatsApp, or explains why not', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    expect(await openWhatsAppOrder('03001234567')).toBe(true);
    expect(open).toHaveBeenCalledWith('https://wa.me/923001234567');
    expect(await openWhatsAppOrder('03001234567')).toBe(false);
    expect(await openWhatsAppOrder('')).toBe(false);
    expect(alert).toHaveBeenCalledTimes(2);
  });
});

describe('helpers', () => {
  it('phone formats', () => {
    expect(e164ToLocalPk('+923001234567')).toBe('03001234567');
    expect(e164ToLocalPk('03001234567')).toBe('03001234567');
    expect(e164ToLocalPk('+1 555')).toBeNull();
    expect(formatPhoneNumber('03001234567')).toMatch(/0300/);
  });

  it('money, units, slot times, text', () => {
    expect(formatCurrency(1250)).toMatch(/1,250/);
    expect(formatCurrency(null)).toMatch(/0/);
    expect(formatProductUnitSuffix('kg')).toMatch(/kg/);
    expect(formatSlotTime('14:30:00')).toMatch(/2:30/);
    expect(formatSlotTimeRange('10:00:00', '14:00:00')).toMatch(/10.*2/);
    expect(truncateText('Fresh tomatoes from Gujrat', 10)).toMatch(/…|\.\.\./);
    expect(truncateText('Short', 10)).toBe('Short');
    expect(getInitials('Ali Khan')).toBe('AK');
    expect(typeof getStatusColor('delivered')).toBe('string');
    expect(getRelativeTime(new Date(Date.now() - 2 * 3600 * 1000))).toMatch(/2/);
  });

  it('delivery rule helpers', () => {
    const lines = [
      { product: { price: 300, categorySlug: 'vegetables' }, quantity: 2 },
      { product: { price: 800, categorySlug: 'chicken' }, quantity: 1 },
    ] as never;
    expect(getVegFruitSubtotal(lines)).toBe(600);
    expect(isFreeDelivery(lines, 500)).toBe(true);
    expect(getDeliveryHint(lines, 1000)).toMatch(/400/);
  });

  it('debounce runs once; retry tries again then gives up', async () => {
    jest.useFakeTimers();
    const fn = jest.fn();
    const d = debounce(fn, 100);
    d(1); d(2); d(3);
    jest.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
    jest.useRealTimers();
    let n = 0;
    await expect(retry(async () => { n += 1; if (n < 2) throw new Error('x'); return 'ok'; }, 3, 1)).resolves.toBe('ok');
    await expect(retry(async () => { throw new Error('always'); }, 2, 1)).rejects.toThrow('always');
  });
});
