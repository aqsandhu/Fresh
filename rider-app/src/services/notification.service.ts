import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { authService } from './auth.service';
import { NOTIFICATION_CHANNELS } from '../utils/constants';
import { useSettingsStore } from '../store/settingsStore';
import { t } from '../i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: useSettingsStore.getState().soundEnabled,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationTapData {
  type?: 'new_task' | 'task_cancelled' | 'chat' | string;
  taskId?: string;
  orderId?: string;
  orderNumber?: string;
}

class NotificationService {
  private isInitialized = false;

  /** Permissions + Android channels. Safe to call repeatedly. */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return false;
      if (Platform.OS === 'android') await this.setupChannels();
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('[Notifications] initialize:', error);
      return false;
    }
  }

  async hasPermission(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  private async setupChannels(): Promise<void> {
    const { vibrationEnabled } = useSettingsStore.getState();
    const vibrate = (pattern: number[]) => (vibrationEnabled ? pattern : [0]);
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.NEW_TASK, {
      name: 'New tasks',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: vibrate([0, 400, 200, 400]),
      lightColor: '#10B981',
      bypassDnd: true,
    });
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.TASK_UPDATE, {
      name: 'Task updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: vibrate([0, 250]),
      lightColor: '#F59E0B',
    });
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.CHAT, {
      name: 'Customer messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: vibrate([0, 150]),
      lightColor: '#2563EB',
    });
  }

  /** Re-create channels when sound/vibration preferences change. */
  async refreshChannels(): Promise<void> {
    if (Platform.OS === 'android') await this.setupChannels().catch(() => {});
  }

  async getPushToken(): Promise<string | null> {
    try {
      if (!Device.isDevice) return null;
      const projectId: string | undefined = (Constants.expoConfig as any)?.extra?.eas?.projectId;
      const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
      return token || null;
    } catch (error) {
      console.warn('[Notifications] push token unavailable:', error);
      return null;
    }
  }

  async registerPushToken(): Promise<void> {
    try {
      const token = await this.getPushToken();
      if (token) await authService.registerPushToken(token);
    } catch (error) {
      console.warn('[Notifications] register token failed:', error);
    }
  }

  /** Permissions → channels → token upload → listeners. Call after sign-in / hydrate. */
  async bootstrap(onTap: (data: NotificationTapData) => void): Promise<() => void> {
    const ok = await this.initialize();
    if (!ok) return () => {};
    this.registerPushToken().catch(() => {});
    return this.addTapListener(onTap);
  }

  addTapListener(handler: (data: NotificationTapData) => void): () => void {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data && typeof data === 'object') handler(data as NotificationTapData);
    });
    // Cold start from a tapped notification.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const data = response?.notification?.request?.content?.data;
        if (data && typeof data === 'object') handler(data as NotificationTapData);
      })
      .catch(() => {});
    return () => sub.remove();
  }

  private async show(
    title: string,
    body: string,
    data: NotificationTapData,
    channelId: string
  ): Promise<void> {
    if (!useSettingsStore.getState().notificationsEnabled) return;
    if (!(await this.initialize())) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: useSettingsStore.getState().soundEnabled ? 'default' : undefined,
        ...(Platform.OS === 'android' ? { channelId } : {}),
      } as Notifications.NotificationContentInput,
      trigger: null,
    });
  }

  notifyNewTask(d: { orderId?: string; orderNumber?: string; taskId?: string }): Promise<void> {
    return this.show(
      t('notif.newTaskTitle'),
      t('notif.newTaskBody', { orderNumber: d.orderNumber || '—' }),
      { type: 'new_task', ...d },
      NOTIFICATION_CHANNELS.NEW_TASK
    );
  }

  notifyTaskCancelled(d: { orderId?: string; orderNumber?: string; taskId?: string }): Promise<void> {
    return this.show(
      t('notif.taskCancelledTitle'),
      t('notif.taskCancelledBody', { orderNumber: d.orderNumber || '—' }),
      { type: 'task_cancelled', ...d },
      NOTIFICATION_CHANNELS.TASK_UPDATE
    );
  }

  notifyChat(d: { orderId?: string; senderName?: string; message?: string }): Promise<void> {
    return this.show(
      d.senderName ? `${t('notif.chatTitle')} · ${d.senderName}` : t('notif.chatTitle'),
      d.message || '',
      { type: 'chat', orderId: d.orderId },
      NOTIFICATION_CHANNELS.CHAT
    );
  }

  async clearBadge(): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch {
      /* ignore */
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
