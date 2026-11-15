// Order rooms live on the server per connection. After a reconnect the client
// must join them again, or live tracking and chat go silent while the page
// still looks connected (found in the Sept audit, fixed Nov 2026).

type Handler = (...args: unknown[]) => void;

const handlers: Record<string, Handler[]> = {};
const emitted: [string, unknown][] = [];
const fakeSocket = {
  connected: false,
  auth: {} as Record<string, unknown>,
  id: 'sock-1',
  on: jest.fn((event: string, cb: Handler) => { (handlers[event] ||= []).push(cb); return fakeSocket; }),
  off: jest.fn(),
  emit: jest.fn((event: string, payload: unknown) => { emitted.push([event, payload]); return fakeSocket; }),
  connect: jest.fn(),
  disconnect: jest.fn(),
};
const ioMock = jest.fn((..._args: unknown[]) => fakeSocket);

jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => ioMock(...args) }));
jest.mock('@/lib/authConfig', () => ({ usesHttpOnlyCookies: () => false }));
jest.mock('@/lib/tokenRefresh', () => ({ getValidAccessToken: async () => 'token' }));
jest.mock('@/lib/api', () => ({ authApi: { getSocketToken: async () => 'socket-token' } }));

import { connectSocket, disconnectSocket, subscribeToOrder, unsubscribeFromOrder } from '@/lib/socket';

const fire = (event: string) => (handlers[event] || []).forEach((cb) => cb());
const subscribes = () => emitted.filter(([e]) => e === 'order:subscribe').map(([, id]) => id);

describe('website socket — order rooms survive a reconnect', () => {
  beforeEach(() => {
    disconnectSocket();
    emitted.length = 0;
    Object.keys(handlers).forEach((k) => delete handlers[k]);
    jest.clearAllMocks();
  });

  it('never stops trying to reconnect', () => {
    connectSocket('token');
    const options = ioMock.mock.calls[0][1] as { reconnectionAttempts: number };
    expect(options.reconnectionAttempts).toBe(Infinity);
  });

  it('joins the followed orders again every time the socket connects', () => {
    connectSocket('token');
    subscribeToOrder('order-A', () => undefined);
    subscribeToOrder('order-B', () => undefined);
    expect(subscribes()).toEqual(['order-A', 'order-B']);

    emitted.length = 0;
    fire('connect'); // a reconnect: the server has forgotten the rooms
    expect(subscribes().sort()).toEqual(['order-A', 'order-B']);
  });

  it('does not re-join an order the page stopped following', () => {
    connectSocket('token');
    subscribeToOrder('order-A', () => undefined);
    subscribeToOrder('order-B', () => undefined);
    unsubscribeFromOrder('order-A');
    emitted.length = 0;
    fire('connect');
    expect(subscribes()).toEqual(['order-B']);
  });

  it('forgets the rooms on sign-out', () => {
    connectSocket('token');
    subscribeToOrder('order-A', () => undefined);
    disconnectSocket();
    connectSocket('token-of-next-user');
    emitted.length = 0;
    fire('connect');
    expect(subscribes()).toEqual([]);
  });
});
