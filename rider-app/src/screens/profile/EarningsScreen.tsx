import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTaskStore } from '../../store/taskStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../utils/constants';
import { formatCurrency, formatDate, getTranslation } from '../../utils/helpers';
import { Earning } from '../../types';

interface EarningsScreenProps {
  navigation: any;
}

const EarningsScreen: React.FC<EarningsScreenProps> = ({ navigation }) => {
  const { earnings, fetchEarnings, todayStats } = useTaskStore();
  const { language } = useSettingsStore();
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    total: 0,
  });

  // Load earnings on mount
  useEffect(() => {
    loadEarnings();
  }, []);

  const loadEarnings = async () => {
    // Get last 30 days of earnings
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    await fetchEarnings(startDate, endDate);
    calculateSummary();
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEarnings();
    setRefreshing(false);
  }, []);

  // Calculate summary from earnings
  const calculateSummary = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const todayEarnings = earnings
      .filter((e) => e.date === today)
      .reduce((sum, e) => sum + e.amount, 0);

    const weekEarnings = earnings
      .filter((e) => e.date >= weekAgo)
      .reduce((sum, e) => sum + e.amount, 0);

    const monthEarnings = earnings
      .filter((e) => e.date >= monthAgo)
      .reduce((sum, e) => sum + e.amount, 0);

    const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);

    setSummary({
      today: todayEarnings,
      thisWeek: weekEarnings,
      thisMonth: monthEarnings,
      total: totalEarnings,
    });
  };

  // Get earning type icon
  const getEarningTypeIcon = (type: string) => {
    switch (type) {
      case 'delivery':
        return 'truck-delivery';
      case 'bonus':
        return 'gift';
      case 'tip':
        return 'cash';
      default:
        return 'cash';
    }
  };

  // Get earning type color
  const getEarningTypeColor = (type: string) => {
    switch (type) {
      case 'delivery':
        return COLORS.primary;
      case 'bonus':
        return COLORS.accent;
      case 'tip':
        return COLORS.success;
      default:
        return COLORS.gray500;
    }
  };

  // Render earning item
  const renderEarningItem = ({ item }: { item: Earning }) => (
    <View style={styles.earningItem}>
      <View
        style={[
          styles.earningIcon,
          { backgroundColor: `${getEarningTypeColor(item.type)}15` },
        ]}
      >
        <MaterialCommunityIcons
          name={getEarningTypeIcon(item.type) as any}
          size={20}
          color={getEarningTypeColor(item.type)}
        />
      </View>
      <View style={styles.earningContent}>
        <Text style={styles.earningDescription}>{item.description}</Text>
        <Text style={styles.earningDate}>{formatDate(item.date)}</Text>
      </View>
      <Text style={styles.earningAmount}>+{formatCurrency(item.amount)}</Text>
    </View>
  );

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="cash-remove" size={64} color={COLORS.gray300} />
      <Text style={styles.emptyTitle}>
        {language === 'ur' ? 'کوئی کمائی نہیں' : 'No Earnings Yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {language === 'ur'
          ? 'ڈیلیوری مکمل کرنے پر کمائی ظاہر ہوگی'
          : 'Earnings will appear after completing deliveries'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <MaterialCommunityIcons
          name="arrow-left"
          size={24}
          color={COLORS.textPrimary}
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.headerTitle}>
          {language === 'ur' ? 'میری کمائی' : 'My Earnings'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        ListHeaderComponent={
          <>
            {/* Summary Cards */}
            <View style={styles.summaryContainer}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>
                  {language === 'ur' ? 'آج' : 'Today'}
                </Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(summary.today)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>
                  {language === 'ur' ? 'اس ہفتے' : 'This Week'}
                </Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(summary.thisWeek)}
                </Text>
              </View>
            </View>

            <View style={styles.summaryContainer}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>
                  {language === 'ur' ? 'اس مہینے' : 'This Month'}
                </Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(summary.thisMonth)}
                </Text>
              </View>
              <View style={[styles.summaryCard, styles.totalCard]}>
                <Text style={[styles.summaryLabel, styles.totalLabel]}>
                  {language === 'ur' ? 'کل' : 'Total'}
                </Text>
                <Text style={[styles.summaryValue, styles.totalValue]}>
                  {formatCurrency(summary.total)}
                </Text>
              </View>
            </View>

            {/* Section Title */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {language === 'ur' ? 'تفصیلات' : 'Details'}
              </Text>
            </View>
          </>
        }
        data={earnings}
        renderItem={renderEarningItem}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  totalCard: {
    backgroundColor: COLORS.primary,
  },
  summaryLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  totalLabel: {
    color: `${COLORS.white}80`,
  },
  summaryValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  totalValue: {
    color: COLORS.white,
  },
  sectionHeader: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  listContent: {
    paddingBottom: SPACING.xl,
  },
  earningItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  earningIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  earningContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  earningDescription: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  earningDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  earningAmount: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.success,
  },
  emptyState: {
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

export default EarningsScreen;
