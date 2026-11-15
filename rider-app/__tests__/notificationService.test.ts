// Rider notifications: ask permission once, Android channels, the rider's own
// sound / notification switches respected, push token sent to the server, and
// a tapped notification (also from a cold start) opens the right screen.
const mockN = {
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getExpoPushTokenAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setBadgeCountAsync: jest.fn(async () => true),
  AndroidImportance: { MAX: 5, HIGH: 4 },
};
jest.mock('expo-notifications', () => mockN);
const mockDevice = { isDevice: true };
jest.mock('expo-device', () => ({ __esModule: true, get isDevice() { return mockDevice.isDevice; } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'proj-1' } } } } }));
const mockAuth = { registerPushToken: jest.fn(async () => undefined) };
jest.mock('../src/services/auth.service', () => ({ get authService() { return mockAuth; } }));
const mockSettings = { soundEnabled: true, vibrationEnabled: true, notificationsEnabled: true };
jest.mock('../src/store/settingsStore', () => ({ useSettingsStore: { getState: () => mockSettings } }));

import { Platform } from 'react-native';

type Svc = typeof import('../src/services/notification.service').notificationService;
function fresh(os: 'ios' | 'android' = 'ios'): Svc {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  let svc: Svc | undefined;
  jest.isolateModules(() => {
    svc = require('../src/services/notification.service').notificationService;
  });
  return svc!;
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockSettings, { soundEnabled: true, vibrationEnabled: true, notificationsEnabled: true });
  mockDevice.isDevice = true;
  mockN.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('permission', () => {
  it('asks only when not granted yet; a refusal means no notifications', async () => {
    mockN.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockN.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const svc = fresh();
    expect(await svc.initialize()).toBe(false);
    expect(await svc.hasPermission()).toBe(false);
    expect(mockN.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('Android gets its three channels, without vibration when the rider turned it off', async () => {
    mockSettings.vibrationEnabled = false;
    const svc = fresh('android');
    expect(await svc.initialize()).toBe(true);
    expect(await svc.initialize()).toBe(true); // once only
    expect(mockN.setNotificationChannelAsync).toHaveBeenCalledTimes(3);
    for (const call of mockN.setNotificationChannelAsync.mock.calls as unknown as Array<[string, { vibrationPattern: number[] }]>) {
      expect(call[1].vibrationPattern).toEqual([0]);
    }
    await svc.refreshChannels();
    expect(mockN.setNotificationChannelAsync).toHaveBeenCalledTimes(6);
  });
});

describe('showing', () => {
  it('new task: title, order number in the body, tap data, sound per setting', async () => {
    const svc = fresh('android');
    await svc.notifyNewTask({ orderNumber: 'ORD-7', taskId: 't7', orderId: 'o7' });
    const content = (mockN.scheduleNotificationAsync.mock.calls[0] as unknown as [{ content: Record<string, unknown> }])[0].content;
    expect(content.data).toEqual({ type: 'new_task', orderNumber: 'ORD-7', taskId: 't7', orderId: 'o7' });
    expect(String(content.body)).toContain('ORD-7');
    expect(content.sound).toBe('default');
    expect(content.channelId).toBeTruthy();
  });

  it('nothing at all when the rider switched notifications off; silent when sound is off', async () => {
    const svc = fresh();
    mockSettings.notificationsEnabled = false;
    await svc.notifyTaskCancelled({ orderNumber: 'ORD-1' });
    expect(mockN.scheduleNotificationAsync).not.toHaveBeenCalled();
    mockSettings.notificationsEnabled = true;
    mockSettings.soundEnabled = false;
    await svc.notifyChat({ orderId: 'o1', senderName: 'Sara', message: 'Gate 2' });
    const content = (mockN.scheduleNotificationAsync.mock.calls[0] as unknown as [{ content: Record<string, unknown> }])[0].content;
    expect(content.sound).toBeUndefined();
    expect(String(content.title)).toContain('Sara');
    expect(content.body).toBe('Gate 2');
  });

  it('task updates and info messages', async () => {
    const svc = fresh();
    await svc.notifyTaskUpdated({ orderNumber: 'ORD-2', message: 'New cash amount' });
    await svc.notifyInfo('Duty', 'You are off duty');
    const bodies = (mockN.scheduleNotificationAsync.mock.calls as unknown as Array<[{ content: { body: string } }]>).map((c) => c[0].content.body);
    expect(bodies).toEqual(['New cash amount', 'You are off duty']);
    await svc.clearBadge();
    expect(mockN.setBadgeCountAsync).toHaveBeenCalledWith(0);
  });
});

describe('push token and taps', () => {
  it('a real device sends its push token to the server; an emulator does not', async () => {
    mockN.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    const svc = fresh();
    await svc.registerPushToken();
    expect(mockN.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-1' });
    expect(mockAuth.registerPushToken).toHaveBeenCalledWith('ExponentPushToken[abc]');
    mockDevice.isDevice = false;
    expect(await svc.getPushToken()).toBeNull();
  });

  it('bootstrap wires taps, including the notification that opened the app', async () => {
    const remove = jest.fn();
    let tap: ((r: unknown) => void) | undefined;
    mockN.addNotificationResponseReceivedListener.mockImplementation((cb: (r: unknown) => void) => { tap = cb; return { remove }; });
    mockN.getLastNotificationResponseAsync.mockResolvedValue({ notification: { request: { content: { data: { type: 'chat', orderId: 'o5' } } } } } as never);
    mockN.getExpoPushTokenAsync.mockResolvedValue({ data: null });
    const onTap = jest.fn();
    const svc = fresh();
    const unsubscribe = await svc.bootstrap(onTap);
    await new Promise((r) => setImmediate(r));
    expect(onTap).toHaveBeenCalledWith({ type: 'chat', orderId: 'o5' });
    tap!({ notification: { request: { content: { data: { type: 'new_task', taskId: 't1' } } } } });
    expect(onTap).toHaveBeenLastCalledWith({ type: 'new_task', taskId: 't1' });
    unsubscribe();
    expect(remove).toHaveBeenCalled();
  });

  it('without permission bootstrap does nothing', async () => {
    mockN.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    mockN.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const svc = fresh();
    const unsubscribe = await svc.bootstrap(jest.fn());
    expect(mockN.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
