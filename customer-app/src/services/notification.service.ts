import * as Device from 'expo-device';
import Constants from 'expo-constants';
import apiClient from './api';
import { ApiResponse, Notification } from '@types';
import { supportsRemotePush } from '@/lib/expoRuntime';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null = null;
let handlerConfigured = false;

function getNotifications(): NotificationsModule | null {
  if (!supportsRemotePush()) return null;
  if (!notificationsModule) {
    // Lazy load so Expo Go never executes expo-notifications setup at import time.
    notificationsModule = require('expo-notifications') as NotificationsModule;
  }
  if (!handlerConfigured && notificationsModule) {
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    handlerConfigured = true;
  }
  return notificationsModule;
}

class NotificationService {
  async registerForPushNotifications(): Promise<string | null> {
    const Notifications = getNotifications();
    if (!Notifications) return null;

    let token = null;

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return null;
      }

      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId,
        })
      ).data;
    }

    return token;
  }

  async sendPushTokenToServer(token: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.post('/notifications/register', { token });
      return response.data;
    } catch {
      return { success: false, data: { message: 'Not available' } };
    }
  }

  async getNotifications(): Promise<ApiResponse<Notification[]>> {
    try {
      const response = await apiClient.get('/notifications');
      return response.data;
    } catch {
      return { success: true, data: [] };
    }
  }

  async markAsRead(id: string): Promise<ApiResponse<Notification>> {
    try {
      const response = await apiClient.patch(`/notifications/${id}/read`);
      return response.data;
    } catch {
      return { success: false, data: {} as Notification };
    }
  }

  async markAllAsRead(): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.patch('/notifications/read-all');
      return response.data;
    } catch {
      return { success: false, data: { message: 'Not available' } };
    }
  }

  async deleteNotification(id: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.delete(`/notifications/${id}`);
      return response.data;
    } catch {
      return { success: false, data: { message: 'Not available' } };
    }
  }

  async scheduleLocalNotification(
    title: string,
    body: string,
    data?: Record<string, any>,
    trigger?: import('expo-notifications').NotificationTriggerInput
  ): Promise<string | null> {
    const Notifications = getNotifications();
    if (!Notifications) return null;

    return Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: 'default',
      },
      trigger: trigger ?? null,
    });
  }

  async cancelNotification(notificationId: string): Promise<void> {
    const Notifications = getNotifications();
    if (!Notifications) return;
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  async cancelAllNotifications(): Promise<void> {
    const Notifications = getNotifications();
    if (!Notifications) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  async sendRiderArrivalNotification(orderId: string): Promise<void> {
    await this.scheduleLocalNotification(
      'Rider Arrived!',
      'Aapka order darwaze par hai! Your rider has arrived.',
      { orderId, type: 'rider_arrived' }
    );
  }
}

export const notificationService = new NotificationService();
export default notificationService;
