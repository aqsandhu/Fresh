// Rider sign-in / sign-out: tokens go to secure storage (never the persisted
// blob), a system-ended session says why, and sign-out goes off duty first and
// leaves nothing behind (queue, socket, tokens).
const mockAuthService = { login: jest.fn(), getProfile: jest.fn(), logout: jest.fn(async () => undefined) };
jest.mock('../src/services/auth.service', () => ({ __esModule: true, get default() { return mockAuthService; } }));
const mockSocket = { disconnect: jest.fn() };
jest.mock('../src/services/socket.service', () => ({ __esModule: true, get default() { return mockSocket; } }));
const mockTokens = { storeTokens: jest.fn(async () => undefined), clearTokens: jest.fn(async () => undefined), getStoredToken: jest.fn() };
jest.mock('../src/lib/secureTokens', () => ({
  storeTokens: (...a: unknown[]) => mockTokens.storeTokens(...(a as [])),
  clearTokens: () => mockTokens.clearTokens(),
  getStoredToken: () => mockTokens.getStoredToken(),
}));
jest.mock('../src/lib/sessionEvents', () => ({ registerSessionHandlers: jest.fn() }));
const mockQueue = { clearQueue: jest.fn(async () => undefined) };
jest.mock('../src/utils/offlineQueue', () => ({ get offlineQueue() { return mockQueue; } }));
jest.mock('../src/services/api', () => ({ getApiErrorMessage: (e: { message?: string }, f?: string) => e?.message || f }));
const mockDuty = { isOnDuty: false, goOffDuty: jest.fn(async () => undefined), teardown: jest.fn(async () => undefined) };
jest.mock('../src/store/dutyStore', () => ({ useDutyStore: { getState: () => mockDuty } }));

import { useAuthStore } from '../src/store/authStore';

// Captured once, before any clearAllMocks: the store registers them when it loads.
const handlers = (jest.requireMock('../src/lib/sessionEvents').registerSessionHandlers as jest.Mock).mock.calls[0][0] as {
  onClear: () => void;
  onTokenUpdate: (t: string) => void;
};

const store = () => useAuthStore.getState();
const rider = { id: 'r1', name: 'Ali' };

beforeEach(() => {
  jest.clearAllMocks();
  mockDuty.isOnDuty = false;
  useAuthStore.setState({ rider: null, token: null, isAuthenticated: false, error: null, sessionEndReason: null });
});

it('login keeps the tokens in secure storage and loads the full profile', async () => {
  mockAuthService.login.mockResolvedValue({ rider, token: 'access-1', refreshToken: 'refresh-1' });
  mockAuthService.getProfile.mockResolvedValue({ phone: '+92300' });
  await store().login({ phone: '03001234567', password: 'x' } as never);
  expect(mockTokens.storeTokens).toHaveBeenCalledWith('access-1', 'refresh-1');
  expect(store().isAuthenticated).toBe(true);
  await new Promise((r) => setImmediate(r));
  expect(store().rider).toEqual({ id: 'r1', name: 'Ali', phone: '+92300' });
});

it('a failed login shows why and stays signed out', async () => {
  mockAuthService.login.mockRejectedValue(new Error('Wrong password'));
  await expect(store().login({ phone: 'x', password: 'y' } as never)).rejects.toThrow();
  expect(store().error).toBe('Wrong password');
  expect(store().isAuthenticated).toBe(false);
  store().clearError();
  expect(store().error).toBeNull();
});

it('a failing profile refresh keeps the rider as is', async () => {
  useAuthStore.setState({ rider: rider as never });
  mockAuthService.getProfile.mockRejectedValue(new Error('down'));
  expect(await store().refreshProfile()).toBeNull();
  expect(store().rider).toEqual(rider);
});

it('sign-out goes off duty first, tells the server and clears everything local', async () => {
  mockDuty.isOnDuty = true;
  useAuthStore.setState({ rider: rider as never, token: 't', isAuthenticated: true });
  await store().logout();
  expect(mockDuty.goOffDuty).toHaveBeenCalledWith({ silent: true });
  expect(mockAuthService.logout).toHaveBeenCalled();
  expect(mockQueue.clearQueue).toHaveBeenCalled();
  expect(mockSocket.disconnect).toHaveBeenCalled();
  expect(mockTokens.clearTokens).toHaveBeenCalled();
  expect(store()).toMatchObject({ rider: null, token: null, isAuthenticated: false, sessionEndReason: null });
});

it('a session ended by the server keeps the reason for the login screen', () => {
  useAuthStore.setState({ isAuthenticated: true });
  store().endSession('Your account was deactivated');
  expect(store().sessionEndReason).toBe('Your account was deactivated');
  store().clearSessionEndReason();
  expect(store().sessionEndReason).toBeNull();
});

it('app start: signed in only when secure storage has a token', async () => {
  mockTokens.getStoredToken.mockResolvedValueOnce('stored');
  await store().hydrateAuth();
  expect(store()).toMatchObject({ token: 'stored', isAuthenticated: true, isHydrated: true });
  mockTokens.getStoredToken.mockResolvedValueOnce(null);
  await store().hydrateAuth();
  expect(store().isAuthenticated).toBe(false);
});

it('session events from the API layer reach the store', () => {
  handlers.onTokenUpdate('fresh');
  expect(store()).toMatchObject({ token: 'fresh', isAuthenticated: true });
  handlers.onClear();
  expect(store().isAuthenticated).toBe(false);
});

it('tokens are never written to the persisted (AsyncStorage) state', () => {
  const persist = (useAuthStore as unknown as { persist: { getOptions: () => { partialize: (s: unknown) => Record<string, unknown> } } }).persist;
  const saved = persist.getOptions().partialize({ ...store(), token: 'secret' });
  expect(saved).not.toHaveProperty('token');
});
