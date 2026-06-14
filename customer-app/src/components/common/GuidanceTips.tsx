import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useGuidanceTips } from '@store/guidanceTips';
import { tipsService } from '@services/tips.service';

interface GuidanceTipsProps {
  /** Hardcoded Urdu fallback tips, used until admin tips load (or if none). */
  tips: string[];
  /** Page key to fetch admin-managed tips for (e.g. "checkout"). */
  page?: string;
  title?: string;
}

/**
 * Dismissible Urdu guidance tips. Admin-managed tips (per page + city) are
 * fetched and take priority; the hardcoded `tips` are the fallback. The on/off
 * choice is global + persisted; a compact "show tips" chip restores them.
 */
export const GuidanceTips: React.FC<GuidanceTipsProps> = ({ tips, page, title }) => {
  const { enabled, setEnabled } = useGuidanceTips();
  const [remote, setRemote] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    if (!page) return;
    tipsService
      .forPage(page)
      .then((rows) => {
        if (active && rows.length > 0) setRemote(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [page]);

  const list = remote ?? tips;
  if (list.length === 0) return null;

  if (!enabled) {
    return (
      <View style={styles.showRow}>
        <TouchableOpacity style={styles.showChip} onPress={() => setEnabled(true)} activeOpacity={0.7}>
          <MaterialIcons name="auto-awesome" size={14} color="#b45309" />
          <Text style={styles.showChipText}>ہدایات دکھائیں</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconChip}>
            <MaterialIcons name="lightbulb" size={14} color="#d97706" />
          </View>
          <Text style={styles.headerTitle}>{title || 'رہنمائی'}</Text>
        </View>
        <TouchableOpacity style={styles.offBtn} onPress={() => setEnabled(false)} hitSlop={8}>
          <MaterialIcons name="close" size={14} color="#b45309" />
          <Text style={styles.offBtnText}>بند کریں</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {list.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <View style={styles.numberChip}>
              <Text style={styles.numberText}>{i + 1}</Text>
            </View>
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.footer} onPress={() => setEnabled(false)} activeOpacity={0.7}>
        <Text style={styles.offLink}>یہ ہدایات بند کر دیں</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fffbeb',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconChip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 14, fontWeight: '800', color: '#92400e' },
  offBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  offBtnText: { fontSize: 12, color: '#b45309', fontWeight: '600' },
  body: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  tipRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  numberChip: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  numberText: { fontSize: 10, fontWeight: '800', color: '#b45309' },
  tipText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 24,
    color: '#374151',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#fef3c7',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  offLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
    textAlign: 'left',
    writingDirection: 'rtl',
  },
  showRow: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm, alignItems: 'flex-end' },
  showChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  showChipText: { fontSize: 12, fontWeight: '700', color: '#b45309' },
});

export default GuidanceTips;
