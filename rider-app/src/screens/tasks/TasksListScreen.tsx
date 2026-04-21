import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTasks } from '../../hooks/useTasks';
import { useSettingsStore } from '../../store/settingsStore';
import TaskCard from '../../components/TaskCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../utils/constants';
import { Task } from '../../types';

interface TasksListScreenProps {
  navigation: any;
}

const TasksListScreen: React.FC<TasksListScreenProps> = ({ navigation }) => {
  const {
    activeTasks,
    completedTasks,
    isLoading,
    activeTab,
    setActiveTab,
    fetchActiveTasks,
    fetchCompletedTasks,
    setCurrentTask,
  } = useTasks();

  const { language } = useSettingsStore();
  const [refreshing, setRefreshing] = React.useState(false);

  // Load tasks on mount
  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    await Promise.all([fetchActiveTasks(), fetchCompletedTasks()]);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  }, []);

  // Handle task press
  const handleTaskPress = (task: Task) => {
    setCurrentTask(task);
    navigation.navigate('TaskDetail', { taskId: task.id });
  };

  // Get tasks based on active tab
  const getTasks = () => {
    return activeTab === 'active' ? activeTasks : completedTasks;
  };

  // Render task item
  const renderTask = ({ item }: { item: Task }) => (
    <TaskCard task={item} onPress={handleTaskPress} />
  );

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons
        name={activeTab === 'active' ? 'package-variant-closed' : 'check-circle'}
        size={64}
        color={COLORS.gray300}
      />
      <Text style={styles.emptyTitle}>
        {activeTab === 'active'
          ? language === 'ur'
            ? 'کوئی فعال کام نہیں'
            : 'No Active Tasks'
          : language === 'ur'
          ? 'کوئی مکمل کام نہیں'
          : 'No Completed Tasks'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === 'active'
          ? language === 'ur'
            ? 'آن لائن ہونے پر کام ملیں گے'
            : 'Tasks will appear when you go online'
          : language === 'ur'
          ? 'مکمل کردہ کام یہاں نظر آئیں گے'
          : 'Completed tasks will appear here'}
      </Text>
    </View>
  );

  if (isLoading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner
          message={language === 'ur' ? 'کام لوڈ ہو رہے ہیں...' : 'Loading tasks...'}
          fullScreen
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {language === 'ur' ? 'کام' : 'Tasks'}
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'active' && styles.activeTab]}
          onPress={() => setActiveTab('active')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="package-variant"
            size={18}
            color={activeTab === 'active' ? COLORS.primary : COLORS.gray500}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'active' && styles.activeTabText,
            ]}
          >
            {language === 'ur' ? 'فعال' : 'Active'}
          </Text>
          {activeTasks.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{activeTasks.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
          onPress={() => setActiveTab('completed')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="check-circle"
            size={18}
            color={activeTab === 'completed' ? COLORS.primary : COLORS.gray500}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'completed' && styles.activeTabText,
            ]}
          >
            {language === 'ur' ? 'مکمل' : 'Completed'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Task List */}
      <FlatList
        data={getTasks()}
        renderItem={renderTask}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  tabsContainer: {
    flexDirection: 'row',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.xs,
  },
  activeTab: {
    backgroundColor: `${COLORS.primary}15`,
  },
  tabText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.gray500,
  },
  activeTabText: {
    color: COLORS.primary,
  },
  tabBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: SPACING.xs,
  },
  tabBadgeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: SPACING.lg,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
    marginTop: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
});

export default TasksListScreen;
