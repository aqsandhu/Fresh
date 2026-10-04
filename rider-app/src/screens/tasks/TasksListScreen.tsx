import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTaskStore } from '../../store/taskStore';
import { useDutyStore } from '../../store/dutyStore';
import { useT } from '../../i18n';
import TaskCard from '../../components/TaskCard';
import { ScreenHeader, SegmentedControl, EmptyState, Banner, Skeleton } from '../../components/ui';
import { colors, spacing } from '../../theme';
import type { MainTabParamList, RootStackParamList, Task } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'active' | 'completed';

const ListSkeleton = () => (
  <View style={styles.skeletonWrap}>
    {[0, 1, 2].map((i) => (
      <View key={i} style={styles.skeletonCard}>
        <Skeleton width="55%" height={18} />
        <Skeleton width="85%" height={14} style={{ marginTop: spacing.md }} />
        <Skeleton width="40%" height={14} style={{ marginTop: spacing.sm }} />
      </View>
    ))}
  </View>
);

const TasksListScreen: React.FC = () => {
  const { t } = useT();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<MainTabParamList, 'Tasks'>>();
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'active');
  const [refreshing, setRefreshing] = useState(false);

  const {
    activeTasks,
    completedTasks,
    isLoadingActive,
    isLoadingCompleted,
    hasLoadedActive,
    hasLoadedCompleted,
    lastError,
    fetchActiveTasks,
    fetchCompletedTasks,
    clearError,
  } = useTaskStore();
  const lastFix = useDutyStore((s) => s.lastFix);

  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);

  useEffect(() => {
    if (tab === 'completed' && !hasLoadedCompleted) fetchCompletedTasks();
  }, [tab, hasLoadedCompleted, fetchCompletedTasks]);

  const load = useCallback(async () => {
    await Promise.all([fetchActiveTasks(), fetchCompletedTasks()]);
  }, [fetchActiveTasks, fetchCompletedTasks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const data = tab === 'active' ? activeTasks : completedTasks;
  const initialLoading = tab === 'active' ? isLoadingActive && !hasLoadedActive : isLoadingCompleted && !hasLoadedCompleted;

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('tasks.title')} />
      <View style={styles.segmentWrap}>
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          segments={[
            { value: 'active', label: t('tasks.active'), count: activeTasks.length },
            { value: 'completed', label: t('tasks.completed') },
          ]}
        />
      </View>

      {lastError ? (
        <Banner tone="danger" icon="alert-circle-outline" message={lastError} actionLabel={t('common.retry')} onAction={() => { clearError(); load(); }} onDismiss={clearError} style={styles.banner} />
      ) : null}

      {initialLoading ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: { item: Task }) => (
            <TaskCard task={item} riderPoint={lastFix} onPress={(task) => navigation.navigate('TaskDetail', { taskId: task.id })} />
          )}
          contentContainerStyle={[styles.list, data.length === 0 && styles.listEmpty]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            tab === 'active' ? (
              <EmptyState icon="clipboard-text-outline" title={t('tasks.emptyActiveTitle')} body={t('tasks.emptyActiveBody')} />
            ) : (
              <EmptyState icon="check-decagram-outline" title={t('tasks.emptyCompletedTitle')} body={t('tasks.emptyCompletedBody')} />
            )
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  segmentWrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  banner: { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  list: { paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  skeletonWrap: { paddingHorizontal: spacing.lg },
  skeletonCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
});

export default TasksListScreen;
