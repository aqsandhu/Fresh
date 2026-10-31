import { query } from '../../config/database';
import { computeRiderStats } from '../../utils/riderStats';

jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../config/riderSchema', () => ({
  hasRiderCashSettlementTables: jest.fn().mockResolvedValue(true),
  hasAttaCashColumns: jest.fn().mockResolvedValue(true),
}));

const mockedQuery = query as jest.Mock;

describe('computeRiderStats', () => {
  beforeEach(() => mockedQuery.mockReset());

  it('uses Asia/Karachi windows on the delivery time, never placed_at', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{ settled: 0 }] });
    await computeRiderStats('r1');
    const orderSql: string = mockedQuery.mock.calls[0][0];
    expect(orderSql).toContain("AT TIME ZONE 'Asia/Karachi'");
    expect(orderSql).toContain('COALESCE(o.delivered_at, o.updated_at)');
    expect(orderSql).not.toContain('placed_at');
  });

  it('derives the cash position from unsettled lines (orders keep rider pay, atta is due in full)', async () => {
    mockedQuery
      // orders
      .mockResolvedValueOnce({
        rows: [{
          today_orders: '2', today_earnings: '100',
          thisweek_orders: '5', thisweek_earnings: '250',
          lastweek_orders: '1', lastweek_earnings: '50',
          thismonth_orders: '9', thismonth_earnings: '450',
          lastmonth_orders: '3', lastmonth_earnings: '150',
          total_earned: '600',
          cod_earned: '500',
          order_collected: '12000',
          order_unsettled_cash: '3000',
          order_unsettled_earned: '150',
          order_unsettled_due: '2850',
          order_unsettled_count: '3',
        }],
      })
      // atta tasks per period
      .mockResolvedValueOnce({ rows: [{ today_atta: '1', thisweek_atta: '2', lastweek_atta: '0', thismonth_atta: '4', lastmonth_atta: '0' }] })
      // atta cash
      .mockResolvedValueOnce({ rows: [{ collected: '900', unsettled: '400', unsettled_count: '1' }] })
      // settled
      .mockResolvedValueOnce({ rows: [{ settled: '9350' }] });

    const out = await computeRiderStats('r1');
    expect(out.stats.today).toEqual({ orders: 2, earnings: 100, attaTasks: 1 });
    expect(out.stats.thisWeek).toEqual({ orders: 5, earnings: 250, attaTasks: 2 });
    expect(out.payment.totalCollected).toBe(12900);
    expect(out.payment.cashInHand).toBe(3400);
    expect(out.payment.unsettledEarned).toBe(150);
    expect(out.payment.paymentPending).toBe(3250);
    expect(out.payment.nonCashEarned).toBe(100);
    expect(out.payment.totalSettled).toBe(9350);
    expect(out.payment.pendingOrders).toBe(3);
    expect(out.payment.pendingAtta).toBe(1);
  });
});
