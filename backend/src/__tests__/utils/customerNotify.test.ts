const mockQuery = jest.fn();
const mockSend = jest.fn();
const mockEmit = jest.fn();

jest.mock('../../config/database', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));
jest.mock('../../utils/expoPush', () => ({ sendExpoPushToUsers: (...a: unknown[]) => mockSend(...a) }));
jest.mock('../../config/socket', () => ({ emitToUser: (...a: unknown[]) => mockEmit(...a) }));
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { notifyOrderStatus, orderStatusNotice, pushToCustomers, notifyCustomer } from '../../utils/customerNotify';

beforeEach(() => {
  mockQuery.mockReset();
  mockSend.mockReset().mockResolvedValue(1);
  mockEmit.mockReset();
});

describe('pushToCustomers', () => {
  it('pushes only to customers who have not switched notifications off', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'u1' }] }); // u2 has notification_enabled = false
    await pushToCustomers(['u1', 'u2', 'u1', null], { title: 't', body: 'b' });
    expect(mockQuery.mock.calls[0][0]).toContain('notification_enabled IS DISTINCT FROM FALSE');
    expect(mockQuery.mock.calls[0][1]).toEqual([['u1', 'u2']]);
    expect(mockSend).toHaveBeenCalledWith(['u1'], { title: 't', body: 'b' });
  });

  it('sends nothing when everyone opted out', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await pushToCustomers(['u2'], { title: 't', body: 'b' })).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(pushToCustomers(['u1'], { title: 't', body: 'b' })).resolves.toBe(0);
  });
});

describe('order status notices', () => {
  it('covers every admin status the customer should hear about', () => {
    for (const s of ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled', 'refunded']) {
      expect(orderStatusNotice(s, 'FB-1')).not.toBeNull();
    }
    expect(orderStatusNotice('pending', 'FB-1')).toBeNull();
    expect(orderStatusNotice('cancelled', 'FB-1', 'Out of stock')?.message).toContain('Reason: Out of stock');
  });

  it('does not write a second inbox row where the DB trigger already does', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'u1' }] });
    await notifyOrderStatus({ id: 'o1', user_id: 'u1', order_number: 'FB-1' }, 'cancelled', 'Shop closed');
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes('INSERT INTO notifications'))).toBe(false);
    expect(mockSend).toHaveBeenCalledWith(['u1'], expect.objectContaining({ title: 'Order cancelled', data: expect.objectContaining({ orderId: 'o1' }) }));
  });

  it('writes the inbox row for statuses the trigger ignores (ready_for_pickup / refunded)', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'u1' }] });
    await notifyOrderStatus({ id: 'o1', user_id: 'u1', order_number: 'FB-1' }, 'refunded');
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes('INSERT INTO notifications'))).toBe(true);
  });

  it('skips restaurant orders (no consumer)', async () => {
    await notifyOrderStatus({ id: 'o1', user_id: null, order_number: 'FB-1' }, 'confirmed');
    await notifyCustomer(null, { type: 'system', title: 't', message: 'm' });
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
