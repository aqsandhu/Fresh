// W16 (round 10): admin sign-in / session service. G21: a suspended admin
// with the right password got the server's "Account is not active" replaced
// by "Invalid phone number or password" — they were told the password was
// wrong.
import { mockApi, resetApiMocks } from './testApiMock';

jest.mock('@/services/api', () => require('./testApiMock').apiModuleMock());
jest.mock('@/config/env', () => ({ AUTH_COOKIES_ENABLED: false }));
const mockRefresh = jest.fn();
jest.mock('@/lib/adminTokenRefresh', () => {
  const actual = jest.requireActual('@/lib/adminTokenRefresh');
  return { ...actual, refreshAdminAccessToken: () => mockRefresh() };
});

import { authService } from '@/services/auth.service';
import { ServerUnreachableError } from '@/lib/adminTokenRefresh';

const store = new Map<string, string>();
const ls = localStorage as unknown as Record<'getItem' | 'setItem' | 'removeItem', jest.Mock>;

beforeEach(() => {
  resetApiMocks();
  store.clear();
  ls.getItem.mockImplementation((k: string) => (store.has(k) ? store.get(k) : null));
  ls.setItem.mockImplementation((k: string, v: string) => void store.set(k, String(v)));
  ls.removeItem.mockImplementation((k: string) => void store.delete(k));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

const adminUser = { id: 'u1', phone: '03007770001', fullName: 'Asad', role: 'admin', permissions: ['orders.view'], adminRoleId: 'r1', adminRoleCityId: 'c1' };

describe('login', () => {
  it('phone and password are required before anything is sent', async () => {
    await expect(authService.login({ phone: ' ', password: 'x' })).rejects.toThrow('Phone number is required');
    await expect(authService.login({ phone: '0300', password: '' })).rejects.toThrow('Password is required');
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('a right password with two-step sign-in returns the code challenge and stores nothing', async () => {
    mockApi.post.mockResolvedValue({ success: true, data: { requiresOtp: true, phoneHint: '***0001', channel: 'sms', resendIn: 60 } });
    await expect(authService.login({ phone: '03007770001', password: 'Manager123' })).resolves.toEqual({
      requiresOtp: true, otpBypass: false, phoneHint: '***0001', channel: 'sms', resendIn: 60,
    });
    expect(store.size).toBe(0);
  });

  it('success stores tokens + user and selects the role\'s city', async () => {
    mockApi.post.mockResolvedValue({ success: true, data: { user: adminUser, tokens: { accessToken: 'at', refreshToken: 'rt' } } });
    const res = await authService.login({ phone: '03007770001', password: 'Manager123', otp: '123789' });
    expect((res as any).user.fullName).toBe('Asad');
    expect(store.get('admin_token')).toBe('at');
    expect(store.get('admin_refresh_token')).toBe('rt');
    expect(JSON.parse(store.get('admin_user') as string).permissions).toEqual(['orders.view']);
    expect(store.get('admin_selected_city_id')).toBe('c1');
    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.getToken()).toBe('at');
    expect(authService.getRefreshToken()).toBe('rt');
  });

  it('a malformed answer is refused', async () => {
    mockApi.post.mockResolvedValue({ success: true, data: { user: { id: '' } } });
    await expect(authService.login({ phone: '0300', password: 'x' })).rejects.toThrow('Invalid login response from server');
  });

  it.each([
    [{ status: 401, data: { message: 'Invalid credentials' } }, undefined, 'Invalid phone number or password'],
    [{ status: 401, data: { message: 'Incorrect verification code' } }, '000000', 'Incorrect verification code'],
    [{ status: 401, data: { message: 'Account is not active. Please contact support.' } }, undefined, 'Account is not active. Please contact support.'],
    [{ status: 403, data: {} }, undefined, 'Account is disabled. Please contact admin.'],
    [{ status: 429, data: { message: 'Too many failed login attempts. Please try again later.' } }, undefined, 'Too many failed login attempts. Please try again later.'],
  ])('refusal %j (code: %s) → "%s"', async (response, otp, message) => {
    mockApi.post.mockRejectedValue({ response });
    await expect(authService.login({ phone: '0300', password: 'x', otp })).rejects.toThrow(message);
  });
});

describe('session', () => {
  it('logout revokes the refresh token on the server and clears everything local', () => {
    mockApi.post.mockResolvedValue({ success: true });
    store.set('admin_refresh_token', 'rt');
    store.set('admin_token', 'at');
    store.set('admin_user', '{}');
    store.set('freshbazar-admin-notifications', '[]');
    store.set('admin_selected_city_id', 'c1');
    authService.logout();
    expect(mockApi.post).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'rt' });
    expect(store.size).toBe(0);
  });

  it('logout with no session sends nothing (no 401 on the login page)', () => {
    authService.logout();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('a broken stored user reads as signed out', () => {
    store.set('admin_user', '{not json');
    expect(authService.getCurrentUser()).toBeNull();
    store.set('admin_user', JSON.stringify(adminUser));
    expect(authService.getCurrentUser()?.id).toBe('u1');
  });

  it('fetchSession refreshes the stored user; a refusal is "signed out", an unreachable server is not', async () => {
    mockApi.get.mockResolvedValueOnce({ success: true, data: { user: { ...adminUser, permissions: ['orders.view', 'orders.update'] } } });
    expect((await authService.fetchSession())?.permissions).toEqual(['orders.view', 'orders.update']);
    expect(JSON.parse(store.get('admin_user') as string).permissions).toContain('orders.update');
    mockApi.get.mockRejectedValueOnce({ response: { status: 401 } });
    await expect(authService.fetchSession()).resolves.toBeNull();
    mockApi.get.mockRejectedValueOnce({ isAxiosError: true, request: {}, message: 'Network Error' });
    await expect(authService.fetchSession()).rejects.toBeInstanceOf(ServerUnreachableError);
  });

  it('verifyToken is false without a session and asks the server otherwise', async () => {
    await expect(authService.verifyToken()).resolves.toBe(false);
    store.set('admin_token', 'at');
    mockApi.get.mockResolvedValueOnce({ success: true, data: { user: adminUser } });
    await expect(authService.verifyToken()).resolves.toBe(true);
  });

  it('refreshToken: a refused refresh signs out; an unreachable server keeps the session', async () => {
    store.set('admin_token', 'at');
    mockRefresh.mockResolvedValueOnce('new');
    await expect(authService.refreshToken()).resolves.toBe(true);
    mockRefresh.mockRejectedValueOnce(new ServerUnreachableError());
    await expect(authService.refreshToken()).resolves.toBe(false);
    expect(store.get('admin_token')).toBe('at');
    mockRefresh.mockResolvedValueOnce(null);
    await expect(authService.refreshToken()).resolves.toBe(false);
    expect(store.has('admin_token')).toBe(false);
  });
});

describe('account', () => {
  it('change password: checks first, maps a wrong current password', async () => {
    await expect(authService.changePassword('', 'abcdef')).rejects.toThrow('Current password is required');
    await expect(authService.changePassword('old', 'abc')).rejects.toThrow('New password must be at least 6 characters');
    mockApi.post.mockRejectedValueOnce({ response: { status: 401 } });
    await expect(authService.changePassword('old', 'abcdef')).rejects.toThrow('Current password is incorrect');
    mockApi.post.mockResolvedValueOnce({ success: true });
    await expect(authService.changePassword('old', 'abcdef')).resolves.toBeUndefined();
    expect(mockApi.post).toHaveBeenLastCalledWith('/admin/change-password', { currentPassword: 'old', newPassword: 'abcdef' });
  });

  it('update profile merges into the stored user', async () => {
    store.set('admin_user', JSON.stringify(adminUser));
    mockApi.put.mockResolvedValueOnce({ success: true, data: { fullName: 'Asad Ali' } });
    await authService.updateProfile({ fullName: 'Asad Ali' });
    expect(JSON.parse(store.get('admin_user') as string)).toMatchObject({ id: 'u1', fullName: 'Asad Ali' });
    mockApi.put.mockRejectedValueOnce({ response: { data: { message: 'Email already used' } } });
    await expect(authService.updateProfile({ email: 'x@y.z' })).rejects.toThrow('Email already used');
  });
});
