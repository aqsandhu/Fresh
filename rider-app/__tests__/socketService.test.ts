// Rider realtime: one socket per signed-in rider, rooms re-joined after a
// reconnect, and every server event does what the rider expects (new task,
// cancelled task, blocked account, duty switched off, chat toasts).
type Handler = (data?: any) => void;
type FakeSocket = {
  handlers: Record<string, Handler>;
  managerHandlers: Record<string, Handler>;
  emit: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  removeAllListeners: jest.Mock;
  disconnect: jest.Mock;
  connected: boolean;
  active: boolean;
  auth: unknown;
  io: { on: jest.Mock };
};
const mockSockets: FakeSocket[] = [];
const mockIo = jest.fn((_url: string, opts: { auth: unknown }) => {
  const s: FakeSocket = {
    handlers: {}, managerHandlers: {}, emit: jest.fn(), off: jest.fn(), removeAllListeners: jest.fn(), disconnect: jest.fn(),
    connected: true, active: true, auth: opts.auth,
    on: jest.fn((event: string, cb: Handler) => { s.handlers[event] = cb; }),
    io: { on: jest.fn((event: string, cb: Handler) => { s.managerHandlers[event] = cb; }) },
  };
  mockSockets.push(s);
  return s;
});
jest.mock('socket.io-client', () => ({ io: (url: string, opts: { auth: unknown }) => mockIo(url, opts) }));

const mockAuth = { token: 'tok-1' as string | null, endSession: jest.fn() };
jest.mock('../src/store/authStore', () => ({ useAuthStore: { getState: () => mockAuth } }));
const mockTasks = {
  fetchActiveTasks: jest.fn(async () => undefined), fetchCompletedTasks: jest.fn(async () => undefined),
  fetchMyStats: jest.fn(async () => undefined), removeTask: jest.fn(),
};
jest.mock('../src/store/taskStore', () => ({ useTaskStore: { getState: () => mockTasks } }));
const mockNotify = {
  notifyNewTask: jest.fn(async () => undefined), notifyTaskCancelled: jest.fn(async () => undefined),
  notifyTaskUpdated: jest.fn(async () => undefined), notifyInfo: jest.fn(async () => undefined), notifyChat: jest.fn(async () => undefined),
};
jest.mock('../src/services/notification.service', () => ({ get notificationService() { return mockNotify; } }));
const mockDuty = { isOnDuty: true, teardown: jest.fn(async () => undefined) };
jest.mock('../src/store/dutyStore', () => ({ useDutyStore: { getState: () => mockDuty } }));

import socketService, { setActiveChatOrder } from '../src/services/socket.service';

const last = () => mockSockets[mockSockets.length - 1];

beforeEach(() => {
  socketService.disconnect();
  mockSockets.length = 0;
  jest.clearAllMocks();
  mockAuth.token = 'tok-1';
  mockDuty.isOnDuty = true;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('connection', () => {
  it('no token, no socket', () => {
    mockAuth.token = null;
    socketService.connect();
    expect(mockIo).not.toHaveBeenCalled();
  });

  it('connects with the token over websocket, once per token', () => {
    socketService.connect();
    socketService.connect();
    expect(mockIo).toHaveBeenCalledTimes(1);
    expect(mockIo.mock.calls[0][1]).toMatchObject({ auth: { token: 'tok-1' }, transports: ['websocket'] });
    expect(socketService.isConnected()).toBe(true);
    mockAuth.token = 'tok-2';
    socketService.connect();
    expect(mockIo).toHaveBeenCalledTimes(2);
    expect(mockSockets[0].disconnect).toHaveBeenCalled();
  });

  it('after a reconnect: the newest token, rooms joined again, tasks re-synced', () => {
    socketService.connect();
    socketService.subscribeToOrder('o1');
    mockAuth.token = 'tok-refreshed';
    last().managerHandlers.reconnect_attempt();
    expect(last().auth).toEqual({ token: 'tok-refreshed' });
    last().emit.mockClear();
    last().handlers.connect();
    expect(last().emit).toHaveBeenCalledWith('order:subscribe', 'o1');
    expect(mockTasks.fetchActiveTasks).toHaveBeenCalled();
    last().handlers.connect_error(new Error('jwt expired'));
    last().handlers.disconnect('transport close');
  });
});

describe('server events', () => {
  beforeEach(() => socketService.connect());

  it('new assignment: reload tasks and notify', () => {
    last().handlers['rider:new_assignment']({ orderId: 'o1', orderNumber: 'ORD-1', taskId: 't1' });
    expect(mockTasks.fetchActiveTasks).toHaveBeenCalled();
    expect(mockNotify.notifyNewTask).toHaveBeenCalledWith({ orderId: 'o1', orderNumber: 'ORD-1', taskId: 't1' });
  });

  it('cancelled task: removed at once and the rider told', () => {
    last().handlers['rider:task_cancelled']({ taskId: 't1', orderNumber: 'ORD-1' });
    expect(mockTasks.removeTask).toHaveBeenCalledWith('t1');
    expect(mockNotify.notifyTaskCancelled).toHaveBeenCalled();
  });

  it('task changed by the office: re-sync, and tell the rider only when there is a message', () => {
    last().handlers['rider:task_updated']({ taskId: 't1', status: 'completed' });
    expect(mockTasks.fetchCompletedTasks).toHaveBeenCalled();
    expect(mockNotify.notifyTaskUpdated).not.toHaveBeenCalled();
    last().handlers['rider:task_updated']({ taskId: 't1', message: 'New cash amount: Rs 950' });
    expect(mockNotify.notifyTaskUpdated).toHaveBeenCalledWith(expect.objectContaining({ message: 'New cash amount: Rs 950' }));
  });

  it('blocked account: signed out with the reason', () => {
    last().handlers['rider:account_blocked']({ message: 'Blocked by admin' });
    expect(mockAuth.endSession).toHaveBeenCalledWith('Blocked by admin');
  });

  it('office switched duty off: duty ends on the phone too', () => {
    last().handlers['rider:status_changed']({ status: 'offline' });
    expect(mockDuty.teardown).toHaveBeenCalled();
    expect(mockNotify.notifyInfo).toHaveBeenCalled();
    mockDuty.teardown.mockClear();
    last().handlers['rider:status_changed']({ status: 'available' });
    expect(mockDuty.teardown).not.toHaveBeenCalled();
  });

  it('cash counted: stats refreshed and rider told', () => {
    last().handlers['rider:cash_received']({ message: 'Rs 5,000 received' });
    expect(mockTasks.fetchMyStats).toHaveBeenCalled();
    expect(mockNotify.notifyInfo).toHaveBeenCalledWith(expect.any(String), 'Rs 5,000 received');
  });

  it('a followed order closed by the office: re-sync', () => {
    last().handlers['order:update']({ orderId: 'o1', status: 'preparing' });
    expect(mockTasks.fetchActiveTasks).not.toHaveBeenCalled();
    last().handlers['order:update']({ orderId: 'o1', status: 'cancelled' });
    expect(mockTasks.fetchActiveTasks).toHaveBeenCalled();
  });

  it('chat toasts: not for my own messages, not for the chat I have open', () => {
    last().handlers['chat:notification']({ orderId: 'o1', senderType: 'rider', message: 'mine' });
    setActiveChatOrder('o2');
    last().handlers['chat:notification']({ orderId: 'o2', senderType: 'customer', message: 'open chat' });
    expect(mockNotify.notifyChat).not.toHaveBeenCalled();
    last().handlers['chat:notification']({ orderId: 'o3', senderType: 'customer', senderName: 'Sara', message: 'Gate 2' });
    expect(mockNotify.notifyChat).toHaveBeenCalledWith({ orderId: 'o3', senderName: 'Sara', message: 'Gate 2' });
    setActiveChatOrder(null);
  });
});

describe('sending', () => {
  it('rooms, chat, typing, location and generic listeners', () => {
    socketService.connect();
    const s = last();
    socketService.subscribeToOrder('o9');
    socketService.unsubscribeFromOrder('o9');
    socketService.sendChatMessage('o9', 'on my way');
    socketService.emitTyping('o9', true);
    socketService.emitLocation('r1', 32.1, 74.2);
    expect(s.emit.mock.calls).toEqual([
      ['order:subscribe', 'o9'],
      ['order:unsubscribe', 'o9'],
      ['chat:send', { orderId: 'o9', message: 'on my way' }],
      ['chat:typing', { orderId: 'o9', isTyping: true }],
      ['rider:location', { riderId: 'r1', latitude: 32.1, longitude: 74.2, accuracy: null }],
    ]);
    const cb = jest.fn();
    socketService.on('x', cb);
    socketService.off('x', cb);
    socketService.off('x');
    expect(s.off).toHaveBeenCalledTimes(2);
    expect(socketService.getSocket()).toBe(s);
    socketService.disconnect();
    expect(s.removeAllListeners).toHaveBeenCalled();
    expect(socketService.getSocket()).toBeNull();
    expect(socketService.isConnected()).toBe(false);
  });
});
