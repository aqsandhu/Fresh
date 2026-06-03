import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useOptionalCityName, useCityContext } from '@/context/CityContext';
import { productService } from '@services/product.service';
import { orderService } from '@services/order.service';
import { buildWhatsAppUrl, openWhatsAppOrder } from '@/lib/whatsapp';

const STATIC_FEATURES = [
  { icon: 'local-shipping' as const, key: 'free-delivery' },
  { icon: 'schedule' as const, key: 'time-slots', text: 'Free Delivery Time Slots Available' },
  { icon: 'verified-user' as const, key: 'freshness', text: 'Freshness Guaranteed' },
  { icon: 'phone' as const, key: 'phone' },
];

interface HeroSectionProps {
  onShopNow: () => void;
  onAttaChakki: () => void;
}

function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Mirrors website/components/sections/HeroSection.tsx mobile layout */
export const HeroSection: React.FC<HeroSectionProps> = ({ onShopNow, onAttaChakki }) => {
  const cityName = useOptionalCityName();
  const { selectedCityId } = useCityContext();
  const [phoneText, setPhoneText] = useState('0300-1234567');
  const [freeThreshold, setFreeThreshold] = useState(500);
  const [whatsappOrderUrl, setWhatsappOrderUrl] = useState('');

  useEffect(() => {
    if (!selectedCityId) return;
    productService.getBannerSettings().then((res) => {
      if (!res.success || !res.data) return;
      if (res.data.leftText) setPhoneText(res.data.leftText);
      if (res.data.whatsappOrderUrl) setWhatsappOrderUrl(res.data.whatsappOrderUrl);
    });
    productService.getWhatsAppOrderUrl().then((res) => {
      if (res.success && res.data.url) setWhatsappOrderUrl(res.data.url);
    });
    orderService.getDeliverySettings().then((res) => {
      if (res.success && res.data?.free_delivery_threshold) {
        setFreeThreshold(res.data.free_delivery_threshold);
      }
    });
  }, [selectedCityId]);

  const features = useMemo(
    () =>
      STATIC_FEATURES.map((f) => {
        if (f.key === 'free-delivery') {
          return {
            ...f,
            text: `Free Delivery on Rs. ${freeThreshold}+ Sabzi/Fruits`,
            dialable: false,
          };
        }
        if (f.key === 'phone') {
          return { ...f, text: phoneText, dialable: true };
        }
        return { ...f, dialable: false };
      }),
    [freeThreshold, phoneText]
  );

  const dialPhone = () => {
    const digits = phoneDigits(phoneText);
    if (digits) Linking.openURL(`tel:${digits}`);
  };

  const whatsappTarget = whatsappOrderUrl.trim() || phoneText.trim();
  const showWhatsappButton = Boolean(buildWhatsAppUrl(whatsappTarget));

  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <View style={styles.dot} />
        <Text style={styles.badgeText}>Now Delivering in {cityName}</Text>
      </View>

      <Text style={styles.title}>
        Fresh Sabzi/Fruit at Your <Text style={styles.accent}>Doorstep</Text>
      </Text>
      <Text style={styles.urdu}>تازہ سبزیاں اور پھل آپ کے گھر تک</Text>

      <View style={styles.featureGrid}>
        {features.map((f) => {
          const content = (
            <>
              <MaterialIcons name={f.icon} size={16} color={COLORS.primary600} />
              <Text
                style={[styles.featureText, f.dialable && styles.phoneText]}
                numberOfLines={f.dialable ? 1 : 2}
              >
                {f.text}
              </Text>
            </>
          );

          if (f.dialable) {
            return (
              <TouchableOpacity
                key={f.key}
                style={styles.featureRow}
                onPress={dialPhone}
                activeOpacity={0.7}
              >
                {content}
              </TouchableOpacity>
            );
          }

          return (
            <View key={f.key} style={styles.featureRow}>
              {content}
            </View>
          );
        })}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={onShopNow} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Shop Now</Text>
          <MaterialIcons name="arrow-forward" size={18} color={COLORS.white} />
        </TouchableOpacity>
        {showWhatsappButton ? (
          <TouchableOpacity
            style={styles.whatsappBtn}
            onPress={() => openWhatsAppOrder(whatsappTarget)}
            activeOpacity={0.85}
          >
            <MaterialIcons name="chat" size={18} color="#fff" />
            <Text style={styles.whatsappBtnText}>WhatsApp to Order</Text>
          </TouchableOpacity>
        ) : null}
        {/* Atta Chakki — temporarily hidden; re-enable when service launches
        <TouchableOpacity style={styles.outlineBtn} onPress={onAttaChakki} activeOpacity={0.85}>
          <Text style={styles.outlineBtnText}>Atta Chakki Service</Text>
        </TouchableOpacity>
        */}
      </View>

      <View style={styles.heroImageWrap}>
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=800&fit=crop' }}
          style={styles.heroImage}
        />
        <View style={styles.floatBadge}>
          <View>
            <Text style={styles.floatLabel}>Free Delivery</Text>
            <Text style={styles.floatTime}>10AM - 2PM</Text>
          </View>
          <View style={styles.floatIcon}>
            <MaterialIcons name="local-shipping" size={20} color={COLORS.primary600} />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.primary50,
    paddingHorizontal: SPACING.md,
    paddingTop: 10,
    paddingBottom: SPACING.xl,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: COLORS.primary100,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    gap: 6,
    marginBottom: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary500 },
  badgeText: { fontSize: 13, fontWeight: '600', color: COLORS.primary700 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.gray900,
    lineHeight: 34,
    textAlign: 'center',
  },
  accent: { color: COLORS.primary600 },
  urdu: {
    fontSize: 17,
    color: COLORS.gray600,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: SPACING.sm,
    marginTop: SPACING.md,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, width: '48%' },
  featureText: { flex: 1, fontSize: 13, color: COLORS.gray600 },
  phoneText: { color: COLORS.primary600, fontWeight: '600', textDecorationLine: 'underline' },
  actions: { marginTop: SPACING.lg, gap: SPACING.sm },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary600,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
  },
  whatsappBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
  outlineBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary600,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.white,
  },
  outlineBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.primary600 },
  heroImageWrap: { marginTop: SPACING.lg, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden' },
  heroImage: { width: '100%', height: 268, borderRadius: BORDER_RADIUS.xxl },
  floatBadge: {
    position: 'absolute',
    bottom: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  floatLabel: { fontSize: 12, color: COLORS.gray500 },
  floatTime: { fontSize: 16, fontWeight: '700', color: COLORS.primary600 },
  floatIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default HeroSection;
