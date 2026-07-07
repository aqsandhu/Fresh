import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useTabBarMetrics } from '@/lib/tabBarMetrics';
import { useActiveRouteName } from '@/lib/activeRoute';
import { useInstructionsPopup } from '@store/drawerUi';
import { useUiActivity } from '@store/uiActivity';
import { useCityContext } from '@/context/CityContext';
import { tipsService } from '@services/tips.service';
import {
  CHECKOUT_TIPS,
  TRACK_TIPS,
  ORDERS_TIPS,
  ORDER_DETAIL_TIPS,
  SUPPORT_TIPS,
  COMPLAINT_TIPS,
  REVIEWS_TIPS,
} from '@/content/guidanceTips';

const HOME_FALLBACK = [
  'تازہ سبزیاں، پھل، ڈرائی فروٹ اور چکن گھر بیٹھے منگوائیں۔',
  'کیٹیگری کے مطابق خریداری کے لیے بائیں کنارے والا مینو کھولیں۔',
  'سپورٹ، رہنمائی، شہر اور واٹس ایپ آرڈر کے لیے دائیں کنارے والا مینو کھولیں۔',
  'سبزی اور پھل کی مقررہ رقم پر مفت ڈیلیوری حاصل کریں۔',
];
const SHOP_FALLBACK = [
  'کوالٹی A/B/C منتخب کریں — ہر کوالٹی کی اپنی قیمت ہے۔',
  'وزن (کلو / آدھا کلو / پاؤ) منتخب کر کے کارٹ میں شامل کریں۔',
];

/** Route name → admin tips page-key + hardcoded fallback (mirrors website guidanceForPath). */
function guidanceForRoute(route: string): { page: string; fallback: string[] } {
  switch (route) {
    case 'HomeMain':
      return { page: 'home', fallback: HOME_FALLBACK };
    case 'ProductsMain':
    case 'CategoriesList':
    case 'CategoryProducts':
    case 'Search':
      return { page: 'shop', fallback: SHOP_FALLBACK };
    case 'ProductDetail':
      return { page: 'product', fallback: SHOP_FALLBACK };
    case 'CartMain':
      return { page: 'cart', fallback: [] };
    case 'Checkout':
      return { page: 'checkout', fallback: CHECKOUT_TIPS };
    case 'OrdersList':
      return { page: 'orders', fallback: ORDERS_TIPS };
    case 'OrderDetail':
      return { page: 'order_detail', fallback: ORDER_DETAIL_TIPS };
    case 'TrackOrder':
      return { page: 'track', fallback: TRACK_TIPS };
    case 'Support':
      return { page: 'support', fallback: SUPPORT_TIPS };
    case 'NewComplaint':
      return { page: 'complaint', fallback: COMPLAINT_TIPS };
    case 'MyReviews':
      return { page: 'reviews', fallback: REVIEWS_TIPS };
    default:
      return { page: (route || 'home').toLowerCase(), fallback: [] };
  }
}

/** Screens where the popup would get in the way (pins, city gate, checkout map). */
const HIDE_ON = new Set([
  'SelectCity',
  'AddAddress',
  'ChangePin',
  'SetPin',
]);

export const InstructionsPopup: React.FC = () => {
  const open = useInstructionsPopup((s) => s.open);
  const setOpen = useInstructionsPopup((s) => s.setOpen);
  const { height: tabBarHeight } = useTabBarMetrics();
  const { selectedCityId } = useCityContext();
  const route = useActiveRouteName();

  const { page, fallback } = useMemo(() => guidanceForRoute(route), [route]);
  const hidden = HIDE_ON.has(route) || route.startsWith('Restaurant') || !selectedCityId;

  const { data: remote } = useQuery({
    queryKey: ['page-tips', page, selectedCityId],
    queryFn: () => tipsService.forPage(page),
    enabled: !!selectedCityId && !hidden,
    staleTime: 5 * 60 * 1000,
  });

  // Each screen has its own tips — close the popup when navigating away.
  useEffect(() => {
    setOpen(false);
  }, [route, setOpen]);

  // Website behaviour: if the shopper goes quiet (no navigation / popup use for
  // ~8s), the lightbulb grows a small "راہنمائی حاصل کریں" label to offer help.
  // Navigating (route change) or opening the popup resets the idle clock.
  const [idleLabel, setIdleLabel] = useState(false);
  const activityTick = useUiActivity((s) => s.tick);
  useEffect(() => {
    // Any activity (route change, popup use, or a touch anywhere) collapses the
    // label back to the plain lightbulb and restarts the 8s idle clock.
    setIdleLabel(false);
    if (hidden || open) return;
    const t = setTimeout(() => setIdleLabel(true), 8000);
    return () => clearTimeout(t);
  }, [route, hidden, open, activityTick]);

  // Smooth spring open / soft fade-scale close (mirrors the website's
  // framer-motion popup) — replaces the Modal's jerky built-in fade.
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setMounted(false);
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (hidden) return null;

  const tips = remote && remote.length > 0 ? remote : fallback;
  if (tips.length === 0) return null;

  const cardOpacity = anim;
  const cardScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  const cardTranslateY = anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, idleLabel && styles.fabExpanded, { bottom: tabBarHeight + 16 }]}
        onPress={() => {
          setIdleLabel(false);
          setOpen(true);
        }}
        activeOpacity={0.85}
        accessibilityLabel="Instructions"
      >
        <LinearGradient colors={['#fbbf24', '#f59e0b']} style={StyleSheet.absoluteFill} />
        {idleLabel && (
          <Text style={styles.fabLabel} numberOfLines={1}>
            راہنمائی حاصل کریں
          </Text>
        )}
        <MaterialIcons name="lightbulb" size={22} color={COLORS.white} />
      </TouchableOpacity>

      <Modal visible={mounted} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Animated.View style={[styles.backdrop, { opacity: anim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          </Animated.View>
          <Animated.View
            style={[
              styles.card,
              {
                opacity: cardOpacity,
                transform: [{ scale: cardScale }, { translateY: cardTranslateY }],
              },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitle}>
                <View style={styles.headerIcon}>
                  <MaterialIcons name="lightbulb" size={16} color="#d97706" />
                </View>
                <Text style={styles.headerText}>رہنمائی</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} accessibilityLabel="Close instructions">
                <MaterialIcons name="close" size={20} color="#b45309" />
              </TouchableOpacity>
            </View>

            {/* Tips */}
            <ScrollView style={styles.tipList} contentContainerStyle={{ padding: SPACING.lg }}>
              {tips.map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <View style={styles.tipNum}>
                    <Text style={styles.tipNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <TouchableOpacity onPress={() => setOpen(false)} activeOpacity={0.85}>
                <LinearGradient
                  colors={['#fbbf24', '#f59e0b']}
                  style={styles.footerBtn}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.footerBtnText}>سمجھ گئے</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 12,
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 48,
  },
  fabExpanded: { paddingHorizontal: 12 },
  fabLabel: { color: COLORS.white, fontWeight: '700', fontSize: 11 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(251,191,36,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { fontSize: 15, fontWeight: '700', color: '#78350f' },
  tipList: { maxHeight: 340 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.md },
  tipNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  tipNumText: { fontSize: 10, fontWeight: '700', color: '#b45309' },
  tipText: { flex: 1, fontSize: 13.5, lineHeight: 22, color: COLORS.gray700, textAlign: 'right' },
  footer: { borderTopWidth: 1, borderTopColor: '#fef3c7', padding: SPACING.md },
  footerBtn: {
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  footerBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
});

export default InstructionsPopup;
