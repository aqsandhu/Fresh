import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { OrdersStackParamList, Order } from '@types';
import { COLORS, SPACING, BORDER_RADIUS, ORDER_STATUS_MESSAGES } from '@utils/constants';
import { formatCurrency, formatDateTime, getStatusColor } from '@utils/helpers';
import { Button, ErrorView, LoadingOverlay } from '@components';
import { orderService } from '@services/order.service';

type OrderDetailRouteProp = RouteProp<OrdersStackParamList, 'OrderDetail'>;

export const OrderDetailScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<OrdersStackParamList>>();
  const route = useRoute<OrderDetailRouteProp>();
  const { orderId } = route.params;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    try {
      setError(null);
      const response = await orderService.getOrderById(orderId);
      if (response.success) {
        setOrder(response.data);
      } else {
        setError('Order not found');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleTrackOrder = () => {
    navigation.navigate('TrackOrder', { orderId });
  };

  const handleCancelOrder = async () => {
    try {
      await orderService.cancelOrder(orderId);
      loadOrder();
    } catch (error) {
      console.error('Error cancelling order:', error);
    }
  };

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorView message={error} onRetry={loadOrder} />
      </SafeAreaView>
    );
  }

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingOverlay visible={true} message="Loading..." />
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor(order.status);
  const canCancel = ['pending', 'confirmed'].includes(order.status);
  const canTrack = ['out_for_delivery'].includes(order.status);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Order Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View>
              <Text style={styles.orderId}>Order #{order.orderNumber || order.id.slice(0, 8)}</Text>
              <Text style={styles.orderDate}>
                {formatDateTime(order.createdAt)}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusColor + '20' },
              ]}
            >
              <Text style={[styles.statusText, { color: statusColor }]}>
                {ORDER_STATUS_MESSAGES[order.status]?.en}
              </Text>
            </View>
          </View>
          {canTrack && (
            <TouchableOpacity
              style={styles.trackButton}
              onPress={handleTrackOrder}
            >
              <MaterialIcons name="location-on" size={18} color={COLORS.primary} />
              <Text style={styles.trackButtonText}>Track Order</Text>
              <MaterialIcons name="chevron-right" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          <View style={styles.itemsCard}>
            {order.items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.itemRow,
                  index < order.items.length - 1 && styles.itemRowBorder,
                ]}
              >
                <Image
                  source={{ uri: item.productImage }}
                  style={styles.itemImage}
                />
                <View style={styles.itemDetails}>
                  <Text style={styles.itemName}>{item.productName}</Text>
                  <Text style={styles.itemQuantity}>
                    {item.quantity} x {formatCurrency(item.price)}
                  </Text>
                </View>
                <Text style={styles.itemTotal}>
                  {formatCurrency(item.price * item.quantity)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Delivery Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <View style={styles.addressCard}>
            <MaterialIcons name="location-on" size={24} color={COLORS.primary} />
            <View style={styles.addressContent}>
              <Text style={styles.addressLabel}>{order.address.label}</Text>
              <Text style={styles.addressText}>
                {order.address.fullAddress}
              </Text>
            </View>
          </View>
        </View>

        {/* Delivery Slot */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Time</Text>
          <View style={styles.slotCard}>
            <MaterialIcons name="schedule" size={24} color={COLORS.primary} />
            <Text style={styles.slotText}>{order.deliverySlot.label}</Text>
          </View>
        </View>

        {/* Payment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <View style={styles.paymentCard}>
            <MaterialIcons name="payments" size={24} color={COLORS.primary} />
            <View style={styles.paymentContent}>
              <Text style={styles.paymentMethod}>
                {order.paymentMethod === 'cash'
                  ? 'Cash on Delivery'
                  : order.paymentMethod}
              </Text>
              <Text
                style={[
                  styles.paymentStatus,
                  order.paymentStatus === 'paid' && styles.paymentStatusPaid,
                ]}
              >
                {order.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
              </Text>
            </View>
          </View>
        </View>

        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(order.subtotal)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery</Text>
              <Text style={styles.summaryValue}>
                {order.deliveryCharge === 0
                  ? 'FREE'
                  : formatCurrency(order.deliveryCharge)}
              </Text>
            </View>
            {order.discount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Discount</Text>
                <Text style={[styles.summaryValue, styles.discountValue]}>
                  -{formatCurrency(order.discount)}
                </Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(order.total)}
              </Text>
            </View>
          </View>
        </View>

        {/* Cancel Button */}
        {canCancel && (
          <View style={styles.section}>
            <Button
              title="Cancel Order"
              variant="outline"
              onPress={handleCancelOrder}
            />
          </View>
        )}

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  statusCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderId: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  orderDate: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  trackButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginHorizontal: SPACING.xs,
  },
  section: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: SPACING.md,
  },
  itemsCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  itemImage: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.md,
  },
  itemDetails: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray900,
  },
  itemQuantity: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  addressContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  addressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  addressText: {
    fontSize: 14,
    color: COLORS.gray600,
    marginTop: 2,
    lineHeight: 20,
  },
  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  slotText: {
    fontSize: 14,
    color: COLORS.gray700,
    marginLeft: SPACING.md,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  paymentContent: {
    flex: 1,
    marginLeft: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentMethod: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray900,
  },
  paymentStatus: {
    fontSize: 12,
    color: COLORS.warning,
    fontWeight: '600',
  },
  paymentStatusPaid: {
    color: COLORS.success,
  },
  summaryCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
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
    marginLeft: 8,
  },
  discountValue: {
    color: COLORS.success,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  bottomPadding: {
    height: SPACING.xxl,
  },
});

export default OrderDetailScreen;
