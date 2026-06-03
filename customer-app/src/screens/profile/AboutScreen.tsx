import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { ProfileStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';

const VALUES = [
  {
    icon: 'eco',
    title: 'Freshness First',
    description: 'We source products directly from local farms for maximum freshness.',
  },
  {
    icon: 'local-shipping',
    title: 'Fast Delivery',
    description: 'Same-day delivery with real-time order tracking.',
  },
  {
    icon: 'groups',
    title: 'Customer Focused',
    description: 'Our support team is always ready to help with your queries.',
  },
  {
    icon: 'verified',
    title: 'Quality Guaranteed',
    description: 'Every product goes through strict quality checks before delivery.',
  },
];

export const AboutScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const version = Constants.expoConfig?.version || '1.0.0';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>FB</Text>
          </View>
          <Text style={styles.heroTitle}>Fresh Bazar</Text>
          <Text style={styles.heroUrdu}>سبزی والا</Text>
          <Text style={styles.heroDesc}>
            Your trusted partner for fresh groceries delivery. We bring farm-fresh products to
            every household.
          </Text>
        </View>

        <View style={styles.statsRow}>
          {[
            { value: '50K+', label: 'Customers' },
            { value: '100+', label: 'Products' },
            { value: '24/7', label: 'Support' },
          ].map((stat) => (
            <View key={stat.label} style={styles.stat}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {VALUES.map((item) => (
          <View key={item.title} style={styles.valueCard}>
            <MaterialIcons name={item.icon as any} size={24} color={COLORS.primary600} />
            <View style={styles.valueText}>
              <Text style={styles.valueTitle}>{item.title}</Text>
              <Text style={styles.valueDesc}>{item.description}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.version}>App version {version}</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.gray900 },
  content: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  hero: {
    backgroundColor: COLORS.primary600,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  logoText: { fontSize: 20, fontWeight: '800', color: COLORS.primary700 },
  heroTitle: { fontSize: 24, fontWeight: '700', color: COLORS.white },
  heroUrdu: { fontSize: 18, color: COLORS.primary100, marginTop: 4 },
  heroDesc: {
    fontSize: 14,
    color: COLORS.primary100,
    textAlign: 'center',
    marginTop: SPACING.md,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    justifyContent: 'space-around',
  },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: COLORS.primary700 },
  statLabel: { fontSize: 12, color: COLORS.gray500, marginTop: 2 },
  valueCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
    alignItems: 'flex-start',
  },
  valueText: { flex: 1 },
  valueTitle: { fontSize: 15, fontWeight: '600', color: COLORS.gray900 },
  valueDesc: { fontSize: 13, color: COLORS.gray600, marginTop: 4, lineHeight: 18 },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.gray400,
    marginTop: SPACING.lg,
  },
});

export default AboutScreen;
