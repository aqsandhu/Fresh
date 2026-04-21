import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { CartStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { formatCurrency } from '@utils/helpers';
import { Button, EmptyState, QuantitySelector } from '@components';
import { useCartStore } from '@store';
import { orderService } from '@services/order.service';

export const CartScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CartStackParamList>>();
  const { items, updateQuantity, removeFromCart, subtotal } = useCartStore();
  const [deliverySettings, setDeliverySettings] = useState<{ base_charge: number; free_delivery_threshold: number }>({ base_charge: 100, free_delivery_threshold: 500 });

  useEffect(() => {
    orderService.getDeliverySettings().then((res) => {
      if (res.success) setDeliverySettings(res.data);
    });
  }, []);

  const sub = subtotal();
  const freeDelivery = sub >= deliverySettings.free_delivery_threshold;
  const currentDeliveryCharge = freeDelivery ? 0 : deliverySettings.base_charge;
  const cartTotal = sub + currentDeliveryCharge;
  const remaining = deliverySettings.free_delivery_threshold - sub;

  const handleIncrement = async (productId: string, currentQuantity: number) => {
    await updateQuantity(productId, currentQuantity + 1);
  };

  const handleDecrement = async (productId: string, currentQuantity: number) => {
    if (currentQuantity <= 1) {
      await removeFromCart(productId);
    } else {
      await updateQuantity(productId, currentQuantity - 1);
    }
  };

  const handleRemove = async (productId: string) => {
    await removeFromCart(productId);
  };

  const renderCartItem = ({ item }: { item: typeof items[0] }) => (
    <View style={styles.cartItem}>
      <Image source={{ uri: item.product.images[0] }} style={styles.itemImage} />
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.product.name}</Text>
            <Text style={styles.itemUnit}>{item.product.unit}</Text>
          </View>
          <TouchableOpacity
            onPress={() => handleRemove(item.product.id)}
            style={styles.removeButton}
          >
            <MaterialIcons name="delete-outline" size={20} color={COLORS.error} />
          </TouchableOpacity>
        </View>
        <View style={styles.itemFooter}>
          <QuantitySelector
            quantity={item.quantity}
            onIncrement={() => handleIncrement(item.product.id, item.quantity)}
            onDecrement={() => handleDecrement(item.product.id, item.quantity)}
          />
          <Text style={styles.itemPrice}>
            {formatCurrency(item.product.price * item.quantity)}
          </Text>
        </View>
      </View>
    </View>
  );

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          icon="shopping-cart"
          title="Your cart is empty"
          message="Add some fresh products to get started"
          actionTitle="Start Shopping"
          onAction={() => navigation.navigate('Main' as any)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Shopping Cart</Text>
        <Text style={styles.subtitle}>{items.length} items</Text>
      </View>

      {/* Cart Items */}
      <FlatList
        data={items}
        renderItem={renderCartItem}
        keyExtractor={(item) => item.product.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      {/* Free Delivery Banner */}
      {!freeDelivery && remaining > 0 && (
        <View style={styles.freeDeliveryBanner}>
          <MaterialIcons name="local-shipping" size={20} color={COLORS.primary} />
          <Text style={styles.freeDeliveryText}>
            Add <Text style={styles.freeDeliveryAmount}>{formatCurrency(remaining)}</Text> more for FREE delivery
          </Text>
        </View>
      )}

      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatCurrency(sub)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Delivery</Text>
          <Text style={[styles.summaryValue, freeDelivery && styles.freeText]}>
            {freeDelivery ? 'FREE' : formatCurrency(currentDeliveryCharge)}
          </Text>
        </View>
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(cartTotal)}</Text>
        </View>

        <Button
          title="Proceed to Checkout"
          onPress={() => navigation.navigate('AddressSelection')}
          size="large"
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: 4,
  },
  list: {
    padding: SPACING.lg,
  },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
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
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  itemUnit: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  removeButton: {
    padding: SPACING.xs,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  freeDeliveryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLighter,
    marginHorizontal: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  freeDeliveryText: {
    fontSize: 14,
    color: COLORS.gray700,
    marginLeft: SPACING.sm,
  },
  freeDeliveryAmount: {
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  summary: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.gray600,
  },
  summaryValue: {
    fontSize: 14,
    color: COLORS.gray900,
    textAlign: 'right',
    marginLeft: SPACING.sm,
  },
  freeText: {
    color: COLORS.success,
    fontWeight: '600',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
});

export default CartScreen;
