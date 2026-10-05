import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTaskStore } from '../../store/taskStore';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';
import { ScreenHeader, Card, StatTile, SectionTitle, EmptyState, Banner } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../theme';
import { formatCurrency, formatDateTime } from '../../utils/helpers';
import type { RootStackParamList, Task, RiderStatsData } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Period = keyof RiderStatsData['stats'];
const PERIODS: Period[] = ['today', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth'];

const EarningsScreen: React.FC = () => {
  const { t } = useT();
  const navigation = useNavigation<Nav>();
  const [period, setPeriod] = useState<Period>('today');
  const [refreshing, setRefreshing] = useState(false);
  const { myStats, completedTasks, hasLoadedCompleted, fetchMyStats, fetchCompletedTasks } = useTaskStore();
  const rider = useAuthStore((s) => s.rider);

  const load = useCallback(async () => {
    await Promise.all([fetchMyStats(), fetchCompletedTasks()]);
  }, [fetchMyStats, fetchCompletedTasks]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const periodStats = myStats?.stats[period];
  const pay = myStats?.payment;
  const due = pay?.paymentPending ?? 0;

  const renderItem = ({ item }: { item: Task }) => (
    <TouchableOpacity style={styles.historyRow} onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })} activeOpacity={0.8}>
      <View style={styles.historyIcon}>
        <MaterialCommunityIcons name="check-decagram" size={20} color={colors.success} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.historyTitle}>#{item.orderNumber || item.attaRequestNumber || item.id.slice(0, 8)}</Text>
        <Text style={styles.historyMeta}>
          {formatDateTime(item.completedAt)}
          {item.codAmount ? `  ·  ${t('earnings.collectedAmount', { amount: formatCurrency(item.codAmount) })}` : ''}
        </Text>
      </View>
      <Text style={styles.historyAmount}>{item.riderCharge !== null && item.riderCharge !== undefined ? t('earnings.perDelivery', { amount: formatCurrency(item.riderCharge) }) : '—'}</Text>
    </TouchableOpacity>
  );

  const header = (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {PERIODS.map((p) => (
          <TouchableOpacity key={p} style={[styles.chip, period === p && styles.chipOn]} onPress={() => setPeriod(p)} accessibilityRole="tab" accessibilityState={{ selected: period === p }}>
            <Text style={[styles.chipText, period === p && styles.chipTextOn]}>{t(`earnings.period.${p}` as const)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.tiles}>
        <StatTile label={t('earnings.earned')} value={formatCurrency(periodStats?.earnings ?? 0)} icon="wallet-outline" tone="success" emphasis />
        <StatTile label={t('home.deliveries')} value={String(periodStats?.orders ?? 0)} icon="package-variant-closed-check" tone="primary" />
      </View>

      <View style={styles.block}>
        <SectionTitle title={t('earnings.cashTitle')} />
        <Card>
          <CashRow label={t('earnings.collected')} value={formatCurrency(pay?.totalCollected ?? 0)} />
          <CashRow label={t('earnings.earned')} value={`− ${formatCurrency(pay?.codEarned ?? 0)}`} />
          <CashRow label={t('earnings.settled')} value={`− ${formatCurrency(pay?.totalSettled ?? 0)}`} />
          <View style={styles.divider} />
          <CashRow label={t('earnings.cashInHand')} value={formatCurrency(pay?.cashInHand ?? 0)} bold />
          <View style={[styles.due, due > 0 ? styles.dueOn : styles.dueOff]}>
            <MaterialCommunityIcons name={due > 0 ? 'hand-coin-outline' : 'check-circle-outline'} size={28} color={due > 0 ? colors.warning : colors.success} />
            <View style={styles.flex}>
              <Text style={styles.dueLabel}>{t('earnings.dueToCompany')}</Text>
              <Text style={[styles.dueAmount, { color: due > 0 ? colors.text : colors.success }]}>{formatCurrency(due)}</Text>
              <Text style={styles.dueHint}>{due > 0 ? t('earnings.dueHint') : t('earnings.allSettled')}</Text>
            </View>
          </View>
        </Card>
      </View>

      <View style={styles.block}>
        <SectionTitle title={t('earnings.totalLifetime')} />
        <View style={styles.tiles}>
          <StatTile label={t('profile.totalEarned')} value={formatCurrency(pay?.totalEarned ?? rider?.totalEarnings ?? 0)} icon="trophy-outline" />
          <StatTile label={t('profile.totalDeliveries')} value={String(rider?.totalDeliveries ?? 0)} icon="motorbike" />
        </View>
      </View>

      <SectionTitle title={t('earnings.history')} count={completedTasks.length} style={styles.historyTitleRow} />
    </>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('earnings.title')} />
      {!myStats && hasLoadedCompleted ? <Banner tone="warning" icon="cloud-off-outline" message={t('common.networkError')} style={{ margin: spacing.lg }} /> : null}
      <FlatList
        data={completedTasks}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={hasLoadedCompleted ? <EmptyState compact icon="cash-remove" title={t('earnings.emptyTitle')} body={t('earnings.emptyBody')} style={{ marginHorizontal: spacing.lg }} /> : null}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const CashRow: React.FC<{ label: string; value: string; bold?: boolean }> = ({ label, value, bold }) => (
  <View style={styles.cashRow}>
    <Text style={[styles.cashLabel, bold && styles.cashBold]}>{label}</Text>
    <Text style={[styles.cashValue, bold && styles.cashBold]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  list: { paddingBottom: spacing.xxl },
  chips: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  chip: { paddingHorizontal: spacing.lg, height: 40, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.gray900, borderColor: colors.gray900 },
  chipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.textSecondary },
  chipTextOn: { color: colors.white },
  tiles: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  block: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  cashRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  cashLabel: { fontSize: typography.size.md, color: colors.textSecondary },
  cashValue: { fontSize: typography.size.md, color: colors.text, fontWeight: typography.weight.medium },
  cashBold: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  due: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md },
  dueOn: { backgroundColor: colors.warningSoft },
  dueOff: { backgroundColor: colors.successSoft },
  dueLabel: { fontSize: typography.size.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  dueAmount: { fontSize: typography.size.xxl, fontWeight: typography.weight.heavy },
  dueHint: { fontSize: typography.size.xs, color: colors.textSecondary, marginTop: 2 },
  historyTitleRow: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  historyIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  historyTitle: { fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text },
  historyMeta: { fontSize: typography.size.xs, color: colors.textMuted, marginTop: 2 },
  historyAmount: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.success },
});

export default EarningsScreen;
