import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store/authStore';
import { useTaskStore } from '../../store/taskStore';
import { useDutyStore } from '../../store/dutyStore';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useT } from '../../i18n';
import DutyCard from '../../components/DutyCard';
import TaskCard from '../../components/TaskCard';
import Button from '../../components/Button';
import { Banner, EmptyState, SectionTitle, StatTile } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { formatCurrency, getInitials, openNavigation } from '../../utils/helpers';
import { STORAGE_KEYS } from '../../utils/constants';
import type { RootStackParamList, Task } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const HomeScreen: React.FC = () => {
  const { t } = useT();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [bgBannerDismissed, setBgBannerDismissed] = useState(true);

  const rider = useAuthStore((s) => s.rider);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const { activeTasks, todayStats, myStats, refreshAll } = useTaskStore();
  const duty = useDutyStore();
  const { isOffline, pendingActions } = useOnlineStatus();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.BG_LOCATION_BANNER_DISMISSED)
      .then((v) => setBgBannerDismissed(v === 'yes'))
      .catch(() => setBgBannerDismissed(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshAll(), refreshProfile(), duty.refreshPermissions()]);
    setRefreshing(false);
  }, [refreshAll, refreshProfile, duty]);

  const dismissBgBanner = async () => {
    setBgBannerDismissed(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.BG_LOCATION_BANNER_DISMISSED, 'yes');
    } catch {
      /* non-fatal */
    }
  };

  const handleToggleDuty = async () => {
    if (duty.isOnDuty) {
      const goOff = async () => {
        await duty.goOffDuty();
        if (useDutyStore.getState().error) Alert.alert(t('common.error'), t('duty.toggleFailed'));
      };
      if (activeTasks.length > 0) {
        Alert.alert(t('duty.goOff'), t('profile.logoutConfirmBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('duty.goOff'), style: 'destructive', onPress: goOff },
        ]);
      } else {
        await goOff();
      }
      return;
    }
    const outcome = await duty.goOnDuty();
    if (outcome === 'permission_denied') {
      Alert.alert(t('duty.permissionTitle'), t('duty.permissionBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
      ]);
    } else if (outcome === 'error') {
      Alert.alert(t('common.error'), useDutyStore.getState().error || t('duty.toggleFailed'));
    }
  };

  const openTask = (task: Task) => navigation.navigate('TaskDetail', { taskId: task.id });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('home.greeting.morning') : hour < 17 ? t('home.greeting.afternoon') : t('home.greeting.evening');
  const nextTask = activeTasks[0] ?? null;
  const otherTasks = activeTasks.slice(1);
  const showBgBanner = duty.isOnDuty && duty.hasBackgroundPermission === false && !bgBannerDismissed;

  return (
    <View style={styles.container}>
      {/* Dark header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {rider?.name || t('home.rider')}
          </Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(rider?.name || 'R')}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {isOffline ? <Banner tone="warning" icon="wifi-off" message={t('common.offlineBanner')} style={styles.banner} /> : null}
        {pendingActions > 0 ? (
          <Banner tone="info" icon="cloud-sync-outline" message={t('common.pendingSync', { count: pendingActions })} style={styles.banner} />
        ) : null}
        {duty.error === 'permission_revoked' ? (
          <Banner tone="danger" icon="map-marker-off-outline" message={t('duty.permissionRevoked')} onDismiss={duty.clearError} style={styles.banner} />
        ) : null}

        <DutyCard
          isOnDuty={duty.isOnDuty}
          isSwitching={duty.isSwitching}
          isTracking={duty.isTracking}
          lastFix={duty.lastFix}
          lastSentAt={duty.lastSentAt}
          onToggle={handleToggleDuty}
        />

        {showBgBanner ? (
          <Banner
            tone="warning"
            icon="map-marker-alert-outline"
            title={t('duty.bgBannerTitle')}
            message={t('duty.bgBannerBody')}
            actionLabel={t('common.openSettings')}
            onAction={() => Linking.openSettings().catch(() => {})}
            onDismiss={dismissBgBanner}
            style={[styles.banner, { marginTop: spacing.md }]}
          />
        ) : null}

        {/* Today */}
        <View style={styles.section}>
          <SectionTitle title={t('home.today')} />
          <View style={styles.tiles}>
            <StatTile label={t('home.deliveries')} value={String(todayStats?.totalDeliveries ?? 0)} icon="package-variant-closed-check" tone="primary" />
            <StatTile label={t('home.earned')} value={formatCurrency(todayStats?.totalEarnings ?? 0)} icon="wallet-outline" tone="success" />
            <StatTile
              label={t('home.cashInHand')}
              value={formatCurrency(myStats?.payment.cashInHand ?? 0)}
              icon="cash"
              tone={(myStats?.payment.paymentPending ?? 0) > 0 ? 'warning' : 'neutral'}
              emphasis={(myStats?.payment.paymentPending ?? 0) > 0}
            />
          </View>
        </View>

        {/* Next task */}
        <View style={styles.section}>
          <SectionTitle
            title={t('home.nextTask')}
            count={activeTasks.length}
            actionLabel={activeTasks.length > 0 ? t('common.viewAll') : undefined}
            onAction={() => navigation.navigate('MainTabs', { screen: 'Tasks', params: { tab: 'active' } })}
          />
          {nextTask ? (
            <>
              <TaskCard task={nextTask} onPress={openTask} riderPoint={duty.lastFix} />
              <View style={styles.nextActions}>
                {nextTask.location ? (
                  <Button
                    title={t('home.navigate')}
                    icon="navigation-variant"
                    variant="dark"
                    onPress={() => openNavigation(nextTask.location!, nextTask.address)}
                    style={styles.nextButton}
                  />
                ) : null}
                <Button title={t('home.openTask')} icon="arrow-right" iconPosition="right" onPress={() => openTask(nextTask)} style={styles.nextButton} />
              </View>
            </>
          ) : (
            <EmptyState
              compact
              icon={duty.isOnDuty ? 'timer-sand' : 'power-standby'}
              title={t('home.noActiveTitle')}
              body={duty.isOnDuty ? t('home.noActiveBodyOn') : t('home.noActiveBodyOff')}
              style={styles.empty}
            />
          )}
        </View>

        {otherTasks.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title={t('home.activeTasks')} count={otherTasks.length} />
            {otherTasks.map((task) => (
              <TaskCard key={task.id} task={task} onPress={openTask} riderPoint={duty.lastFix} compact />
            ))}
          </View>
        ) : null}

        <View style={styles.footerNote}>
          <MaterialCommunityIcons name="shield-check-outline" size={14} color={colors.gray400} />
          <Text style={styles.footerNoteText}>Fresh Bazar Rider</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray900,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl + spacing.md,
  },
  headerText: { flex: 1 },
  greeting: { fontSize: typography.size.sm, color: colors.gray400 },
  name: { fontSize: typography.size.xxl, fontWeight: typography.weight.bold, color: colors.white, marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: typography.weight.bold, fontSize: typography.size.md },
  content: { paddingBottom: spacing.xxl, marginTop: -spacing.xl },
  banner: { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  section: { marginTop: spacing.xl, paddingHorizontal: 0 },
  tiles: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  nextActions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  nextButton: { flex: 1 },
  empty: { marginHorizontal: spacing.lg },
  footerNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: spacing.xxl },
  footerNoteText: { fontSize: typography.size.xs, color: colors.gray400 },
});


export default HomeScreen;
