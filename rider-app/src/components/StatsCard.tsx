import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../utils/constants';
import { formatCurrency, formatDistance } from '../utils/helpers';
import { useSettingsStore } from '../store/settingsStore';

interface StatItemProps {
  icon: string;
  value: string | number;
  label: string;
  color: string;
}

const StatItem: React.FC<StatItemProps> = ({ icon, value, label, color }) => (
  <View style={styles.statItem}>
    <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
      <MaterialCommunityIcons name={icon as any} size={24} color={color} />
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

interface StatsCardProps {
  deliveries: number;
  earnings: number;
  distance: number;
  onlineHours?: number;
  compact?: boolean;
}

const StatsCard: React.FC<StatsCardProps> = ({
  deliveries,
  earnings,
  distance,
  onlineHours,
  compact = false,
}) => {
  const { language } = useSettingsStore();

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactRow}>
          <View style={styles.compactItem}>
            <MaterialCommunityIcons name="package-variant" size={18} color={COLORS.primary} />
            <Text style={styles.compactValue}>{deliveries}</Text>
          </View>
          <View style={styles.compactDivider} />
          <View style={styles.compactItem}>
            <MaterialCommunityIcons name="cash" size={18} color={COLORS.success} />
            <Text style={styles.compactValue}>{formatCurrency(earnings)}</Text>
          </View>
          <View style={styles.compactDivider} />
          <View style={styles.compactItem}>
            <MaterialCommunityIcons name="map-marker-distance" size={18} color={COLORS.secondary} />
            <Text style={styles.compactValue}>{formatDistance(distance)}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {language === 'ur' ? 'آج کے اعداد و شمار' : "Today's Stats"}
      </Text>
      <View style={styles.statsGrid}>
        <StatItem
          icon="package-variant"
          value={deliveries}
          label={language === 'ur' ? 'ڈیلیوریز' : 'Deliveries'}
          color={COLORS.primary}
        />
        <StatItem
          icon="cash"
          value={formatCurrency(earnings)}
          label={language === 'ur' ? 'کمائی' : 'Earnings'}
          color={COLORS.success}
        />
        <StatItem
          icon="map-marker-distance"
          value={formatDistance(distance)}
          label={language === 'ur' ? 'فاصلہ' : 'Distance'}
          color={COLORS.secondary}
        />
        {onlineHours !== undefined && (
          <StatItem
            icon="clock-outline"
            value={`${onlineHours}h`}
            label={language === 'ur' ? 'آن لائن گھنٹے' : 'Online Hours'}
            color={COLORS.accent}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  compactContainer: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 70,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  compactRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  compactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  compactValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  compactDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },
});

export default StatsCard;
