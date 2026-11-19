// Customer sign-in: OTP and PIN both store the tokens in secure storage (never
// the persisted blob), a refused step leaves the customer signed out, and the
// auth service sends exactly what the API expects.
const mockApi = { get: jest.fn(), post: jest.fn(), put: jest.fn() };
jest.mock('@services/api', () => ({ __esModule: true, get default() { return mockApi; }, handleApiError: (e: Error) => e }));
const mockTokens = { refresh: 'refresh-1' as string | null };
jest.mock('@/lib/secureTokens', () => ({
  storeTokens: jest.fn(async () => undefined),
  setStoredToken: jest.fn(async () => undefined),
  clearTokens: jest.fn(async () => undefined),
  getStoredRefreshToken: async () => mockTokens.refresh,
  getStoredToken: async () => 'tok',
}));
jest.mock('@services/socket.service', () => ({ socketService: { disconnect: jest.fn(), updateAuthToken: jest.fn() } }));

import { authService } from '@services/auth.service';
import { useAuthStore } from '@/store/authStore';

const secure = jest.requireMock('@/lib/secureTokens') as { storeTokens: jest.Mock; setStoredToken: jest.Mock; clearTokens: jest.Mock };
const user = { id: 'u1', fullName: 'Ali', phone: '+923001234567' };
const authOk = { data: { success: true, data: { user, tokens: { accessToken: 'a1', refreshToken: 'r1' } } } };
const store = () => useAuthStore.getState();

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.put.mockReset();
  secure.storeTokens.mockClear();
  mockTokens.refresh = 'refresh-1';
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false, isLoading: false, pinVerifiedAt: null });
});

describe('auth service requests', () => {
  it('OTP, login, register, profile', async () => {
    mockApi.post.mockResolvedValue({ data: { success: true, data: { userExists: true } } });
    await authService.sendOtp({ phone: '03001234567', channel: 'whatsapp' } as never);
    await authService.verifyLogin({ phone: '0300', code: '123456' } as never);
    await authService.register({ phone: '0300', code: '123456', full_name: 'Ali' } as never);
    expect(mockApi.post.mock.calls.map((c) => c[0])).toEqual(['/auth/send-otp', '/auth/verify-login', '/auth/verify-register']);
    mockApi.get.mockResolvedValue({ data: { success: true, data: user } });
    await authService.getProfile();
    mockApi.put.mockResolvedValue({ data: { success: true, data: user } });
    await authService.updateProfile({ fullName: 'Ali K' } as never);
    expect(mockApi.put).toHaveBeenCalledWith('/auth/profile', { fullName: 'Ali K' });
  });

  it('logout revokes this session; delete account', async () => {
    mockApi.post.mockResolvedValue({ data: { success: true } });
    await authService.logout();
    expect(mockApi.post).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'refresh-1' });
    mockTokens.refresh = null;
    await authService.logout();
    expect(mockApi.post).toHaveBeenLastCalledWith('/auth/logout', undefined);
    // Deleting asks for the PIN again; an account that never set one sends none.
    await authService.deleteAccount('4826');
    expect(mockApi.post).toHaveBeenLastCalledWith('/auth/delete-account', { pin: '4826' });
    await authService.deleteAccount();
    expect(mockApi.post).toHaveBeenLastCalledWith('/auth/delete-account', {});
  });

  it('PIN: status, set, verify, reset', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: { exists: true, hasPin: true } } });
    expect((await authService.pinStatus('0300')).data).toEqual({ exists: true, hasPin: true });
    expect(mockApi.get).toHaveBeenCalledWith('/auth/pin-status', { params: { phone: '0300' } });
    mockApi.post.mockResolvedValue({ data: { success: true, data: { ok: true } } });
    await authService.verifyPin('0300', '1234');
    await authService.resetPinWithCode('0300', '123456', '4321');
    expect(mockApi.post).toHaveBeenCalledWith('/auth/verify-pin', { phone: '0300', pin: '1234' });
    expect(mockApi.post).toHaveBeenCalledWith('/auth/reset-pin', { phone: '0300', code: '123456', newPin: '4321' });
  });

  it('errors reach the screen', async () => {
    mockApi.post.mockRejectedValue(new Error('Invalid code'));
    await expect(authService.verifyLogin({ phone: '0', code: '0' } as never)).rejects.toThrow('Invalid code');
    await expect(authService.verifyPin('0', '0')).rejects.toThrow('Invalid code');
    mockApi.get.mockRejectedValue(new Error('down'));
    await expect(authService.pinStatus('0')).rejects.toThrow('down');
  });
});

describe('auth store', () => {
  it('OTP login stores tokens securely and marks the PIN as just verified', async () => {
    mockApi.post.mockResolvedValue(authOk);
    await store().verifyOTP('0300', '123456');
    expect(secure.storeTokens).toHaveBeenCalledWith('a1', 'r1');
    expect(store()).toMatchObject({ isAuthenticated: true, token: 'a1', isLoading: false });
    expect(store().pinVerifiedAt).not.toBeNull();
  });

  it('PIN login, register, and reset-then-login', async () => {
    mockApi.post.mockResolvedValue(authOk);
    await store().verifyWithPin('0300', '1234');
    expect(store().isAuthenticated).toBe(true);
    useAuthStore.setState({ isAuthenticated: false });
    await store().register('0300', '123456', 'Ali');
    expect(store().user).toEqual(user);
    useAuthStore.setState({ isAuthenticated: false });
    await store().resetPinAndLogin('0300', '123456', '4321');
    expect(store().isAuthenticated).toBe(true);
  });

  it('a refused code leaves the customer signed out (and not stuck loading)', async () => {
    mockApi.post.mockRejectedValue(new Error('Invalid code'));
    await expect(store().verifyOTP('0300', '000000')).rejects.toThrow('Invalid code');
    expect(store()).toMatchObject({ isAuthenticated: false, isLoading: false });
  });

  it('sendOtp tells the screen whether the number has an account', async () => {
    mockApi.post.mockResolvedValue({ data: { success: true, data: { userExists: false, channel: 'sms' } } });
    expect(await store().sendOtp('0300')).toEqual({ userExists: false, userName: undefined, channel: 'sms' });
  });

  it('profile edits, token set/clear, PIN set', async () => {
    useAuthStore.setState({ user: user as never });
    store().updateUser({ fullName: 'Ali Khan' } as never);
    expect(store().user).toMatchObject({ fullName: 'Ali Khan', phone: user.phone });
    store().setToken('t2');
    expect(secure.setStoredToken).toHaveBeenCalledWith('t2');
    store().setToken(null);
    expect(secure.clearTokens).toHaveBeenCalled();
    store().setUser(null);
    expect(store().isAuthenticated).toBe(false);
    mockApi.post.mockResolvedValue({ data: { success: true } });
    await store().setPin('1234');
    expect(store().pinVerifiedAt).not.toBeNull();
    store().setLoading(true);
    expect(store().isLoading).toBe(true);
  });

  it('the token never goes into the persisted blob', () => {
    const p = (useAuthStore as unknown as { persist: { getOptions: () => { partialize: (s: unknown) => Record<string, unknown> } } }).persist;
    expect(p.getOptions().partialize({ ...store(), token: 'secret' })).not.toHaveProperty('token');
  });
});
