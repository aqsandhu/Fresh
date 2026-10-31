import { orderSchemas } from '../../middleware/validation';
import { ENABLED_PAYMENT_METHODS, isEnabledPaymentMethod } from '../../config/payments';

jest.mock('../../config/database', () => ({ query: jest.fn() }));

const base = {
  address_id: '11111111-1111-4111-8111-111111111111',
  city_id: '22222222-2222-4222-8222-222222222222',
  time_slot_id: '33333333-3333-4333-8333-333333333333',
};

describe('COD-only checkout', () => {
  it('only cash on delivery is enabled', () => {
    expect(ENABLED_PAYMENT_METHODS).toEqual(['cash_on_delivery']);
    expect(isEnabledPaymentMethod('cash_on_delivery')).toBe(true);
    for (const m of ['card', 'easypaisa', 'jazzcash', 'bank_transfer', '', null, undefined]) {
      expect(isEnabledPaymentMethod(m)).toBe(false);
    }
  });

  it('order schema defaults to COD and rejects every other method', () => {
    const ok = orderSchemas.create.validate(base);
    expect(ok.error).toBeUndefined();
    expect(ok.value.payment_method).toBe('cash_on_delivery');

    for (const m of ['card', 'easypaisa', 'jazzcash', 'bank_transfer']) {
      const { error } = orderSchemas.create.validate({ ...base, payment_method: m });
      expect(error?.message).toBe('Only Cash on Delivery is available right now.');
    }
  });
});
