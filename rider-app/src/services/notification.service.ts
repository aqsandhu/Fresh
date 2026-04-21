import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { authService } from './auth.service';
import { NOTIFICATION_CHANNELS } from '../utils/constants';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class NotificationService {
  private isInitialized: boolean = false;

  // Initialize notifications
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permissions not granted');
        return false;
      }

      // Set up notification channels for Android
      if (Platform.OS === 'android') {
        await this.setupNotificationChannels();
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Error initializing notifications:', error);
      return false;
    }
  }

  // Set up Android notification channels
  private async setupNotificationChannels(): Promise<void> {
    // New Task Channel
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.NEW_TASK, {
      name: 'New Tasks',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#10B981',
      sound: 'notification-sound.wav',
    });

    // Task Update Channel
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.TASK_UPDATE, {
      name: 'Task Updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 100],
      lightColor: '#3B82F6',
    });

    // Call Request Channel
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.CALL_REQUEST, {
      name: 'Call Requests',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 500, 200, 500],
      lightColor: '#F59E0B',
      sound: 'notification-sound.wav',
    });

    // Admin Message Channel
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.ADMIN_MESSAGE, {
      name: 'Admin Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8B5CF6',
    });
  }

  // Get push token
  async getPushToken(): Promise<string | null> {
    try {
      if (!Device.isDevice) {
        console.log('Must use physical device for push notifications');
        return null;
      }

      const token = (await Notifications.getExpoPushTokenAsync()).data;
      return token;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  // Register push token with backend
  async registerPushToken(): Promise<void> {
    try {
      const token = await this.getPushToken();
      if (token) {
        await authService.updateFCMToken(token);
      }
    } catch (error) {
      console.error('Error registering push token:', error);
    }
  }

  // Schedule local notification
  async scheduleNotification(
    title: string,
    body: string,
    data?: Record<string, any>,
    trigger?: Notifications.NotificationTriggerInput
  ): Promise<string> {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
        badge: 1,
      },
      trigger: trigger || null,
    });
    return identifier;
  }

  // Show immediate notification
  async showNotification(
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<void> {
    await this.scheduleNotification(title, body, data, null);
  }

  // Cancel scheduled notification
  async cancelNotification(identifier: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  }

  // Cancel all notifications
  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  // Clear badge
  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }

  // Get pending notifications
  async getPendingNotifications(): Promise<Notifications.NotificationRequest[]> {
    return await Notifications.getAllScheduledNotificationsAsync();
  }

  // Set up notification listeners
  setupNotificationListeners(
    onNotificationReceived?: (notification: Notifications.Notification) => void,
    onNotificationResponse?: (response: Notifications.NotificationResponse) => void
  ): { remove: () => void } {
    // Received while app is foregrounded
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
      onNotificationReceived?.(notification);
    });

    // User tapped notification
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('Notification response:', response);
        onNotificationResponse?.(response);
      }
    );

    return {
      remove: () => {
        receivedSubscription.remove();
        responseSubscription.remove();
      },
    };
  }

  // Show new task notification
  async showNewTaskNotification(taskId: string, taskType: string): Promise<void> {
    await this.showNotification(
      'New Task Assigned!',
      `You have a new ${taskType} task. Tap to view details.`,
      { type: 'new_task', taskId }
    );
  }

  // Show task cancelled notification
  async showTaskCancelledNotification(taskId: string, reason?: string): Promise<void> {
    await this.showNotification(
      'Task Cancelled',
      reason || 'A task has been cancelled.',
      { type: 'task_cancelled', taskId }
    );
  }

  // Show call request notification
  async showCallRequestNotification(taskId: string): Promise<void> {
    await this.showNotification(
      'Customer Call Request',
      'A customer is trying to reach you.',
      { type: 'call_request', taskId }
    );
  }

  // Show admin message notification
  async showAdminMessageNotification(message: string): Promise<void> {
    await this.showNotification(
      'Message from Admin',
      message,
      { type: 'admin_message' }
    );
  }

  // Parse notification data
  parseNotificationData(notification: Notifications.Notification): {
    type: string;
    data: Record<string, any>;
  } {
    const data = notification.request.content.data || {};
    return {
      type: data.type || 'unknown',
      data,
    };
  }
}

export const notificationService = new NotificationService();
export default notificationService;
