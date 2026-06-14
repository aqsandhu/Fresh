import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import type { MyCoupon } from '@services/cart.service';

type Props = {
  visible: boolean;
  coupons: MyCoupon[];
  onClose: () => void;
};

/** "You earned a coupon" popup shown once after login for unseen auto coupons. */
export const CouponWinModal: React.FC<Props> = ({ visible, coupons, onClose }) => {
  if (coupons.length === 0) return null;
  const plural = coupons.length > 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <MaterialIcons name="close" size={22} color={COLORS.gray400} />
          </TouchableOpacity>

          <View style={styles.iconCircle}>
            <MaterialIcons name="card-giftcard" size={32} color={COLORS.primary600} />
          </View>
          <Text style={styles.title}>{plural ? "You've earned coupons!" : "You've earned a coupon!"}</Text>
          <Text style={styles.subtitle}>
            Use {plural ? 'them' : 'it'} at checkout to save on your next order.
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={{ gap: SPACING.sm }}>
            {coupons.map((c) => (
              <View key={c.code} style={styles.couponCard}>
                <Text style={styles.couponCode}>
                  <MaterialIcons name="local-offer" size={14} color={COLORS.primary700} /> {c.code}
                </Text>
                <Text style={styles.couponSummary}>{c.summary}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.primaryBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
  },
  closeBtn: { position: 'absolute', right: SPACING.md, top: SPACING.md, zIndex: 1, padding: 4 },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary100,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.gray900, textAlign: 'center' },
  subtitle: { fontSize: 13, color: COLORS.gray500, textAlign: 'center', marginTop: 4 },
  list: { marginTop: SPACING.md, maxHeight: 220 },
  couponCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.primary200,
    backgroundColor: COLORS.primary50,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  couponCode: { fontSize: 15, fontWeight: '700', color: COLORS.primary700 },
  couponSummary: { fontSize: 12, color: COLORS.gray600, marginTop: 2 },
  primaryBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary600,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
});

export default CouponWinModal;
