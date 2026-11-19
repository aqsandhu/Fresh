// W16 (round 10) — B36: a page that subscribed to a live event before the
// socket existed (Orders / Riders opened by a reload: the page mounts before
// the notification provider has its token) silently got nothing — `socket?.on`
// was a no-op. A re-created socket (logout → login) lost every page listener
// the same way. Listeners are now kept and attached to whichever socket exists.
type Handler = (data?: unknown) => void;

class FakeSocket {
  handlers = new Map<string, Set<Handler>>();
  connected = false;
  auth: unknown;
  on(ev: string, fn: Handler) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev)!.add(fn);
    return this;
  }
  off(ev: string, fn?: Handler) {
    if (fn) this.handlers.get(ev)?.delete(fn);
    else this.handlers.delete(ev);
    return this;
  }
  emit(ev: string, data?: unknown) {
    this.handlers.get(ev)?.forEach((fn) => fn(data));
  }
  connect() { this.connected = true; }
  disconnect() { this.connected = false; }
}

const mockSockets: FakeSocket[] = [];
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => {
    const s = new FakeSocket();
    mockSockets.push(s);
    return s;
  }),
}));
jest.mock('@/config/env', () => ({ SOCKET_URL: 'http://localhost:3999' }));

import { connectSocket, disconnectSocket, offSocketEvent, onNewOrder, onSocketEvent } from '@/services/socket';

const latest = () => mockSockets[mockSockets.length - 1];

beforeEach(() => {
  disconnectSocket();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('admin socket listeners', () => {
  it('a listener added before the socket exists still receives events once it connects', () => {
    const onStatus = jest.fn();
    onSocketEvent('rider:status', onStatus);
    connectSocket('tok');
    latest().emit('rider:status', { riderId: 'r1' });
    expect(onStatus).toHaveBeenCalledWith({ riderId: 'r1' });
    offSocketEvent('rider:status', onStatus);
  });

  it('listeners survive a new socket (logout → login, or a reconnect that builds a new one)', () => {
    const onOrder = jest.fn();
    connectSocket('tok');
    onNewOrder(onOrder);
    disconnectSocket();
    connectSocket('tok-2');
    latest().emit('order:new', { orderNumber: 'ORD-1' });
    expect(onOrder).toHaveBeenCalledTimes(1);
    offSocketEvent('order:new', onOrder);
  });

  it('a removed listener gets nothing, now or on the next socket', () => {
    const fn = jest.fn();
    connectSocket('tok');
    onSocketEvent('rider:task_completed', fn);
    offSocketEvent('rider:task_completed', fn);
    latest().emit('rider:task_completed');
    disconnectSocket();
    connectSocket('tok');
    latest().emit('rider:task_completed');
    expect(fn).not.toHaveBeenCalled();
  });

  it('the same listener added twice is called once per event', () => {
    const fn = jest.fn();
    connectSocket('tok');
    onSocketEvent('rider:location', fn);
    onSocketEvent('rider:location', fn);
    latest().emit('rider:location', {});
    expect(fn).toHaveBeenCalledTimes(1);
    offSocketEvent('rider:location');
    latest().emit('rider:location', {});
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
