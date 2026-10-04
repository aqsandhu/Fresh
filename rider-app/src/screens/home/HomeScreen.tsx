import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Linking,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import authService from '../../services/auth.service';
import { hasBackgroundLocationPermission } from '../../services/location.service';
import { useTaskStore } from '../../store/taskStore';
import { useLocationStore } from '../../store/locationStore';
import { useSettingsStore } from '../../store/settingsStore';
import StatusToggle from '../../components/StatusToggle';
import StatsCard from '../../components/StatsCard';
import TaskCard from '../../components/TaskCard';
import Button from '../../components/Button';
import LoadingSpinner from '../../components/LoadingSpinner';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../utils/constants';
import { getTranslation, formatCurrency } from '../../utils/helpers';
import { Task } from '../../types';

const BG_LOCATION_BANNER_KEY = 'fb_rider_bg_location_banner_dismissed';

interface DashboardScreenProps {
  navigation: any;
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({ navigation }) => {
  const [isToggling, setIsToggling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showBgLocationBanner, setShowBgLocationBanner] = useState(false);

  // One-time banner: background location denied but foreground granted —
  // tracking works while the app is open; nudge the rider to enable
  // "Allow all the time" for background delivery tracking.
  const checkBgLocationBanner = useCallback(async () => {
    try {
      const [bgGranted, dismissed] = await Promise.all([
        hasBackgroundLocationPermission(),
        AsyncStorage.getItem(BG_LOCATION_BANNER_KEY),
      ]);
      setShowBgLocationBanner(!bgGranted && dismissed !== 'yes');
    } catch {
      // non-fatal
    }
  }, []);

  const dismissBgLocationBanner = useCallback(async () => {
    setShowBgLocationBanner(false);
    try {
      await AsyncStorage.setItem(BG_LOCATION_BANNER_KEY, 'yes');
    } catch {
      // non-fatal
    }
  }, []);

  const { rider, isOnline, setOnline, setRider } = useAuthStore();
  const {
    activeTasks,
    todayStats,
    myStats,
    isLoading,
    fetchActiveTasks,
    fetchTodayStats,
    fetchMyStats,
    setCurrentTask,
  } = useTaskStore();
  const { startTracking, stopTracking, isTracking, requestPermissions } = useLocationStore();
  const { language } = useSettingsStore();

  // Load data on mount
  useEffect(() => {
    loadData();
    checkBgLocationBanner();
  }, []);

  const loadData = async () => {
    await Promise.all([fetchActiveTasks(), fetchTodayStats(), fetchMyStats()]);
    // Refresh the profile so stats (total deliveries, rating, online status)
    // reflect real backend values — best-effort.
    try {
      const profile = await authService.getProfile();
      setRider(profile);
      setOnline(profile.isOnline);
    } catch {
      // ignore — dashboard data already loaded
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  // Handle online/offline toggle — syncs with the backend and the auth store
  const handleStatusToggle = async () => {
    setIsToggling(true);

    try {
      if (!isOnline) {
        // Going online
        const hasPermission = await requestPermissions();
        if (!hasPermission) {
          Alert.alert(
            language === 'ur' ? 'اجازت درکار ہے' : 'Permission Required',
            language === 'ur'
              ? 'لوکیشن ٹریکنگ کے لیے اجازت درکار ہے'
              : 'Location permission is required for tracking',
            [{ text: 'OK' }]
          );
          setIsToggling(false);
          return;
        }

        // Tell the backend first so it can start assigning tasks
        await authService.updateOnlineStatus(true);

        // Start location tracking
        const trackingStarted = await startTracking(rider?.id || '');
        if (trackingStarted) {
          setOnline(true);
          checkBgLocationBanner();
        } else {
          // Roll back the backend status if tracking could not start
          authService.updateOnlineStatus(false).catch(() => {});
        }
      } else {
        // Going offline
        await authService.updateOnlineStatus(false);
        await stopTracking();
        setOnline(false);
      }
    } catch (error) {
      console.error('Error toggling status:', error);
      Alert.alert(
        language === 'ur' ? 'خرابی' : 'Error',
        language === 'ur'
          ? 'اسٹیٹس تبدیل نہیں ہو سکا'
          : 'Failed to update online status'
      );
    } finally {
      setIsToggling(false);
    }
  };

  // Handle task press — TaskDetail lives on the root stack
  const handleTaskPress = (task: Task) => {
    setCurrentTask(task);
    navigation.navigate('TaskDetail', { taskId: task.id });
  };

  // Handle view all tasks
  const handleViewTasks = () => {
    navigation.navigate('Tasks', { screen: 'TasksList' });
  };

  // Handle view stats
  const handleViewStats = () => {
    navigation.navigate('Profile', { screen: 'Earnings' });
  };

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return language === 'ur' ? 'صبح بخیر' : 'Good Morning';
    if (hour < 17) return language === 'ur' ? 'دوپہر بخیر' : 'Good Afternoon';
    return language === 'ur' ? 'شام بخیر' : 'Good Evening';
  };

  if (isLoading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner fullScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.riderName}>{rider?.name || 'Rider'}</Text>
        </View>
        <View style={styles.locationIndicator}>
          <MaterialCommunityIcons
            name={isTracking ? 'crosshairs-gps' : 'crosshairs'}
            size={20}
            color={isTracking ? COLORS.primary : COLORS.gray400}
          />
          <Text
            style={[
              styles.locationText,
              { color: isTracking ? COLORS.primary : COLORS.gray400 },
            ]}
          >
            {isTracking
              ? getTranslation('locationSharing', language)
              : language === 'ur'
              ? 'لوکیشن بند ہے'
              : 'Location off'}
          </Text>
        </View>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Status Toggle */}
        <StatusToggle
          isOnline={isOnline}
          onToggle={handleStatusToggle}
          isLoading={isToggling}
        />

        {/* Background location banner (one-time) */}
        {showBgLocationBanner && (
          <View style={styles.bgBanner}>
            <MaterialCommunityIcons name="map-marker-off-outline" size={20} color={COLORS.accent} />
            <Text style={styles.bgBannerText}>
              {language === 'ur'
                ? 'بیک گراؤنڈ لوکیشن بند ہے — ایپ بند ہونے پر ٹریکنگ رک جائے گی۔'
                : 'Background location is off — tracking pauses when the app is closed.'}
            </Text>
            <TouchableOpacity
              onPress={() => Linking.openSettings().catch(() => {})}
              style={styles.bgBannerButton}
            >
              <Text style={styles.bgBannerButtonText}>
                {language === 'ur' ? 'سیٹنگز' : 'Settings'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={dismissBgLocationBanner} hitSlop={8}>
              <MaterialCommunityIcons name="close" size={18} color={COLORS.gray500} />
            </TouchableOpacity>
          </View>
        )}

        {/* Today's Stats */}
        <View style={styles.section}>
          <StatsCard
            deliveries={todayStats?.totalDeliveries || 0}
            earnings={todayStats?.totalEarnings || 0}
            distance={todayStats?.totalDistance || 0}
            onlineHours={todayStats?.onlineHours}
          />
        </View>

        {/* Weekly / Monthly Stats */}
        {myStats && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { marginHorizontal: SPACING.md, marginBottom: SPACING.sm }]}>
              {language === 'ur' ? 'تفصیلی اعداد و شمار' : 'Detailed Stats'}
            </Text>
            <View style={styles.statsGrid}>
              {([
                [language === 'ur' ? 'اس ہفتے' : 'This Week', myStats.stats.thisWeek],
                [language === 'ur' ? 'پچھلے ہفتے' : 'Last Week', myStats.stats.lastWeek],
                [language === 'ur' ? 'اس مہینے' : 'This Month', myStats.stats.thisMonth],
                [language === 'ur' ? 'پچھلے مہینے' : 'Last Month', myStats.stats.lastMonth],
              ] as [string, { orders: number; earnings: number }][]).map(([label, data]) => (
                <View key={label} style={styles.statsItem}>
                  <Text style={styles.statsLabel}>{label}</Text>
                  <Text style={styles.statsOrderCount}>{data.orders}</Text>
                  <Text style={styles.statsEarnings}>{formatCurrency(data.earnings)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Payment Tracking */}
        {myStats && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { marginHorizontal: SPACING.md, marginBottom: SPACING.sm }]}>
              {language === 'ur' ? 'ادائیگی کی تفصیلات' : 'Payment Summary'}
            </Text>
            <View style={styles.paymentCard}>
              <View style={styles.paymentRow}>
                <View style={[styles.paymentItem, { backgroundColor: '#EBF5FF' }]}>
                  <MaterialCommunityIcons name="cash-multiple" size={20} color="#2563EB" />
                  <Text style={[styles.paymentLabel, { color: '#2563EB' }]}>
                    {language === 'ur' ? 'وصول شدہ' : 'Collected'}
                  </Text>
                  <Text style={[styles.paymentAmount, { color: '#1E40AF' }]}>
                    {formatCurrency(myStats.payment.totalCollected)}
                  </Text>
                </View>
                <View style={[styles.paymentItem, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialCommunityIcons name="wallet-outline" size={20} color="#059669" />
                  <Text style={[styles.paymentLabel, { color: '#059669' }]}>
                    {language === 'ur' ? 'کمائی' : 'Earned'}
                  </Text>
                  <Text style={[styles.paymentAmount, { color: '#065F46' }]}>
                    {formatCurrency(myStats.payment.totalEarned)}
                  </Text>
                </View>
              </View>
              <View style={[
                styles.pendingPayment,
                { backgroundColor: myStats.payment.paymentPending > 0 ? '#FEF2F2' : '#F9FAFB' },
              ]}>
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={20}
                  color={myStats.payment.paymentPending > 0 ? '#DC2626' : '#6B7280'}
                />
                <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                  <Text style={[
                    styles.paymentLabel,
                    { color: myStats.payment.paymentPending > 0 ? '#DC2626' : '#6B7280' },
                  ]}>
                    {language === 'ur' ? 'کمپنی کو واجب الادا' : 'Owes to Company'}
                  </Text>
                  <Text style={[
                    styles.paymentAmount,
                    { color: myStats.payment.paymentPending > 0 ? '#991B1B' : '#374151' },
                  ]}>
                    {formatCurrency(myStats.payment.paymentPending)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Active Tasks */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {getTranslation('activeTasks', language)}
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeTasks.length}</Text>
            </View>
          </View>

          {activeTasks.length > 0 ? (
            <>
              {activeTasks.slice(0, 2).map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onPress={handleTaskPress}
                  compact
                />
              ))}
              {activeTasks.length > 2 && (
                <Text style={styles.moreTasks}>
                  +{activeTasks.length - 2}{' '}
                  {language === 'ur' ? 'مزید کام' : 'more tasks'}
                </Text>
              )}
            </>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="package-variant-closed"
                size={48}
                color={COLORS.gray300}
              />
              <Text style={styles.emptyText}>
                {language === 'ur'
                  ? 'کوئی فعال کام نہیں'
                  : 'No active tasks'}
              </Text>
              <Text style={styles.emptySubtext}>
                {language === 'ur'
                  ? 'آن لائن ہونے پر کام ملیں گے'
                  : 'Tasks will appear when you go online'}
              </Text>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'ur' ? 'فوری عمل' : 'Quick Actions'}
          </Text>
          <View style={styles.actionsRow}>
            <Button
              title={getTranslation('viewTasks', language)}
              onPress={handleViewTasks}
              variant="primary"
              icon="format-list-bulleted"
              style={styles.actionButton}
            />
            <Button
              title={getTranslation('myStats', language)}
              onPress={handleViewStats}
              variant="secondary"
              icon="chart-bar"
              style={styles.actionButton}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  greeting: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  riderName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  locationIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  locationText: {
    fontSize: FONT_SIZES.xs,
    marginLeft: 4,
    fontWeight: '500',
  },
  scrollContent: {
    paddingVertical: SPACING.md,
  },
  section: {
    marginTop: SPACING.lg,
  },
  bgBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    padding: SPACING.sm,
    backgroundColor: `${COLORS.accent}15`,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: `${COLORS.accent}40`,
  },
  bgBannerText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textPrimary,
  },
  bgBannerButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.accent,
  },
  bgBannerButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.white,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  badge: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    marginLeft: SPACING.sm,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  moreTasks: {
    textAlign: 'center',
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    marginTop: SPACING.sm,
  },
  emptyState: {
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.gray50,
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginHorizontal: SPACING.md,
  },
  actionButton: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  statsItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  statsLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  statsOrderCount: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statsEarnings: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  paymentCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  paymentRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  paymentItem: {
    flex: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  paymentLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    marginTop: 4,
  },
  paymentAmount: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    marginTop: 2,
  },
  pendingPayment: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
});

export default DashboardScreen;
