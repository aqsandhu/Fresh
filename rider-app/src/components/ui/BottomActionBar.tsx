import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, shadow } from '../../theme';

interface BottomActionBarProps {
  children: React.ReactNode;
}

/** Sticky, safe-area aware action container for the primary task actions. */
const BottomActionBar: React.FC<BottomActionBarProps> = ({ children }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {children}
    </View>
  );
};

/** Height callers should add as bottom padding so content scrolls above the bar. */
export const BOTTOM_BAR_CONTENT_PADDING = 140;

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
    ...shadow.raised,
  },
});

export default BottomActionBar;
