import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { RootStackParamList, StoreCartItem } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { formatCurrency, getDeliveryHint } from '@utils/helpers';
import { resolveLineUnitPrice, unitLabelShort, unitPriceCaption } from '@/lib/unitPricing';
import { Button, EmptyState, QuantitySelector, ProductPrice } from '@components';
import { CartSummaryRows } from '@components/cart/CartSummaryRows';
import { MobileHeader } from '@components/layout/MobileHeader';
import { useAuthStore, useCartStore } from '@store';

const STICKY_BTN_HEIGHT = 53; // 44px + 20%, fixed
const STICKY_BAR_HEIGHT = STICKY_BTN_HEIGHT + SPACING.md;
/** Gap between checkout bar bottom edge and tab bar top edge. */
const STICKY_BAR_TAB_GAP = 5;
/** Visible space below Continue Shopping when scrolled to end (+15%, then +5%). */
const SCROLL_BOTTOM_GAP = Math.ceil(Math.ceil(2 * 1.15) * 1.05);
/** Gap between order summary box and Continue Shopping link (half of SPACING.md). */
const SUMMARY_TO_LINK_GAP = SPACING.md / 2;

/** Scroll padding so content clears the sticky checkout bar. */
const SCROLL_BOTTOM_PADDING =
  STICKY_BAR_HEIGHT + STICKY_BAR_TAB_GAP + SCROLL_BOTTOM_GAP;

export const CartScreen: React.FC = () => {
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isAuthenticated } = useAuthStore();
  const {
    items,
    updateQuantity,
    removeFromCart,
    clearCart,
    getSubtotal,
    getDeliveryCharge,
    getFinalTotal,
    deliveryFreeThreshold,
    loadDeliverySettings,
  } = useCartStore();

  useEffect(() => {
    loadDeliverySettings();
  }, [loadDeliverySettings]);

  const sub = getSubtotal();
  const currentDeliveryCharge = getDeliveryCharge();
  const cartTotal = getFinalTotal();
  const deliveryHint = getDeliveryHint(items, deliveryFreeThreshold);
  const freeDelivery = currentDeliveryCharge === 0;

  const handleIncrement = async (productId: string, currentQuantity: number, unit?: StoreCartItem['unit'], quality?: StoreCartItem['quality']) => {
    await updateQuantity(productId, currentQuantity + 1, unit, quality);
  };

  const handleDecrement = async (productId: string, currentQuantity: number, unit?: StoreCartItem['unit'], quality?: StoreCartItem['quality']) => {
    if (currentQuantity <= 1) {
      await removeFromCart(productId, unit, quality);
    } else {
      await updateQuantity(productId, currentQuantity - 1, unit, quality);
    }
  };

  const handleRemove = async (productId: string, unit?: StoreCartItem['unit'], quality?: StoreCartItem['quality']) => {
    await removeFromCart(productId, unit, quality);
    Toast.show({ type: 'success', text1: 'Item removed from cart' });
  };

  const handleClearCart = () => {
    Alert.alert('Clear Cart', 'Remove all items from your cart?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          await clearCart();
          Toast.show({ type: 'success', text1: 'Cart cleared' });
        },
      },
    ]);
  };

  const handleCheckout = () => {
    // Website parity: guests are NOT sent to a separate login screen — they go
    // straight to checkout and sign in via the inline panel there.
    rootNavigation.navigate('CartFlow', { screen: 'Checkout' });
  };

  const lineKey = (item: StoreCartItem) =>
    `${item.product.id}::${item.unit || 'full'}::${item.quality || 'A'}`;

  const renderCartItem = (item: StoreCartItem) => {
    const unit = item.unit || 'full';
    const quality = item.quality || 'A';
    const unitSuffix = unitLabelShort(unit);

    return (
      <TouchableOpacity
        key={lineKey(item)}
        style={styles.cartItem}
        activeOpacity={0.9}
        onPress={() =>
          rootNavigation.navigate('Main', {
            screen: 'Shop',
            params: { screen: 'ProductDetail', params: { productId: item.product.id } },
          })
        }
      >
        <Image source={{ uri: item.product.images[0] }} style={styles.itemImage} />
        <View style={styles.itemContent}>
          <View style={styles.itemHeader}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={2}>
                {item.product.name}
                {unit !== 'full' ? ` (${unitPriceCaption(unit)})` : unitSuffix ? ` (${unitSuffix})` : ''}
                {quality !== 'A' ? `  ·  Quality ${quality}` : ''}
              </Text>
              <ProductPrice
                price={resolveLineUnitPrice(item)}
                unit={unit === 'full' ? item.product.unit : unitSuffix || undefined}
                size="md"
                style={styles.itemUnitPrice}
              />
            </View>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                handleRemove(item.product.id, unit, quality);
              }}
              style={styles.removeButton}
            >
              <MaterialIcons name="delete-outline" size={20} color={COLORS.error} />
            </TouchableOpacity>
          </View>
          <View style={styles.itemFooter}>
            <QuantitySelector
              quantity={item.quantity}
              onIncrement={() => handleIncrement(item.product.id, item.quantity, unit, quality)}
              onDecrement={() => handleDecrement(item.product.id, item.quantity, unit, quality)}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const itemCountLabel = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <MobileHeader
          onSearchPress={() =>
            rootNavigation.navigate('Main', {
              screen: 'Shop',
              params: { screen: 'Search' },
            })
          }
        />
        <EmptyState
          icon="shopping-cart"
          title="Your cart is empty"
          message="Looks like you haven't added anything to your cart yet."
          actionTitle="Start Shopping"
          onAction={() =>
            rootNavigation.navigate('Main', { screen: 'Shop', params: { screen: 'ProductsMain' } })
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <MobileHeader
        onSearchPress={() =>
          rootNavigation.navigate('Main', {
            screen: 'Shop',
            params: { screen: 'Search' },
          })
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: SCROLL_BOTTOM_PADDING },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Shopping Cart ({itemCountLabel})</Text>

        {items.map(renderCartItem)}

        <TouchableOpacity onPress={handleClearCart} style={styles.clearAllBtn}>
          <Text style={styles.clearAllText}>Clear all items</Text>
        </TouchableOpacity>

        {deliveryHint ? (
          <View
            style={[
              styles.freeDeliveryBanner,
              freeDelivery && styles.freeDeliveryBannerActive,
            ]}
          >
            <MaterialIcons
              name={freeDelivery ? 'check-circle' : 'local-shipping'}
              size={20}
              color={freeDelivery ? COLORS.success : COLORS.primary}
            />
            <Text style={styles.freeDeliveryText}>{deliveryHint}</Text>
          </View>
        ) : null}

        <View style={styles.summaryCard}>
          <CartSummaryRows
            subtotal={sub}
            deliveryCharge={currentDeliveryCharge}
            total={cartTotal}
          />
        </View>

        <TouchableOpacity
          style={styles.continueShopping}
          onPress={() =>
            rootNavigation.navigate('Main', {
              screen: 'Shop',
              params: { screen: 'ProductsMain' },
            })
          }
        >
          <Text style={styles.continueShoppingText}>Continue Shopping</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[styles.stickyBar, { bottom: STICKY_BAR_TAB_GAP }]}>
        <View style={styles.stickyTotal}>
          <Text style={styles.stickyTotalLabel}>Total</Text>
          <Text style={styles.stickyTotalValue}>{formatCurrency(cartTotal)}</Text>
        </View>
        <Button
          title={isAuthenticated ? 'Proceed to Checkout' : 'Login to Checkout'}
          onPress={handleCheckout}
          size="medium"
          style={styles.stickyBtn}
          textStyle={styles.stickyBtnText}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gray900,
    marginBottom: SPACING.lg,
  },
  clearAllBtn: {
    alignSelf: 'flex-end',
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  clearAllText: { fontSize: 14, color: COLORS.error, fontWeight: '600' },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.md,
  },
  itemContent: {
    flex: 1,
    marginLeft: SPACING.md,
    justifyContent: 'space-between',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: 2,
  },
  itemUnitPrice: {
    marginTop: 2,
  },
  removeButton: {
    padding: SPACING.xs,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  freeDeliveryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLighter,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  freeDeliveryBannerActive: {
    backgroundColor: '#E8F5E9',
  },
  freeDeliveryText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.gray700,
    marginLeft: SPACING.sm,
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SUMMARY_TO_LINK_GAP,
    overflow: 'visible',
  },
  continueShopping: {
    alignItems: 'center',
    paddingVertical: 0,
    marginBottom: 0,
  },
  continueShoppingText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary600,
  },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: STICKY_BAR_HEIGHT,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  stickyTotal: {
    flexShrink: 0,
    minWidth: 72,
    justifyContent: 'center',
  },
  stickyTotalLabel: {
    fontSize: 11,
    color: COLORS.gray500,
    lineHeight: 14,
  },
  stickyTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.gray900,
    lineHeight: 22,
  },
  stickyBtn: {
    flex: 1,
    height: STICKY_BTN_HEIGHT,
    minHeight: STICKY_BTN_HEIGHT,
    maxHeight: STICKY_BTN_HEIGHT,
    alignSelf: 'center',
    paddingVertical: 0,
    paddingHorizontal: SPACING.md,
  },
  stickyBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});

export default CartScreen;
