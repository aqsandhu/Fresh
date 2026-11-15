// ============================================================================
// ORDERS PAGE — tests of the REAL code behind it.
//
// The file that used to live here built mock order objects and checked their
// own fields (12 tests that never touched the Orders page). The page's real
// logic is the print slip — it puts customer-typed text into an HTML document
// opened in the admin's browser — and the packed-weight formatting.
// ============================================================================
import { buildOrderSlipHtml, formatKgGrams } from '@/lib/orderSlip';
import type { Order } from '@/types';

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: 'o1',
    orderNumber: 'ORD-1001',
    placedAt: '2026-11-15T09:30:00Z',
    customerName: 'Ali Khan',
    customerPhone: '+923001234567',
    showCustomerPhone: true,
    status: 'confirmed',
    paymentMethod: 'cash_on_delivery',
    subtotal: 1000,
    discountAmount: 0,
    couponDiscount: 100,
    couponCode: 'SAVE10',
    deliveryCharge: 50,
    totalAmount: 950,
    items: [
      { id: 'i1', productName: 'Onion', quantity: 2, unitPrice: 60, totalPrice: 120, unit: 'half_kg' },
      { id: 'i2', productName: 'Tomato', quantity: 1, unitPrice: 200, totalPrice: 200, unit: 'full' },
    ],
    deliveryAddressSnapshot: { houseNumber: '12-B', writtenAddress: 'Street 4', areaName: 'Model Town', city: 'Gujrat' },
    slotName: 'Morning 9–11',
    ...over,
  }) as unknown as Order;

describe('print slip', () => {
  it('escapes everything a customer typed (no script runs in the print window)', () => {
    const html = buildOrderSlipHtml(order({
      customerName: '<img src=x onerror=alert(1)>',
      customerNotes: '</div><script>steal()</script>',
      deliveryAddressSnapshot: { writtenAddress: '"><svg onload=x>', city: 'Gujrat' } as never,
    }));
    expect(html).not.toMatch(/<img|<script|<svg/i);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('hides the phone number unless the order allows showing it', () => {
    expect(buildOrderSlipHtml(order({ showCustomerPhone: false }))).toContain('Phone Number is Hidden');
    expect(buildOrderSlipHtml(order({ showCustomerPhone: false }))).not.toContain('300');
    expect(buildOrderSlipHtml(order())).not.toContain('Phone Number is Hidden');
  });

  it('shows money lines, the coupon and the line sizes', () => {
    const html = buildOrderSlipHtml(order());
    expect(html).toContain('Coupon (SAVE10)');
    expect(html).toContain('-Rs.100');
    expect(html).toMatch(/Total<\/span><span>Rs\.950/);
    expect(html).toMatch(/Onion \([^)]+\)/); // half-kg line carries its size
    expect(html).not.toMatch(/Tomato \(/); // a full unit does not
    expect(html).toContain('Cash on Delivery');
    expect(html).toContain('House #: 12-B');
    expect(html).toContain('Morning 9–11');
  });

  it('leaves out lines that do not apply', () => {
    const html = buildOrderSlipHtml(order({ couponDiscount: 0, couponCode: null as never, slotName: undefined as never, deliveryAddressSnapshot: undefined as never }));
    expect(html).not.toContain('Coupon');
    expect(html).not.toContain('Delivery Time Slot');
    expect(html).not.toContain('Delivery Address');
  });
});

describe('packed weight', () => {
  it.each([
    [5.3, '5 kg 300 g'],
    [2, '2 kg'],
    [0.75, '750 g'],
    [0, '0 kg'],
    [-1, ''],
    [Number.NaN, ''],
  ])('%p kg → %p', (kg, text) => {
    expect(formatKgGrams(kg)).toBe(text);
  });
});
