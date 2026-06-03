import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, CART_DROPDOWN_AUTO_CLOSE_MS } from '@utils/constants';
import { formatCurrency, getDeliveryHint } from '@utils/helpers';
import { resolveLineUnitPrice, unitLabelShort } from '@/lib/unitPricing';
import { Button } from '@components';
import { CartSummaryRows } from './CartSummaryRows';
import { useCartStore, useCartUiStore } from '@store';

/** Anchored below MobileHeader; items list scrolls when cart has many lines. */
export const CartMiniSheet: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { mobileHeaderBottomY } = useCartUiStore();
  const windowHeight = Dimensions.get('window').height;
  const panelMaxHeight = windowHeight * 0.7;
  const dropdownTop =
    mobileHeaderBottomY > 0 ? mobileHeaderBottomY : insets.top + 86;

  const activeRoute = useNavigationState((state) => {
    try {
      const tab = state?.routes?.[state.index ?? 0];
      const nested = tab?.state;
      if (nested?.routes?.length) {
        return nested.routes[nested.index ?? 0]?.name ?? tab.name;
      }
      return tab?.name ?? '';
    } catch {
      return '';
    }
  });

  const {
    items,
    getTotalItems,
    updateQuantity,
    removeFromCart,
    getSubtotal,
    getDeliveryCharge,
    getFinalTotal,
    deliveryFreeThreshold,
    loadDeliverySettings,
    hasHydrated,
  } = useCartStore();
  const { isCartDropdownOpen, setCartDropdownOpen } = useCartUiStore();
  const prevLineCount = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const blockedRoutes = ['CartMain'];
  const lineCount = items.length;
  const count = getTotalItems();
  const sub = getSubtotal();
  const delivery = getDeliveryCharge();
  const total = getFinalTotal();
  const deliveryHint = useMemo(
    () => getDeliveryHint(items, deliveryFreeThreshold),
    [items, deliveryFreeThreshold]
  );

  useEffect(() => {
    loadDeliverySettings();
  }, [loadDeliverySettings]);

  useEffect(() => {
    if (!hasHydrated || blockedRoutes.includes(activeRoute)) {
      prevLineCount.current = lineCount;
      return;
    }
    if (prevLineCount.current === null) {
      prevLineCount.current = lineCount;
      return;
    }
    // Only auto-open when a new cart line is added — not when quantity increases.
    if (lineCount > prevLineCount.current) {
      setCartDropdownOpen(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => setCartDropdownOpen(false),
        CART_DROPDOWN_AUTO_CLOSE_MS
      );
    }
    prevLineCount.current = lineCount;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [lineCount, activeRoute, hasHydrated, setCartDropdownOpen]);

  return (
    <Modal visible={isCartDropdownOpen} transparent animationType="fade">
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setCartDropdownOpen(false)}
        />
        <View
          style={[styles.dropdownWrap, { paddingTop: dropdownTop }]}
          pointerEvents="box-none"
        >
          <View style={[styles.panel, { maxHeight: panelMaxHeight }]}>
            <View style={styles.panelHeader}>
              <View style={styles.panelTitleRow}>
                <MaterialIcons name="shopping-bag" size={20} color={COLORS.primary600} />
                <Text style={styles.panelTitle}>
                  Cart ({count} {count === 1 ? 'item' : 'items'})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCartDropdownOpen(false)}>
                <MaterialIcons name="close" size={22} color={COLORS.gray600} />
              </TouchableOpacity>
            </View>

            {items.length === 0 ? (
              <View style={styles.emptyWrap}>
                <MaterialIcons name="shopping-cart" size={56} color={COLORS.gray200} />
                <Text style={styles.emptyTitle}>Your cart is empty</Text>
                <Text style={styles.emptySub}>Add fresh items to get started!</Text>
              </View>
            ) : (
              <>
                <ScrollView
                  style={styles.itemsScroll}
                  contentContainerStyle={styles.itemsScrollContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  bounces
                >
                  {items.map((item) => {
                    const unit = item.unit || 'full';
                    const suffix = unitLabelShort(unit);
                    return (
                      <View key={`${item.product.id}::${unit}`} style={styles.line}>
                        <Image source={{ uri: item.product.images[0] }} style={styles.thumb} />
                        <View style={styles.lineInfo}>
                          <Text style={styles.lineName} numberOfLines={1}>
                            {item.product.name}
                            {suffix ? ` (${suffix})` : ''}
                          </Text>
                          <Text style={styles.linePrice}>
                            {formatCurrency(resolveLineUnitPrice(item) * item.quantity)}
                          </Text>
                        </View>
                        <View style={styles.qtyRow}>
                          <TouchableOpacity
                            onPress={() =>
                              item.quantity <= 1
                                ? removeFromCart(item.product.id, unit)
                                : updateQuantity(item.product.id, item.quantity - 1, unit)
                            }
                            style={styles.qtyBtn}
                          >
                            <MaterialIcons
                              name={item.quantity <= 1 ? 'delete-outline' : 'remove'}
                              size={16}
                              color={item.quantity <= 1 ? COLORS.error : COLORS.gray600}
                            />
                          </TouchableOpacity>
                          <Text style={styles.qty}>{item.quantity}</Text>
                          <TouchableOpacity
                            onPress={() => updateQuantity(item.product.id, item.quantity + 1, unit)}
                            style={styles.qtyBtn}
                          >
                            <MaterialIcons name="add" size={16} color={COLORS.gray600} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                <View style={styles.footer}>
                  <CartSummaryRows
                    subtotal={sub}
                    deliveryCharge={delivery}
                    total={total}
                    compact
                  />
                  {deliveryHint ? (
                    <Text style={styles.deliveryHint}>{deliveryHint}</Text>
                  ) : null}
                  <Button
                    title="View Cart & Checkout"
                    onPress={() => {
                      setCartDropdownOpen(false);
                      navigation.navigate('Main', {
                        screen: 'Cart',
                        params: { screen: 'CartMain' },
                      });
                    }}
                    size="medium"
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  dropdownWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
  },
  panel: {
    width: '100%',
    maxWidth: 380,
    flexDirection: 'column',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
    backgroundColor: COLORS.primary50,
  },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  emptyWrap: { alignItems: 'center', paddingVertical: SPACING.xxl, paddingHorizontal: SPACING.lg },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.gray600, marginTop: SPACING.md },
  emptySub: { fontSize: 13, color: COLORS.gray400, marginTop: 4 },
  itemsScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  itemsScrollContent: {
    paddingHorizontal: SPACING.md,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray50,
  },
  thumb: { width: 48, height: 48, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.gray100 },
  lineInfo: { flex: 1 },
  lineName: { fontSize: 13, fontWeight: '600', color: COLORS.gray900 },
  linePrice: { fontSize: 12, color: COLORS.primary600, marginTop: 2 },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.full,
  },
  qtyBtn: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  qty: { fontSize: 13, fontWeight: '700', color: COLORS.gray900, minWidth: 20, textAlign: 'center' },
  footer: {
    flexShrink: 0,
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
    backgroundColor: COLORS.gray50,
  },
  deliveryHint: { fontSize: 11, color: COLORS.success, marginTop: SPACING.xs, marginBottom: SPACING.sm },
});

export default CartMiniSheet;
