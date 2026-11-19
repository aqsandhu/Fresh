// Order chat: messages load, new ones arrive live, a send shows at once and is
// marked failed (tap to retry) if the server refuses, REST is used when the
// socket is down, and leaving the screen unsubscribes everything.
import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockApi = { get: jest.fn(), post: jest.fn() };
jest.mock('../src/services/api', () => ({ __esModule: true, get default() { return mockApi; } }));
const mockHandlers: Record<string, (d: any) => void> = {};
const mockSocket = {
  connected: true,
  isConnected: jest.fn(() => mockSocket.connected),
  connect: jest.fn(),
  subscribeToOrder: jest.fn(),
  unsubscribeFromOrder: jest.fn(),
  sendChatMessage: jest.fn(),
  emitTyping: jest.fn(),
  on: jest.fn((event: string, cb: (d: any) => void) => { mockHandlers[event] = cb; }),
  off: jest.fn(),
};
const mockSetActive = jest.fn();
jest.mock('../src/services/socket.service', () => ({
  get socketService() { return mockSocket; },
  setActiveChatOrder: (id: string | null) => mockSetActive(id),
}));

import { useOrderChat } from '../src/hooks/useOrderChat';

const msg = (id: string, text: string, sender = 'customer') => ({ id, message: text, sender_type: sender, sender_name: 'Sara', created_at: '2026-11-15T10:00:00Z' });

beforeEach(() => {
  jest.clearAllMocks();
  mockSocket.connected = true;
  mockApi.get.mockResolvedValue({ success: true, data: { messages: [msg('m1', 'Hello')] } });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.useRealTimers());

it('loads, joins the room, takes live messages once, and cleans up', async () => {
  const { result, unmount } = renderHook(() => useOrderChat({ orderId: 'o1', isActive: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.messages.map((m) => m.id)).toEqual(['m1']);
  expect(mockSetActive).toHaveBeenCalledWith('o1');
  expect(mockSocket.subscribeToOrder).toHaveBeenCalledWith('o1');
  act(() => {
    mockHandlers['chat:message'](msg('m2', 'At the gate'));
    mockHandlers['chat:message'](msg('m2', 'At the gate'));
    mockHandlers['chat:typing']({ orderId: 'o1', isTyping: true });
  });
  expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  expect(result.current.isTyping).toBe(true);
  act(() => mockHandlers.disconnect());
  expect(result.current.isConnected).toBe(false);
  unmount();
  expect(mockSetActive).toHaveBeenLastCalledWith(null);
  expect(mockSocket.unsubscribeFromOrder).toHaveBeenCalledWith('o1');
  expect(mockSocket.off).toHaveBeenCalledTimes(5);
});

it('a send shows at once; the server refusing it marks it failed; retry sends again', async () => {
  const { result } = renderHook(() => useOrderChat({ orderId: 'o1', isActive: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.send('  On my way  '); });
  const mine = result.current.messages[result.current.messages.length - 1];
  expect(mine).toMatchObject({ message: 'On my way', sender_type: 'rider', pending: true });
  expect(mockSocket.sendChatMessage).toHaveBeenCalledWith('o1', 'On my way');
  act(() => mockHandlers['chat:error']({ message: 'Chat closed' }));
  expect(result.current.messages.find((m) => m.id === mine.id)).toMatchObject({ failed: true, pending: false });
  await act(async () => { await result.current.retry(result.current.messages.find((m) => m.id === mine.id)!); });
  expect(mockSocket.sendChatMessage).toHaveBeenCalledTimes(2);
  // let the 800 ms "sent" timers finish inside the test (no timer outlives it)
  await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
});

it('a send over the socket is marked sent after a moment when no error comes', async () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useOrderChat({ orderId: 'o1', isActive: true }));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await result.current.send('Hi'); });
  act(() => { jest.advanceTimersByTime(900); });
  expect(result.current.messages.find((m) => m.message === 'Hi')?.pending).toBe(false);
  expect(result.current.sending).toBe(false);
});

it('socket down: sent over REST; a REST failure is marked failed', async () => {
  mockSocket.connected = false;
  mockApi.post.mockResolvedValueOnce({ success: true, data: msg('srv-1', 'Hi', 'rider') });
  const { result } = renderHook(() => useOrderChat({ orderId: 'o1', isActive: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.send('Hi'); });
  expect(mockApi.post).toHaveBeenCalledWith('/chat/o1', { message: 'Hi' });
  expect(result.current.messages.some((m) => m.id === 'srv-1')).toBe(true);
  mockApi.post.mockResolvedValueOnce({ success: false });
  await act(async () => { await result.current.send('Again'); });
  expect(result.current.messages.find((m) => m.message === 'Again')?.failed).toBe(true);
});

it('nothing is sent for an empty message or a closed task; typing is announced and cleared', async () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useOrderChat({ orderId: 'o1', isActive: false }));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await result.current.send('Hi'); });
  await act(async () => { await result.current.send('   '); });
  expect(mockSocket.sendChatMessage).not.toHaveBeenCalled();
  act(() => result.current.onTypingChange('h'));
  expect(mockSocket.emitTyping).toHaveBeenCalledWith('o1', true);
  act(() => { jest.advanceTimersByTime(2100); });
  expect(mockSocket.emitTyping).toHaveBeenLastCalledWith('o1', false);
});

it('a reload keeps a message that is still unsent', async () => {
  mockSocket.connected = false;
  mockApi.post.mockRejectedValueOnce(new Error('offline'));
  const { result } = renderHook(() => useOrderChat({ orderId: 'o1', isActive: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.send('Kept'); });
  mockApi.get.mockResolvedValueOnce({ success: true, data: { messages: [msg('m1', 'Hello'), msg('m3', 'New')] } });
  await act(async () => { await result.current.refresh(); });
  expect(result.current.messages.map((m) => m.message)).toEqual(['Hello', 'New', 'Kept']);
});

// I13 (round 10): a rider with several orders is in several order rooms; a
// message for ANOTHER order must never show in this chat.
it('a message for another order is ignored; one for this order (or without an id, older server) shows', async () => {
  const { result } = renderHook(() => useOrderChat({ orderId: 'o1', isActive: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => {
    mockHandlers['chat:message']({ ...msg('x9', 'Order 2 customer here'), order_id: 'o2' });
    mockHandlers['chat:message']({ ...msg('m5', 'Coming down'), order_id: 'o1' });
    mockHandlers['chat:message'](msg('m6', 'Old server, no id'));
  });
  expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm5', 'm6']);
});
