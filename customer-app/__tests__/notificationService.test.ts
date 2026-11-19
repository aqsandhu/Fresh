// W15 (round 10): push notifications — permission asked once, a refusal
// means no token, the token reaches the server, list shapes from old and new
// servers, failures reported (not a fake empty list).
const mockApi = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
jest.mock('../src/services/api', () => ({ __esModule: true, get default() { return mockApi; } }));
jest.mock('@/lib/expoRuntime', () => ({ supportsRemotePush: () => true }));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'proj-1' } } } } }));
const mockNotifications = {
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'local-1'),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
};
jest.mock('expo-notifications', () => mockNotifications);

import { notificationService } from '../src/services/notification.service';

beforeEach(() => jest.clearAllMocks());

describe('push registration', () => {
  it('already allowed → no second prompt, the token is returned', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    await expect(notificationService.registerForPushNotifications()).resolves.toBe('ExponentPushToken[abc]');
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('the customer says no → no token (nothing is registered)', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    await expect(notificationService.registerForPushNotifications()).resolves.toBeNull();
    expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('the token is sent to the server; a failure is reported, not thrown', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { success: true, data: { message: 'ok' } } });
    await expect(notificationService.sendPushTokenToServer('tok')).resolves.toMatchObject({ success: true });
    expect(mockApi.post).toHaveBeenCalledWith('/notifications/register', { token: 'tok' });
    mockApi.post.mockRejectedValueOnce(new Error('down'));
    await expect(notificationService.sendPushTokenToServer('tok')).resolves.toMatchObject({ success: false });
  });
});

describe('notification list', () => {
  it('reads both the old (plain list) and new ({ notifications }) server answers', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { success: true, data: [{ id: 'n1' }] } });
    await expect(notificationService.getNotifications()).resolves.toMatchObject({ data: [{ id: 'n1' }] });
    mockApi.get.mockResolvedValueOnce({ data: { success: true, data: { notifications: [{ id: 'n2' }], unreadCount: 1 } } });
    await expect(notificationService.getNotifications()).resolves.toMatchObject({ data: [{ id: 'n2' }] });
  });

  it('a failed load says it failed (not a fake "no notifications")', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('down'));
    await expect(notificationService.getNotifications()).resolves.toEqual({ success: false, data: [] });
  });

  it('mark read / mark all / delete call the right endpoints and survive failures', async () => {
    mockApi.patch.mockResolvedValue({ data: { success: true } });
    mockApi.delete.mockResolvedValue({ data: { success: true } });
    await notificationService.markAsRead('n1');
    await notificationService.markAllAsRead();
    await notificationService.deleteNotification('n1');
    expect(mockApi.patch).toHaveBeenCalledWith('/notifications/n1/read');
    expect(mockApi.patch).toHaveBeenCalledWith('/notifications/read-all');
    expect(mockApi.delete).toHaveBeenCalledWith('/notifications/n1');
    mockApi.patch.mockRejectedValue(new Error('down'));
    await expect(notificationService.markAsRead('n1')).resolves.toMatchObject({ success: false });
  });

  it('local reminders can be scheduled and cancelled', async () => {
    await expect(notificationService.scheduleLocalNotification('Hi', 'Body', { seconds: 5 } as any)).resolves.toBe('local-1');
    await notificationService.cancelNotification('local-1');
    await notificationService.cancelAllNotifications();
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('local-1');
    expect(mockNotifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });
});
