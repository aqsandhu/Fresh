import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, toneColors, Tone } from '../../theme';

interface StatTileProps {
  label: string;
  value: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  tone?: Tone;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  emphasis?: boolean;
}

const StatTile: React.FC<StatTileProps> = ({ label, value, icon, tone = 'neutral', hint, style, emphasis }) => {
  const { fg, bg } = toneColors[tone];
  return (
    <View style={[styles.tile, emphasis && { backgroundColor: bg, borderColor: `${fg}33` }, style]}>
      <View style={styles.head}>
        {icon ? <MaterialCommunityIcons name={icon} size={16} color={fg} /> : null}
        <Text style={[styles.label, icon ? { marginLeft: 4 } : null]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.value, emphasis && { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? <Text style={styles.hint} numberOfLines={2}>{hint}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    minWidth: 100,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  value: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  hint: {
    marginTop: 2,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});

export default StatTile;
