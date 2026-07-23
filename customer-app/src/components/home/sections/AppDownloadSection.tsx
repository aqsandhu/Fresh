import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';

const FEATURES = [
  { icon: 'star', text: '4.8 Rating on App Store' },
  { icon: 'file-download', text: '50K+ Downloads' },
  { icon: 'verified-user', text: 'Secure & Reliable' },
];

/** Mirrors website/components/sections/AppDownloadSection.tsx */
export const AppDownloadSection: React.FC = () => (
  <View style={styles.wrap}>
    <View style={styles.card}>
      <Text style={styles.title}>Download Our App</Text>
      <Text style={styles.urdu}>ایپ ڈاؤنلوڈ کریں</Text>
      <Text style={styles.desc}>
        Get the best shopping experience with our mobile app. Order fresh groceries anytime, anywhere.
        Track your orders in real-time and get exclusive app-only deals.
      </Text>

      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View key={f.text} style={styles.featureRow}>
            <MaterialIcons name={f.icon as any} size={14} color="rgba(255,255,255,0.9)" />
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.storeRow}>
        <View style={styles.storeBtn}>
          <MaterialIcons name="apple" size={28} color={COLORS.white} />
          <View>
            <Text style={styles.storeSub}>Download on the</Text>
            <Text style={styles.storeName}>App Store</Text>
          </View>
        </View>
        <View style={styles.storeBtn}>
          <MaterialIcons name="shop" size={28} color={COLORS.white} />
          <View>
            <Text style={styles.storeSub}>Get it on</Text>
            <Text style={styles.storeName}>Google Play</Text>
          </View>
        </View>
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrap: { paddingVertical: SPACING.xl, paddingHorizontal: SPACING.md, backgroundColor: COLORS.gray50 },
  card: {
    backgroundColor: COLORS.primary700,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
  },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.white },
  urdu: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary50,
    marginTop: 4,
    marginBottom: SPACING.md,
    textAlign: 'right',
  },
  desc: { fontSize: 14, color: COLORS.primary100, lineHeight: 21, marginBottom: SPACING.lg },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginBottom: SPACING.lg },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featureText: { fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  storeRow: { gap: SPACING.sm },
  storeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.black,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  storeSub: { fontSize: 10, color: COLORS.gray400 },
  storeName: { fontSize: 15, fontWeight: '600', color: COLORS.white },
});

export default AppDownloadSection;
