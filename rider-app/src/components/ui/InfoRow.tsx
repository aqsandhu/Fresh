import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';

interface InfoRowProps {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor?: string;
  label?: string;
  value: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Icon + label + value row used inside cards. */
const InfoRow: React.FC<InfoRowProps> = ({ icon, iconColor = colors.gray500, label, value, right, style }) => (
  <View style={[styles.row, style]}>
    {icon ? <MaterialCommunityIcons name={icon} size={20} color={iconColor} style={styles.icon} /> : null}
    <View style={styles.body}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {typeof value === 'string' ? <Text style={styles.value}>{value}</Text> : value}
    </View>
    {right ? <View style={styles.right}>{right}</View> : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  icon: { marginRight: spacing.md, marginTop: 1 },
  body: { flex: 1 },
  label: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    fontSize: typography.size.md,
    color: colors.text,
    lineHeight: typography.size.md * typography.lineHeight.normal,
  },
  right: { marginLeft: spacing.sm, alignSelf: 'center' },
});

export default InfoRow;
