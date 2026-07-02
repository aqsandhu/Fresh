import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useCityContext } from '@/context/CityContext';
import { orderService, DeliverySlotWithCapacity } from '@services/order.service';

/** "10:00:00" → "10 AM", "14:30:00" → "2:30 PM". */
function formatSlotTime(t: string): string {
  const [hStr = '0', mStr = '0'] = String(t || '').split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  if (!Number.isFinite(h)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')} ${ampm}` : `${h} ${ampm}`;
}

/**
 * Mirrors website DeliveryInfoSection — live admin data: real free-delivery
 * threshold and the actual time-slot list (FREE badges), compact layout.
 */
export const DeliveryInfoSection: React.FC = () => {
  const { selectedCityId } = useCityContext();
  const [threshold, setThreshold] = useState(500);
  const [slots, setSlots] = useState<DeliverySlotWithCapacity[]>([]);

  useEffect(() => {
    if (!selectedCityId) return;
    orderService
      .getDeliverySettings()
      .then((res) => {
        if (res.success && res.data.free_delivery_threshold > 0) {
          setThreshold(res.data.free_delivery_threshold);
        }
      })
      .catch(() => {});
    orderService
      .getDeliverySlots()
      .then((res) => {
        if (res.success) setSlots(res.data);
      })
      .catch(() => {});
  }, [selectedCityId]);

  const freeSlotCount = slots.filter((s) => s.isFreeDelivery).length;

  const tiles = [
    { icon: 'card-giftcard', title: 'Free Delivery', desc: `Sabzi + fruits Rs. ${threshold}+` },
    {
      icon: 'schedule',
      title: 'Free Time Slots',
      desc:
        freeSlotCount > 0
          ? `${freeSlotCount} free slot${freeSlotCount > 1 ? 's' : ''} daily`
          : 'Pick one at checkout',
    },
    { icon: 'local-shipping', title: 'Same Day', desc: 'Order today, delivered today' },
    { icon: 'info', title: 'Note', desc: 'Chicken/meat/grocery alone: standard charges' },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Delivery Information</Text>
      <Text style={styles.urdu}>ترسیل کی معلومات</Text>

      <View style={styles.grid}>
        {tiles.map((item) => (
          <View key={item.title} style={styles.card}>
            <View style={styles.iconCircle}>
              <MaterialIcons name={item.icon as any} size={20} color={COLORS.white} />
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardDesc}>{item.desc}</Text>
          </View>
        ))}
      </View>

      {slots.length > 0 && (
        <View style={styles.slotsWrap}>
          <Text style={styles.slotsTitle}>Today&apos;s Delivery Time Slots</Text>
          <View style={styles.slotsRow}>
            {slots.map((slot) => (
              <View key={slot.id} style={styles.slotPill}>
                <Text style={styles.slotTime}>
                  {formatSlotTime(slot.startTime)} – {formatSlotTime(slot.endTime)}
                </Text>
                {slot.isFreeDelivery && (
                  <View style={styles.freeBadge}>
                    <Text style={styles.freeBadgeText}>FREE</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.primary600,
  },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.white, textAlign: 'center', paddingHorizontal: SPACING.lg },
  urdu: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    rowGap: SPACING.sm,
  },
  card: {
    width: '48.5%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: SPACING.md,
    alignItems: 'center',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: COLORS.white, textAlign: 'center' },
  cardDesc: { fontSize: 11, color: COLORS.primary100, textAlign: 'center', marginTop: 3, lineHeight: 15 },
  slotsWrap: {
    marginTop: SPACING.md,
    marginHorizontal: SPACING.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: SPACING.md,
  },
  slotsTitle: { fontSize: 14, fontWeight: '600', color: COLORS.white, textAlign: 'center', marginBottom: SPACING.sm },
  slotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  slotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  slotTime: { fontSize: 12.5, fontWeight: '600', color: COLORS.white },
  freeBadge: {
    backgroundColor: '#FCD34D',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  freeBadgeText: { fontSize: 9, fontWeight: '700', color: '#78350F' },
});

export default DeliveryInfoSection;
