import { estimateAttaTotal } from '../src/services/atta.service';

const charges = { serviceCharge: 50, millingChargePerKg: 5, deliveryCharge: 100, freeDeliveryThresholdKg: 20 };

describe('estimateAttaTotal — same formula the server bills with', () => {
  it('service + kg × milling + delivery below the free threshold', () => {
    expect(estimateAttaTotal(10, charges)).toEqual({ service: 50, milling: 50, delivery: 100, total: 200 });
  });

  it('delivery is free from the threshold kg upwards (website: "and above")', () => {
    expect(estimateAttaTotal(20, charges).delivery).toBe(0);
    expect(estimateAttaTotal(20, charges).total).toBe(150);
    expect(estimateAttaTotal(19, charges).delivery).toBe(100);
  });

  it('a 0 threshold means never free', () => {
    expect(estimateAttaTotal(80, { ...charges, freeDeliveryThresholdKg: 0 }).delivery).toBe(100);
  });

  it('no weight → no total', () => {
    expect(estimateAttaTotal(0, charges).total).toBe(0);
    expect(estimateAttaTotal(NaN, charges).total).toBe(0);
  });
});
