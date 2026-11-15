// Duty on/off owns the GPS: the server is told first, tracking only runs while
// on duty, an offline "off duty" is queued, and a permission revoked while the
// app was closed ends the duty honestly.
const mockAuthSvc = { updateDutyStatus: jest.fn() };
jest.mock('../src/services/auth.service', () => ({ __esModule: true, get default() { return mockAuthSvc; } }));
const mockSocket = { connect: jest.fn(), emitLocation: jest.fn() };
jest.mock('../src/services/socket.service', () => ({ __esModule: true, get default() { return mockSocket; } }));
const mockLoc = {
  requestLocationPermissions: jest.fn(),
  hasForegroundPermission: jest.fn(),
  hasBackgroundPermission: jest.fn(),
  startForegroundWatch: jest.fn(),
  stopForegroundWatch: jest.fn(),
  startBackgroundTracking: jest.fn(),
  stopBackgroundTracking: jest.fn(async () => undefined),
  getLastKnownLocation: jest.fn(async () => null),
};
jest.mock('../src/services/location.service', () => ({
  requestLocationPermissions: () => mockLoc.requestLocationPermissions(),
  hasForegroundPermission: () => mockLoc.hasForegroundPermission(),
  hasBackgroundPermission: () => mockLoc.hasBackgroundPermission(),
  startForegroundWatch: (a: unknown, b: unknown) => mockLoc.startForegroundWatch(a, b),
  stopForegroundWatch: () => mockLoc.stopForegroundWatch(),
  startBackgroundTracking: () => mockLoc.startBackgroundTracking(),
  stopBackgroundTracking: () => mockLoc.stopBackgroundTracking(),
  getLastKnownLocation: () => mockLoc.getLastKnownLocation(),
}));
const mockQueue = { addAction: jest.fn(async () => undefined) };
jest.mock('../src/utils/offlineQueue', () => ({ get offlineQueue() { return mockQueue; } }));
jest.mock('../src/store/authStore', () => ({ useAuthStore: { getState: () => ({ rider: { id: 'r1' } }) } }));
jest.mock('../src/services/api', () => ({
  getApiErrorMessage: (e: { message?: string }) => e?.message || 'error',
  isNetworkError: (e: { offline?: boolean }) => !!e?.offline,
}));

import { useDutyStore } from '../src/store/dutyStore';

const duty = () => useDutyStore.getState();
const fix = { latitude: 32.57, longitude: 74.07, accuracy: 12 };

beforeEach(() => {
  jest.resetAllMocks();
  mockLoc.stopBackgroundTracking.mockResolvedValue(undefined);
  mockLoc.getLastKnownLocation.mockResolvedValue(null);
  mockLoc.startForegroundWatch.mockResolvedValue(true);
  mockLoc.startBackgroundTracking.mockResolvedValue(true);
  mockAuthSvc.updateDutyStatus.mockResolvedValue({});
  mockQueue.addAction.mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  useDutyStore.setState({ isOnDuty: false, isSwitching: false, isTracking: false, backgroundTracking: false, error: null, lastFix: null, lastSentAt: null });
});

describe('going on duty', () => {
  it('no location permission: stays off duty and the server is not told', async () => {
    mockLoc.requestLocationPermissions.mockResolvedValue('denied');
    expect(await duty().goOnDuty()).toBe('permission_denied');
    expect(mockAuthSvc.updateDutyStatus).not.toHaveBeenCalled();
    expect(duty().isOnDuty).toBe(false);
  });

  it('server first, then tracking; good fixes go out over the socket', async () => {
    mockLoc.requestLocationPermissions.mockResolvedValue('granted');
    mockLoc.getLastKnownLocation.mockResolvedValue(fix);
    expect(await duty().goOnDuty()).toBe('ok');
    expect(mockAuthSvc.updateDutyStatus).toHaveBeenCalledWith(true);
    expect(mockSocket.connect).toHaveBeenCalled();
    expect(duty()).toMatchObject({ isOnDuty: true, isTracking: true, backgroundTracking: true, hasBackgroundPermission: true, lastFix: fix });
    const [onFix, onRaw] = mockLoc.startForegroundWatch.mock.calls[0] as [(f: typeof fix) => void, (f: typeof fix) => void];
    onFix(fix);
    expect(mockSocket.emitLocation).toHaveBeenCalledWith('r1', 32.57, 74.07, 12);
    expect(duty().lastSentAt).not.toBeNull();
    onRaw({ ...fix, accuracy: 300 });
    expect(duty().lastFix?.accuracy).toBe(300);
  });

  it('server refuses: no tracking, the reason is shown', async () => {
    mockLoc.requestLocationPermissions.mockResolvedValue('foreground_only');
    mockAuthSvc.updateDutyStatus.mockRejectedValue(new Error('Account not verified'));
    expect(await duty().goOnDuty()).toBe('error');
    expect(mockLoc.startForegroundWatch).not.toHaveBeenCalled();
    expect(duty().error).toBe('Account not verified');
    duty().clearError();
    expect(duty().error).toBeNull();
  });

  it('background tracking unavailable is not fatal', async () => {
    mockLoc.requestLocationPermissions.mockResolvedValue('foreground_only');
    mockLoc.startBackgroundTracking.mockRejectedValue(new Error('no bg'));
    expect(await duty().goOnDuty()).toBe('ok');
    expect(duty()).toMatchObject({ isOnDuty: true, backgroundTracking: false, hasBackgroundPermission: false });
  });

  it('a second press while switching is ignored', async () => {
    useDutyStore.setState({ isSwitching: true });
    expect(await duty().goOnDuty()).toBe('error');
    expect(mockLoc.requestLocationPermissions).not.toHaveBeenCalled();
  });
});

describe('going off duty', () => {
  beforeEach(() => useDutyStore.setState({ isOnDuty: true, isTracking: true, backgroundTracking: true }));

  it('tells the server and stops both trackers', async () => {
    await duty().goOffDuty();
    expect(mockAuthSvc.updateDutyStatus).toHaveBeenCalledWith(false);
    expect(mockLoc.stopForegroundWatch).toHaveBeenCalled();
    expect(mockLoc.stopBackgroundTracking).toHaveBeenCalled();
    expect(duty()).toMatchObject({ isOnDuty: false, isTracking: false, backgroundTracking: false });
  });

  it('offline: the status change is queued and tracking still stops', async () => {
    mockAuthSvc.updateDutyStatus.mockRejectedValue(Object.assign(new Error('Network Error'), { offline: true }));
    await duty().goOffDuty();
    expect(mockQueue.addAction).toHaveBeenCalledWith('update_status', { status: 'offline' });
    expect(duty().isOnDuty).toBe(false);
  });

  it('a server refusal keeps the rider on duty (but tracking is stopped)', async () => {
    mockAuthSvc.updateDutyStatus.mockRejectedValue(new Error('Finish your task first'));
    await duty().goOffDuty();
    expect(duty().error).toBe('Finish your task first');
    expect(mockLoc.stopForegroundWatch).toHaveBeenCalled();
  });

  it('teardown (sign-out) stops tracking without a server call', async () => {
    await duty().teardown();
    expect(mockAuthSvc.updateDutyStatus).not.toHaveBeenCalled();
    expect(duty().isOnDuty).toBe(false);
  });
});

describe('app start', () => {
  it('was off duty: makes sure no background task is left running', async () => {
    mockLoc.hasBackgroundPermission.mockResolvedValue(false);
    await duty().resume();
    expect(mockLoc.stopBackgroundTracking).toHaveBeenCalled();
    expect(mockLoc.startForegroundWatch).not.toHaveBeenCalled();
  });

  it('was on duty with permission: tracking re-armed, availability re-asserted', async () => {
    useDutyStore.setState({ isOnDuty: true });
    mockLoc.hasBackgroundPermission.mockResolvedValue(true);
    mockLoc.hasForegroundPermission.mockResolvedValue(true);
    await duty().resume();
    expect(mockSocket.connect).toHaveBeenCalled();
    expect(mockAuthSvc.updateDutyStatus).toHaveBeenCalledWith(true);
    expect(duty()).toMatchObject({ isTracking: true, backgroundTracking: true, hasBackgroundPermission: true });
  });

  it('permission revoked while away: goes off duty and says why', async () => {
    useDutyStore.setState({ isOnDuty: true });
    mockLoc.hasBackgroundPermission.mockResolvedValue(false);
    mockLoc.hasForegroundPermission.mockResolvedValue(false);
    await duty().resume();
    expect(duty()).toMatchObject({ isOnDuty: false, error: 'permission_revoked' });
  });

  it('refreshPermissions reads the background permission', async () => {
    mockLoc.hasBackgroundPermission.mockResolvedValue(true);
    await duty().refreshPermissions();
    expect(duty().hasBackgroundPermission).toBe(true);
  });
});
