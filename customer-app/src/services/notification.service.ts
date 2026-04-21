import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import apiClient, { handleApiError } from './api';
import { ApiResponse, Notification } from '@types';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class NotificationService {
  async registerForPushNotifications(): Promise<string | null> {
    let token = null;

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return null;
      }

      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId,
        })
      ).data;
    } else {
      console.log('Must use physical device for Push Notifications');
    }

    return token;
  }

  async sendPushTokenToServer(token: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.post('/notifications/register', { token });
      return response.data;
    } catch (error) {
      // Backend doesn't have notification endpoints yet — fail silently
      console.log('Push token registration not available yet');
      return { success: false, data: { message: 'Not available' } };
    }
  }

  async getNotifications(): Promise<ApiResponse<Notification[]>> {
    try {
      const response = await apiClient.get('/notifications');
      return response.data;
    } catch (error) {
      // Backend doesn't have notification endpoints yet — return empty
      console.log('Notifications endpoint not available yet');
      return { success: true, data: [] };
    }
  }

  async markAsRead(id: string): Promise<ApiResponse<Notification>> {
    try {
      const response = await apiClient.patch(`/notifications/${id}/read`);
      return response.data;
    } catch (error) {
      console.log('Mark as read not available yet');
      return { success: false, data: {} as Notification };
    }
  }

  async markAllAsRead(): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.patch('/notifications/read-all');
      return response.data;
    } catch (error) {
      console.log('Mark all as read not available yet');
      return { success: false, data: { message: 'Not available' } };
    }
  }

  async deleteNotification(id: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.delete(`/notifications/${id}`);
      return response.data;
    } catch (error) {
      console.log('Delete notification not available yet');
      return { success: false, data: { message: 'Not available' } };
    }
  }

  // Local notification helpers
  async scheduleLocalNotification(
    title: string,
    body: string,
    data?: Record<string, any>,
    trigger?: Notifications.NotificationTriggerInput
  ): Promise<string> {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: 'default',
      },
      trigger: trigger || null,
    });
    return id;
  }

  async cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  async cancelAllNotifications(): Promise<void> {
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
