import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useNotificationStore, useCartUiStore } from '@store';
import { navigationRef } from '@/navigation/navigationUtils';

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

/**
 * Header notification bell — opens an in-place DROPDOWN panel (mirrors the
 * website NotificationBell). It does NOT navigate to a separate screen, so
 * closing keeps the shopper exactly where they were.
 */
export const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, isLoading, loadNotifications, markAsRead, markAllAsRead } =
    useNotificationStore();
  // Measured bottom of the sticky header → the panel hangs flush from the
  // navbar (not floating detached in the middle of the screen).
  const headerBottom = useCartUiStore((s) => s.mobileHeaderBottomY);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) loadNotifications();
  }, [open, loadNotifications]);

  const openTracking = (n: (typeof notifications)[number]) => {
    markAsRead(n.id);
    setOpen(false);
    const orderId = (n.data?.orderId || n.data?.order_id) as string | undefined;
    if (!navigationRef.isReady()) return;
    if (orderId) {
      (navigationRef as any).navigate('Main', {
        screen: 'Orders',
        params: { screen: 'TrackOrder', params: { orderId } },
      });
    } else {
      (navigationRef as any).navigate('Main', {
        screen: 'Orders',
        params: { screen: 'OrdersList' },
      });
    }
  };

  const viewAllOrders = () => {
    setOpen(false);
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('Main', { screen: 'Orders', params: { screen: 'OrdersList' } });
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => setOpen(true)}
        accessibilityLabel="Notifications"
      >
        <MaterialIcons name="notifications-none" size={22} color={COLORS.gray600} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.panel, { marginTop: headerBottom > 0 ? headerBottom - 1 : 88 }]}
            onPress={() => {}}
          >
            {/* Header */}
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>Notifications</Text>
                {unreadCount > 0 && <Text style={styles.panelSub}>{unreadCount} unread</Text>}
              </View>
              {unreadCount > 0 && (
                <TouchableOpacity style={styles.markAll} onPress={() => markAllAsRead()}>
                  <MaterialIcons name="done-all" size={15} color={COLORS.primary600} />
                  <Text style={styles.markAllText}>Mark all read</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* List */}
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {isLoading && notifications.length === 0 ? (
                <View style={styles.empty}>
                  <ActivityIndicator color={COLORS.primary500} />
                </View>
              ) : notifications.length === 0 ? (
                <View style={styles.empty}>
                  <MaterialIcons name="notifications-none" size={32} color={COLORS.gray300} />
                  <Text style={styles.emptyText}>No notifications yet</Text>
                </View>
              ) : (
                notifications.map((n) => (
                  <TouchableOpacity
                    key={n.id}
                    style={[styles.row, !n.isRead && styles.rowUnread]}
                    onPress={() => openTracking(n)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowIcon}>
                      <MaterialIcons name="inventory-2" size={16} color={COLORS.primary600} />
                    </View>
                    <View style={styles.rowBody}>
                      <View style={styles.rowTop}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {n.title}
                        </Text>
                        {!n.isRead && <View style={styles.dot} />}
                      </View>
                      <Text style={styles.rowMsg} numberOfLines={2}>
                        {n.message}
                      </Text>
                      <Text style={styles.rowTime}>{formatWhen(n.createdAt)}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            {notifications.length > 0 && (
              <TouchableOpacity style={styles.footer} onPress={viewAllOrders}>
                <Text style={styles.footerText}>View all orders</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  iconBtn: { padding: 8, position: 'relative' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: COLORS.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { color: COLORS.white, fontSize: 9, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: SPACING.sm },
  panel: {
    alignSelf: 'flex-end',
    width: '100%',
    maxWidth: 360,
    maxHeight: '75%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
    backgroundColor: COLORS.gray50,
  },
  panelTitle: { fontSize: 14, fontWeight: '700', color: COLORS.gray900 },
  panelSub: { fontSize: 11, color: COLORS.gray500, marginTop: 1 },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  markAllText: { fontSize: 12, fontWeight: '600', color: COLORS.primary600 },
  list: { maxHeight: 340 },
  empty: { alignItems: 'center', paddingVertical: SPACING.xl, gap: 6 },
  emptyText: { fontSize: 13, color: COLORS.gray500 },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray50,
  },
  rowUnread: { backgroundColor: 'rgba(34,197,94,0.06)' },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  rowTitle: { flex: 1, fontSize: 13.5, fontWeight: '600', color: COLORS.gray900 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary500 },
  rowMsg: { fontSize: 12, color: COLORS.gray600, marginTop: 2, lineHeight: 16 },
  rowTime: { fontSize: 10, color: COLORS.gray400, marginTop: 3 },
  footer: {
    paddingVertical: SPACING.sm + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
    backgroundColor: COLORS.gray50,
    alignItems: 'center',
  },
  footerText: { fontSize: 12, fontWeight: '600', color: COLORS.primary600 },
});

export default NotificationBell;
