import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../../theme';

interface EmptyStateProps {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, body, action, style, compact }) => (
  <View style={[styles.container, compact && styles.compact, style]}>
    <View style={styles.iconWrap}>
      <MaterialCommunityIcons name={icon} size={compact ? 30 : 40} color={colors.gray400} />
    </View>
    <Text style={styles.title}>{title}</Text>
    {body ? <Text style={styles.body}>{body}</Text> : null}
    {action ? <View style={styles.action}>{action}</View> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  compact: {
    paddingVertical: spacing.xl,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  body: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  action: { marginTop: spacing.lg },
});

export default EmptyState;
