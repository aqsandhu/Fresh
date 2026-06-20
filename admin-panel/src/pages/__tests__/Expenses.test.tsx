import { getStockPurchaseBalance } from '@/pages/Expenses';

describe('getStockPurchaseBalance', () => {
  it('marks a purchase balanced when grades plus waste equal raw weight', () => {
    expect(getStockPurchaseBalance('10', '6.5', '2', '1', '0.5')).toEqual({
      raw: 10,
      gradedTotal: 10,
      remaining: 0,
      balanced: true,
    });
  });

  it('reports unaccounted raw weight', () => {
    expect(getStockPurchaseBalance('10', '6', '2', '1', '0')).toMatchObject({
      gradedTotal: 9,
      remaining: 1,
      balanced: false,
    });
  });

  it('reports over-allocation when grades and waste exceed raw weight', () => {
    expect(getStockPurchaseBalance('10', '6', '2', '1', '2')).toMatchObject({
      gradedTotal: 11,
      remaining: -1,
      balanced: false,
    });
  });

  it('rounds to three decimals for stock units', () => {
    expect(getStockPurchaseBalance('1.2344', '1', '0.2', '0.034', '0')).toMatchObject({
      gradedTotal: 1.234,
      remaining: 0,
      balanced: true,
    });
  });
});
