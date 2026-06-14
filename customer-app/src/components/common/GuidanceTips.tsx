import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useGuidanceTips } from '@store/guidanceTips';

interface GuidanceTipsProps {
  tips: string[];
  title?: string;
}

/**
 * Dismissible Urdu user-guidance tips for order-related screens. The on/off
 * choice is global + persisted, so turning it off hides tips everywhere; a
 * compact "show tips" chip lets the user turn them back on any time.
 */
export const GuidanceTips: React.FC<GuidanceTipsProps> = ({ tips, title }) => {
  const { enabled, setEnabled } = useGuidanceTips();
  if (tips.length === 0) return null;

  if (!enabled) {
    return (
      <View style={styles.showRow}>
        <TouchableOpacity style={styles.showChip} onPress={() => setEnabled(true)} activeOpacity={0.7}>
          <MaterialIcons name="help-outline" size={14} color={COLORS.primary700} />
          <Text style={styles.showChipText}>ہدایات دکھائیں</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialIcons name="lightbulb-outline" size={16} color="#b45309" />
          <Text style={styles.headerTitle}>{title || 'رہنمائی'}</Text>
        </View>
        <TouchableOpacity style={styles.offBtn} onPress={() => setEnabled(false)} hitSlop={8}>
          <MaterialIcons name="close" size={14} color="#b45309" />
          <Text style={styles.offBtnText}>بند کریں</Text>
        </TouchableOpacity>
      </View>

      {tips.map((tip, i) => (
        <View key={i} style={styles.tipRow}>
          <View style={styles.bullet} />
          <Text style={styles.tipText}>{tip}</Text>
        </View>
      ))}

      <TouchableOpacity onPress={() => setEnabled(false)} activeOpacity={0.7}>
        <Text style={styles.offLink}>یہ ہدایات بند کر دیں</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: '#92400e' },
  offBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  offBtnText: { fontSize: 12, color: '#b45309' },
  tipRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b', marginTop: 7 },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 24,
    color: '#78350f',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  offLink: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
    textDecorationLine: 'underline',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  showRow: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm, alignItems: 'flex-end' },
  showChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.primary200,
    backgroundColor: COLORS.primary50,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  showChipText: { fontSize: 12, fontWeight: '600', color: COLORS.primary700 },
});

export default GuidanceTips;
