// Two things that went wrong between one signed-in person and the next, and
// between one connection and the next (Sept audit; fixed Nov 2026):
//  • signing out left the cart and wishlist for the NEXT account on the phone
//  • a session that expired kept its socket (still authenticated as the old user)
//  • after a reconnect the server had forgotten the order rooms, so tracking
//    and chat went silent while the app still showed "connected"

type Handler = (...args: unknown[]) => void;
const handlers: Record<string, Handler[]> = {};
const emitted: [string, unknown][] = [];
const fakeSocket = {
  connected: true,
  auth: {} as Record<string, unknown>,
  id: 'sock-1',
  on: jest.fn((event: string, cb: Handler) => { (handlers[event] ||= []).push(cb); return fakeSocket; }),
  off: jest.fn(),
  emit: jest.fn((event: string, payload: unknown) => { emitted.push([event, payload]); return fakeSocket; }),
  connect: jest.fn(),
  disconnect: jest.fn(),
};
const mockIo = jest.fn((..._args: unknown[]) => fakeSocket);
jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
jest.mock('../src/lib/secureTokens', () => ({
  getStoredToken: jest.fn(async () => 'token'),
  storeTokens: jest.fn(async () => undefined),
  setStoredToken: jest.fn(async () => undefined),
  clearTokens: jest.fn(async () => undefined),
}));
jest.mock('../src/services/auth.service', () => ({ authService: { logout: jest.fn(async () => undefined) } }));
jest.mock('../src/services/cart.service', () => ({
  cartService: { syncCartWithBackend: jest.fn(async () => true), clearBackendCart: jest.fn(async () => undefined) },
}));

import { socketService } from '../src/services/socket.service';
import { useAuthStore } from '../src/store/authStore';
import { useCartStore } from '../src/store/cartStore';
import { useWishlistStore } from '../src/store/wishlistStore';
import { clearAppSession } from '../src/lib/sessionEvents';

const fire = (event: string) => (handlers[event] || []).forEach((cb) => cb());
const subscribes = () => emitted.filter(([e]) => e === 'order:subscribe').map(([, id]) => id);

describe('socket — order rooms survive a reconnect', () => {
  beforeEach(async () => {
    socketService.disconnect();
    emitted.length = 0;
    Object.keys(handlers).forEach((k) => delete handlers[k]);
    jest.clearAllMocks();
    fakeSocket.connected = false;
    await socketService.connect();
    fakeSocket.connected = true;
  });

  it('never stops trying to reconnect', () => {
    const options = mockIo.mock.calls[0][1] as { reconnectionAttempts: number };
    expect(options.reconnectionAttempts).toBe(Infinity);
  });

  it('joins followed orders again on every connect, but not the ones it left', () => {
    socketService.subscribeToOrder('order-A', () => undefined);
    socketService.subscribeToOrder('order-B', () => undefined);
    socketService.unsubscribeFromOrder('order-A');
    emitted.length = 0;
    fire('connect');
    expect(subscribes()).toEqual(['order-B']);
  });

  it('forgets the rooms when the socket is closed on sign-out', async () => {
    socketService.subscribeToOrder('order-A', () => undefined);
    socketService.disconnect();
    fakeSocket.connected = false;
    await socketService.connect();
    emitted.length = 0;
    fire('connect');
    expect(subscribes()).toEqual([]);
  });
});

describe('sign-out and expired sessions', () => {
  const item = { product: { id: 'p1', name: 'Tomato', price: 200 }, quantity: 2 } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    useCartStore.setState({ items: [item], cartsByCity: { 'city-1': [item], 'city-2': [item] }, activeCityId: 'city-1' });
    useWishlistStore.setState({ items: [{ id: 'p1' } as never] });
    useAuthStore.setState({ user: { id: 'u1' } as never, token: 't', isAuthenticated: true });
  });

  it('signing out empties the cart of every city and the wishlist', async () => {
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().cartsByCity).toEqual({});
    expect(useWishlistStore.getState().items).toEqual([]);
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });

  it('an expired session closes the socket but keeps the cart for the same person', async () => {
    await socketService.connect();
    jest.clearAllMocks();
    clearAppSession();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(fakeSocket.disconnect).toHaveBeenCalled();
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});
