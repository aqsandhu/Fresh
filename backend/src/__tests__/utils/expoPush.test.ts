import { buildExpoMessages, chunk, isExpoPushToken } from '../../utils/expoPush';

jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('expoPush helpers', () => {
  it('recognises Expo push tokens only', () => {
    expect(isExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('fcm-token-xyz')).toBe(false);
    expect(isExpoPushToken('')).toBe(false);
    expect(isExpoPushToken(null)).toBe(false);
  });

  it('builds messages for valid tokens with high priority + default sound', () => {
    const messages = buildExpoMessages(['ExponentPushToken[a]', 'bad', 'ExponentPushToken[b]'], {
      title: 'New delivery assigned',
      body: 'Order #1234 is ready for you.',
      data: { type: 'new_task', orderId: 'o1' },
      channelId: 'new-task',
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      to: 'ExponentPushToken[a]',
      title: 'New delivery assigned',
      body: 'Order #1234 is ready for you.',
      data: { type: 'new_task', orderId: 'o1' },
      sound: 'default',
      priority: 'high',
      channelId: 'new-task',
    });
  });

  it('chunks into Expo-sized batches', () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const batches = chunk(items, 100);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(chunk([], 100)).toEqual([]);
  });
});
