import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { CartStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS, ERROR_MESSAGES } from '@utils/constants';
import { formatCurrency } from '@utils/helpers';
import { Button, LoadingOverlay } from '@components';
import { useCartStore, useCheckoutStore } from '@store';
import { orderService } from '@services/order.service';
import { cartService } from '@services/cart.service';

export const PaymentScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CartStackParamList>>();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'wallet'>('cash');
  
  const { items, subtotal, deliveryCharge, total, clearCart } = useCartStore();
  const { selectedAddress, selectedSlot, resetCheckout } = useCheckoutStore();

  const paymentMethods = [
    {
      id: 'cash' as const,
      title: 'Cash on Delivery',
      subtitle: 'Pay when you receive',
      icon: 'payments',
    },
    {
      id: 'card' as const,
      title: 'Credit/Debit Card',
      subtitle: 'Coming soon',
      icon: 'credit-card',
      disabled: true,
    },
    {
      id: 'wallet' as const,
      title: 'Digital Wallet',
      subtitle: 'Coming soon',
      icon: 'account-balance-wallet',
      disabled: true,
    },
  ];

  const handlePlaceOrder = async () => {
    if (!selectedAddress || !selectedSlot) {
      Alert.alert('Error', 'Please select delivery address and time slot');
      return;
    }

    if (items.length === 0) {
      Alert.alert('Error', ERROR_MESSAGES.CART_EMPTY);
      return;
    }

    setLoading(true);
    try {
      // Sync local cart to backend before creating order
      await cartService.ensureBackendCartSynced();

      const orderData = {
        addressId: selectedAddress.id,
        deliverySlotId: selectedSlot.id,
        paymentMethod: paymentMethod === 'cash' ? 'cash_on_delivery' as const : paymentMethod as any,
        notes: undefined,
      };

      const response = await orderService.createOrder(orderData);
      if (response.success) {
        await clearCart();
        resetCheckout();
        navigation.navigate('OrderConfirmation', { orderId: response.data.order.id });
      } else {
        Alert.alert(
          'Order Failed',
          response.message || 'Failed to place order. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      console.error('Order failed:', error);
      
      // Handle specific error types
      let errorMessage = ERROR_MESSAGES.SOMETHING_WRONG;
      
      if (error?.response?.status === 401) {
        errorMessage = 'Your session has expired. Please login again.';
      } else if (error?.response?.status === 400) {
        errorMessage = error.response?.data?.message || 'Invalid order details. Please check and try again.';
      } else if (error?.response?.status === 503) {
        errorMessage = 'Service temporarily unavailable. Please try again later.';
      } else if (error?.message?.includes('Network Error')) {
        errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      Alert.alert(
        'Order Failed',
        errorMessage,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: handlePlaceOrder },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LoadingOverlay visible={loading} message="Placing your order..." />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Payment</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressStep, styles.progressStepActive]} />
        <View style={[styles.progressLine, styles.progressLineActive]} />
        <View style={[styles.progressStep, styles.progressStepActive]} />
        <View style={[styles.progressLine, styles.progressLineActive]} />
        <View style={[styles.progressStep, styles.progressStepActive]} />
      </View>

      <View style={styles.content}>
        {/* Payment Methods */}
        <Text style={styles.sectionTitle}>Select Payment Method</Text>
        <View style={styles.methodsContainer}>
          {paymentMethods.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.methodCard,
                paymentMethod === method.id && styles.methodCardSelected,
                method.disabled && styles.methodCardDisabled,
              ]}
              onPress={() => !method.disabled && setPaymentMethod(method.id)}
              disabled={method.disabled}
            >
              <View style={styles.methodIcon}>
                <MaterialIcons
                  name={method.icon as any}
                  size={28}
                  color={
                    method.disabled
                      ? COLORS.gray400
                      : paymentMethod === method.id
                      ? COLORS.primary
                      : COLORS.gray600
                  }
                />
              </View>
              <View style={styles.methodInfo}>
                <Text
                  style={[
                    styles.methodTitle,
                    method.disabled && styles.methodTextDisabled,
                    paymentMethod === method.id && styles.methodTitleSelected,
                  ]}
                >
                  {method.title}
                </Text>
                <Text
                  style={[
                    styles.methodSubtitle,
                    method.disabled && styles.methodTextDisabled,
                  ]}
                >
                  {method.subtitle}
                </Text>
              </View>
              {paymentMethod === method.id && (
                <MaterialIcons name="check-circle" size={24} color={COLORS.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Order Summary */}
        <View style={styles.summary}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal())}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery</Text>
            <Text style={styles.summaryValue}>
              {deliveryCharge() === 0 ? 'FREE' : formatCurrency(deliveryCharge())}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(total())}</Text>
          </View>
        </View>
      </View>

      {/* Place Order Button */}
      <View style={styles.footer}>
        <Button
          title={`Place Order - ${formatCurrency(total())}`}
          onPress={handlePlaceOrder}
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
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  progressStep: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.gray300,
  },
  progressStepActive: {
    backgroundColor: COLORS.primary,
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.gray200,
    marginHorizontal: SPACING.sm,
  },
  progressLineActive: {
    backgroundColor: COLORS.primary,
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: SPACING.md,
  },
  methodsContainer: {
    marginBottom: SPACING.lg,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  methodCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
  },
  methodCardDisabled: {
    opacity: 0.5,
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  methodTitleSelected: {
    color: COLORS.primary,
  },
  methodSubtitle: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  methodTextDisabled: {
    color: COLORS.gray400,
  },
  summary: {
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
    fontSize: 14,
    color: COLORS.gray600,
  },
  summaryValue: {
    fontSize: 14,
    color: COLORS.gray900,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
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
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
});

export default PaymentScreen;
