import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, toneColors, Tone, HIT_SLOP } from '../../theme';

interface BannerProps {
  tone?: Tone;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Inline, non-blocking notice (offline, pending sync, permission nudges). */
const Banner: React.FC<BannerProps> = ({ tone = 'info', icon, title, message, actionLabel, onAction, onDismiss, style }) => {
  const { fg, bg } = toneColors[tone];
  return (
    <View style={[styles.container, { backgroundColor: bg, borderColor: `${fg}33` }, style]} accessibilityRole="alert">
      {icon ? <MaterialCommunityIcons name={icon} size={20} color={fg} style={styles.icon} /> : null}
      <View style={styles.body}>
        {title ? <Text style={[styles.title, { color: fg }]}>{title}</Text> : null}
        <Text style={styles.message}>{message}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity onPress={onAction} hitSlop={HIT_SLOP} style={styles.actionWrap}>
            <Text style={[styles.action, { color: fg }]}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {onDismiss ? (
        <TouchableOpacity onPress={onDismiss} hitSlop={HIT_SLOP} accessibilityLabel="Dismiss">
          <MaterialCommunityIcons name="close" size={18} color={colors.gray500} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  icon: { marginRight: spacing.sm, marginTop: 1 },
  body: { flex: 1 },
  title: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    marginBottom: 2,
  },
  message: {
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  actionWrap: { marginTop: spacing.xs, alignSelf: 'flex-start' },
  action: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    textDecorationLine: 'underline',
  },
});

export default Banner;
