import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useOptionalCityName, useCityContext } from '@/context/CityContext';
import { productService } from '@services/product.service';
import { orderService } from '@services/order.service';
import { buildWhatsAppUrl, openWhatsAppOrder } from '@/lib/whatsapp';

const STATIC_FEATURES = [
  { icon: 'local-shipping' as const, key: 'free-delivery' },
  { icon: 'schedule' as const, key: 'time-slots', text: 'Free Delivery Time Slots' },
  { icon: 'verified-user' as const, key: 'freshness', text: 'Freshness Guaranteed' },
  { icon: 'phone' as const, key: 'phone' },
];

const DEFAULT_HERO_IMAGE =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=800&fit=crop';

/** primary-900 wash tones used by the website's brand band. */
const WASH = ['rgba(20,83,45,0.95)', 'rgba(20,83,45,0.85)', 'rgba(20,83,45,0.10)'] as const;

interface HeroSectionProps {
  onShopNow: () => void;
  onAttaChakki: () => void;
}

function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Mirrors the website's hero brand band (mobile view): the admin-managed
 * per-city hero image is the card's backdrop under a vertical green wash —
 * content on top, the image showing clearly in the band below, with the
 * free-delivery ribbon floating over it.
 */
export const HeroSection: React.FC<HeroSectionProps> = ({ onShopNow }) => {
  const cityName = useOptionalCityName();
  const { selectedCityId } = useCityContext();
  const [phoneText, setPhoneText] = useState('0300-1234567');
  const [freeThreshold, setFreeThreshold] = useState(500);
  const [whatsappOrderUrl, setWhatsappOrderUrl] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState(DEFAULT_HERO_IMAGE);

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
    // Per-city hero image — falls back to the default when none is set.
    productService.getHeroImage().then((res) => {
      setHeroImageUrl(res.success && res.data.url ? res.data.url : DEFAULT_HERO_IMAGE);
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
      <View style={styles.card}>
        {/* Backdrop: hero image + vertical green wash (website parity) */}
        <Image
          source={{ uri: heroImageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        <LinearGradient colors={[...WASH]} style={StyleSheet.absoluteFill} />

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.badge}>
            <View style={styles.dot} />
            <Text style={styles.badgeText}>Now Delivering in {cityName || 'Gujrat'}</Text>
          </View>

          <Text style={styles.title}>
            Fresh Sabzi/Fruit at Your <Text style={styles.accent}>Doorstep</Text>
          </Text>
          <Text style={styles.urdu}>تازہ سبزیاں اور پھل آپ کے گھر تک</Text>

          {/* Glass feature chips */}
          <View style={styles.chips}>
            {features.map((f) => {
              const chip = (
                <View key={f.key} style={styles.chip}>
                  <MaterialIcons name={f.icon} size={14} color={COLORS.primary200} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {f.text}
                  </Text>
                </View>
              );
              if (f.dialable) {
                return (
                  <TouchableOpacity key={f.key} onPress={dialPhone} activeOpacity={0.7}>
                    {chip}
                  </TouchableOpacity>
                );
              }
              return chip;
            })}
          </View>

          {/* CTAs */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.shopBtn} onPress={onShopNow} activeOpacity={0.85}>
              <Text style={styles.shopBtnText}>Shop Now</Text>
              <MaterialIcons name="arrow-forward" size={18} color={COLORS.primary700} />
            </TouchableOpacity>
            {showWhatsappButton ? (
              <TouchableOpacity
                style={styles.whatsappBtn}
                onPress={() => openWhatsAppOrder(whatsappTarget)}
                activeOpacity={0.85}
              >
                <MaterialIcons name="chat" size={18} color={COLORS.white} />
                <Text style={styles.whatsappBtnText}>WhatsApp to Order</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Window where the hero image shows through clearly */}
        <View style={styles.imageWindow} />

        {/* Free-delivery ribbon */}
        <View style={styles.ribbon}>
          <View>
            <Text style={styles.ribbonLabel}>Free Delivery</Text>
            <Text style={styles.ribbonTime}>10AM - 2PM</Text>
          </View>
          <View style={styles.ribbonIcon}>
            <MaterialIcons name="local-shipping" size={20} color={COLORS.primary600} />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
  },
  card: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    backgroundColor: COLORS.primary900,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    gap: 6,
    marginBottom: SPACING.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary300 },
  badgeText: { fontSize: 13, fontWeight: '600', color: COLORS.white },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.white,
    lineHeight: 34,
  },
  accent: { color: COLORS.primary200 },
  urdu: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary50,
    marginTop: SPACING.sm,
    lineHeight: 30,
    textAlign: 'right',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  chipText: { fontSize: 12.5, fontWeight: '500', color: COLORS.white, flexShrink: 1 },
  actions: { marginTop: SPACING.lg, gap: SPACING.sm },
  shopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 13,
    paddingHorizontal: SPACING.lg,
  },
  shopBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.primary700 },
  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
  },
  whatsappBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
  imageWindow: { height: 150 },
  ribbon: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  ribbonLabel: { fontSize: 12, color: COLORS.gray500 },
  ribbonTime: { fontSize: 16, fontWeight: '700', color: COLORS.primary600 },
  ribbonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default HeroSection;
