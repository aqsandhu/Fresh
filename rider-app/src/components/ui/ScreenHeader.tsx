import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, TOUCH_TARGET, HIT_SLOP } from '../../theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  /** Dark header (used on Home) vs. light header (inner screens). */
  variant?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, subtitle, onBack, right, variant = 'light', style }) => {
  const insets = useSafeAreaInsets();
  const dark = variant === 'dark';
  const fg = dark ? colors.textInverse : colors.text;
  return (
    <View
      style={[
        styles.container,
        dark ? styles.dark : styles.light,
        { paddingTop: insets.top + spacing.sm },
        style,
      ]}
    >
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          hitSlop={HIT_SLOP}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <MaterialCommunityIcons name="arrow-left" size={26} color={fg} />
        </TouchableOpacity>
      ) : null}
      <View style={styles.titles}>
        <Text style={[styles.title, { color: fg }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: dark ? colors.gray300 : colors.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    minHeight: TOUCH_TARGET,
  },
  light: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dark: {
    backgroundColor: colors.gray900,
  },
  backButton: {
    width: TOUCH_TARGET - 8,
    height: TOUCH_TARGET - 8,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    marginRight: spacing.xs,
  },
  titles: { flex: 1 },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  subtitle: {
    fontSize: typography.size.sm,
    marginTop: 2,
  },
  right: { marginLeft: spacing.sm },
});

export default ScreenHeader;
