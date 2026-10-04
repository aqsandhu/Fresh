import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { colors, spacing, typography, HIT_SLOP } from '../../theme';

interface SectionTitleProps {
  title: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

const SectionTitle: React.FC<SectionTitleProps> = ({ title, count, actionLabel, onAction, style }) => (
  <View style={[styles.row, style]}>
    <Text style={styles.title}>
      {title}
      {typeof count === 'number' ? <Text style={styles.count}>  {count}</Text> : null}
    </Text>
    {actionLabel && onAction ? (
      <TouchableOpacity onPress={onAction} hitSlop={HIT_SLOP}>
        <Text style={styles.action}>{actionLabel}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  count: {
    color: colors.primaryDark,
  },
  action: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primaryDark,
  },
});

export default SectionTitle;
