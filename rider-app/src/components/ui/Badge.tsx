import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { radius, spacing, typography, toneColors, Tone } from '../../theme';

interface BadgeProps {
  label: string;
  tone?: Tone;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

const Badge: React.FC<BadgeProps> = ({ label, tone = 'neutral', icon, size = 'md', style }) => {
  const { fg, bg } = toneColors[tone];
  const fontSize = size === 'sm' ? typography.size.xs : size === 'lg' ? typography.size.md : typography.size.sm;
  const iconSize = size === 'sm' ? 12 : size === 'lg' ? 18 : 14;
  return (
    <View style={[styles.badge, { backgroundColor: bg }, size === 'lg' && styles.lg, style]}>
      {icon ? <MaterialCommunityIcons name={icon} size={iconSize} color={fg} style={styles.icon} /> : null}
      <Text style={[styles.text, { color: fg, fontSize }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  lg: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  icon: { marginRight: 4 },
  text: {
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.2,
  },
});

export default Badge;
