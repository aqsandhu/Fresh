import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList, Notification, NotificationType } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { formatDateTime, getRelativeTime } from '@utils/helpers';
import { EmptyState, ErrorView, LoadingOverlay } from '@components';
import { useNotificationStore } from '@store';
import { notificationService } from '@services/notification.service';

const getNotificationIcon = (type: NotificationType): string => {
  switch (type) {
    case 'order_update':
      return 'shopping-bag';
    case 'rider_arrived':
      return 'delivery-dining';
    case 'promotion':
      return 'local-offer';
    case 'atta_update':
      return 'grain';
    default:
      return 'notifications';
  }
};

const getNotificationColor = (type: NotificationType): string => {
  switch (type) {
    case 'order_update':
      return COLORS.primary;
    case 'rider_arrived':
      return COLORS.success;
    case 'promotion':
      return COLORS.secondary;
    case 'atta_update':
      return COLORS.atta;
    default:
      return COLORS.gray500;
  }
};

export const NotificationsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { 
    notifications, 
    unreadCount, 
    isLoading, 
    loadNotifications, 
    markAsRead, 
    markAllAsRead,
    deleteNotification 
  } = useNotificationStore();
  
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadNotifications();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;
    
    Alert.alert(
      'Mark All as Read',
      'Are you sure you want to mark all notifications as read?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Mark All', 
          onPress: async () => {
            await markAllAsRead();
          }
        },
      ]
    );
  };

  const handleDelete = async (id: string) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            setDeletingId(id);
            try {
              await deleteNotification(id);
            } finally {
              setDeletingId(null);
            }
          }
        },
      ]
    );
  };

  const handleNotificationPress = async (notification: Notification) => {
    // Mark as read
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }

    // Navigate based on notification type
    if (notification.data?.orderId) {
      // Navigate to order detail
      // navigation.navigate('OrderDetail', { orderId: notification.data.orderId });
    } else if (notification.data?.requestId) {
      // Navigate to atta tracking
      // navigation.navigate('AttaTracking', { requestId: notification.data.requestId });
    }
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const icon = getNotificationIcon(item.type);
    const color = getNotificationColor(item.type);
    const isDeleting = deletingId === item.id;

    return (
      <TouchableOpacity
        style={[
          styles.notificationCard,
          !item.isRead && styles.unreadCard,
        ]}
        onPress={() => handleNotificationPress(item)}
        disabled={isDeleting}
      >
        <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
          <MaterialIcons name={icon as any} size={24} color={color} />
        </View>
        
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, !item.isRead && styles.unreadTitle]}>
              {item.title}
            </Text>
            {!item.isRead && <View style={styles.unreadDot} />}
          </View>
          
          <Text style={styles.message} numberOfLines={2}>
            {item.message}
          </Text>
          
          <Text style={styles.time}>
            {getRelativeTime(item.createdAt)}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item.id)}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <MaterialIcons name="hourglass-empty" size={20} color={COLORS.gray400} />
          ) : (
            <MaterialIcons name="delete-outline" size={20} color={COLORS.error} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity 
          onPress={handleMarkAllAsRead}
          disabled={unreadCount === 0}
        >
          <MaterialIcons 
            name="done-all" 
            size={24} 
            color={unreadCount > 0 ? COLORS.primary : COLORS.gray400} 
          />
        </TouchableOpacity>
      </View>

      {/* Unread Count Badge */}
      {unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>
            {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {notifications.length === 0 && !isLoading ? (
        <EmptyState
          icon="notifications-none"
          title="No notifications"
          message="You're all caught up! Check back later for updates."
        />
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  unreadBadge: {
    backgroundColor: COLORS.primaryLighter,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  unreadBadgeText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  list: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  unreadCard: {
    backgroundColor: COLORS.primaryLighter,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.gray700,
    flex: 1,
  },
  unreadTitle: {
    color: COLORS.gray900,
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginLeft: SPACING.xs,
  },
  message: {
    fontSize: 13,
    color: COLORS.gray600,
    lineHeight: 18,
    marginBottom: SPACING.xs,
  },
  time: {
    fontSize: 12,
    color: COLORS.gray400,
  },
  deleteButton: {
    padding: SPACING.xs,
    marginLeft: SPACING.sm,
  },
});

export default NotificationsScreen;
