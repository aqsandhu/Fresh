import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';

const INFO = [
  { icon: 'card-giftcard', title: 'Free Delivery', desc: 'When vegetables + fruits cross Rs. 500', tag: 'Veg/Fruit 500+' },
  { icon: 'schedule', title: 'Free Time Slots', desc: 'Pick a free-delivery time slot at checkout', tag: 'Special Slots' },
  { icon: 'local-shipping', title: 'Same Day Delivery', desc: 'Get your order delivered today', tag: 'Fast' },
  { icon: 'info', title: 'Other Items', desc: "Chicken/meat/grocery alone don't qualify for free delivery", tag: 'Note' },
];

const SLOTS = [
  { time: '10:00 AM - 2:00 PM', note: 'Free if ordered before 10AM' },
  { time: '2:00 PM - 6:00 PM', note: 'Standard delivery' },
  { time: '6:00 PM - 9:00 PM', note: 'Evening delivery' },
];

/** Mirrors website/components/sections/DeliveryInfoSection.tsx */
export const DeliveryInfoSection: React.FC = () => (
  <View style={styles.wrap}>
    <Text style={styles.title}>Delivery Information</Text>
    <Text style={styles.urdu}>ترسیل کی معلومات</Text>

    <View style={styles.grid}>
      {INFO.map((item) => (
        <View key={item.title} style={styles.card}>
          <View style={styles.iconCircle}>
            <MaterialIcons name={item.icon as any} size={24} color={COLORS.white} />
          </View>
          <Text style={styles.tag}>{item.tag}</Text>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardDesc}>{item.desc}</Text>
        </View>
      ))}
    </View>

    <View style={styles.slotsWrap}>
      <Text style={styles.slotsTitle}>Available Delivery Time Slots</Text>
      {SLOTS.map((slot) => (
        <View key={slot.time} style={styles.slotCard}>
          <MaterialIcons name="schedule" size={20} color={COLORS.white} style={{ marginBottom: 4 }} />
          <Text style={styles.slotTime}>{slot.time}</Text>
          <Text style={styles.slotNote}>{slot.note}</Text>
        </View>
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.primary600,
  },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.white, textAlign: 'center', paddingHorizontal: SPACING.lg },
  urdu: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'space-between', paddingHorizontal: SPACING.lg },
  card: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  tag: {
    fontSize: 10,
    color: COLORS.white,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: 4,
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: COLORS.white, textAlign: 'center' },
  cardDesc: { fontSize: 11, color: COLORS.primary100, textAlign: 'center', marginTop: 4, lineHeight: 16 },
  slotsWrap: {
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  slotsTitle: { fontSize: 17, fontWeight: '600', color: COLORS.white, textAlign: 'center', marginBottom: SPACING.md },
  slotCard: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  slotTime: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  slotNote: { fontSize: 12, color: COLORS.primary100, marginTop: 2 },
});

export default DeliveryInfoSection;
