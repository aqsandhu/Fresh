import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { CartStackParamList, DeliverySlot } from '@types';
import { COLORS, SPACING, BORDER_RADIUS, ERROR_MESSAGES } from '@utils/constants';
import { formatCurrency } from '@utils/helpers';
import { Button, ErrorView, LoadingOverlay } from '@components';
import { orderService } from '@services/order.service';
import { cartService } from '@services/cart.service';
import { addressService } from '@services/address.service';
import { useCartStore, useCheckoutStore } from '@store';

type DayTab = 'today' | 'tomorrow';

// Check if a time slot has expired (for today only)
function isSlotExpired(slot: DeliverySlot, isToday: boolean): boolean {
  if (!isToday) return false;
  const now = new Date();
  const [endHour, endMin] = (slot.endTime || '').split(':').map(Number);
  if (isNaN(endHour)) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const endMinutes = endHour * 60 + (endMin || 0);
  return currentMinutes >= endMinutes;
}

function getDateString(day: DayTab): string {
  const d = new Date();
  if (day === 'tomorrow') d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function getDisplayDate(day: DayTab): string {
  const d = new Date();
  if (day === 'tomorrow') d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const TimeSlotScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CartStackParamList>>();
  const [activeDay, setActiveDay] = useState<DayTab>('today');
  const [todaySlots, setTodaySlots] = useState<DeliverySlot[]>([]);
  const [tomorrowSlots, setTomorrowSlots] = useState<DeliverySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliverySettings, setDeliverySettings] = useState<{ base_charge: number; free_delivery_threshold: number }>({ base_charge: 100, free_delivery_threshold: 500 });

  const { selectedSlot, setSelectedSlot, selectedAddress, setSelectedAddress, resetCheckout } = useCheckoutStore();
  const { items, subtotal, clearCart } = useCartStore();

  const loadData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const todayDate = getDateString('today');
      const tomorrowDate = getDateString('tomorrow');

      const [todayRes, tomorrowRes, settingsRes] = await Promise.all([
        orderService.getDeliverySlots(todayDate),
        orderService.getDeliverySlots(tomorrowDate),
        orderService.getDeliverySettings(),
      ]);

      if (todayRes.success) setTodaySlots(todayRes.data);
      if (tomorrowRes.success) setTomorrowSlots(tomorrowRes.data);
      if (settingsRes.success) setDeliverySettings(settingsRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load delivery slots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentSlots = activeDay === 'today' ? todaySlots : tomorrowSlots;
  const isToday = activeDay === 'today';

  const handleSlotSelect = (slot: DeliverySlot) => {
    if (slot.available && !isSlotExpired(slot, isToday)) {
      setSelectedSlot({ ...slot, date: getDateString(activeDay) });
    }
  };

  const handleDayChange = (day: DayTab) => {
    setActiveDay(day);
    if (selectedSlot) {
      const selectedDate = getDateString(day);
      if (selectedSlot.date !== selectedDate) {
        setSelectedSlot(null);
      }
    }
  };

  // Calculate delivery charge based on selected slot and settings
  const getDeliveryCharge = (): number => {
    if (selectedSlot?.isFreeDelivery) return 0;
    if (subtotal() >= deliverySettings.free_delivery_threshold) return 0;
    return deliverySettings.base_charge;
  };

  const deliveryCharge = getDeliveryCharge();
  const orderTotal = subtotal() + deliveryCharge;

  const handlePlaceOrder = async () => {
    if (!selectedAddress || !selectedSlot) {
      Alert.alert('Error', 'Please select delivery address and time slot');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Error', ERROR_MESSAGES.CART_EMPTY);
      return;
    }

    setPlacing(true);

    // Locally-saved addresses have a "local_" prefix — not a valid UUID.
    // Try to sync to the server and use the returned server ID.
    let finalAddressId = selectedAddress.id;
    if (selectedAddress.id.startsWith('local_')) {
      try {
        const syncRes = await addressService.createAddress({
          label: selectedAddress.label,
          fullAddress: selectedAddress.fullAddress,
          latitude: selectedAddress.latitude,
          longitude: selectedAddress.longitude,
          isDefault: selectedAddress.isDefault,
        });
        if (syncRes.success && syncRes.data) {
          setSelectedAddress(syncRes.data);
          finalAddressId = syncRes.data.id;
        } else {
          setPlacing(false);
          Alert.alert('Address Error', syncRes.message || 'Could not save your address. Please try again.');
          return;
        }
      } catch (syncErr: any) {
        setPlacing(false);
        const status = syncErr?.statusCode || syncErr?.response?.status;
        const serverMsg = syncErr?.data?.message || syncErr?.response?.data?.message || syncErr?.message;
        const isNetwork = !status && /network/i.test(String(syncErr?.message || ''));
        if (isNetwork) {
          Alert.alert('Internet Required', 'Your address was saved offline. Please check your internet connection and try again.');
        } else {
          Alert.alert('Address Error', serverMsg || 'Could not save your address. Please try again.');
        }
        return;
      }
    }

    try {
      await cartService.ensureBackendCartSynced();

      const orderData = {
        addressId: finalAddressId,
        deliverySlotId: selectedSlot.id,
        paymentMethod: 'cash_on_delivery' as const,
        notes: undefined,
        // Only send requestedDeliveryDate for tomorrow orders
        requestedDeliveryDate: activeDay === 'tomorrow' ? getDateString('tomorrow') : undefined,
      };

      const response = await orderService.createOrder(orderData);
      if (response.success) {
        const order = response.data.order;
        const slotDate = activeDay === 'today'
          ? 'Today'
          : new Date(getDateString('tomorrow')).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
        await clearCart();
        resetCheckout();
        navigation.navigate('OrderConfirmation', {
          orderId: order.orderNumber || order.id,
          slotLabel: selectedSlot.label,
          slotDate,
        });
      } else {
        Alert.alert('Order Failed', response.message || 'Failed to place order. Please try again.');
      }
    } catch (error: any) {
      let errorMessage = ERROR_MESSAGES.SOMETHING_WRONG;
      if (error?.response?.status === 401) {
        errorMessage = 'Your session has expired. Please login again.';
      } else if (error?.response?.status === 400) {
        errorMessage = error.response?.data?.message || 'Invalid order details. Please check and try again.';
      } else if (error?.message?.includes('Network Error')) {
        errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      Alert.alert('Order Failed', errorMessage, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retry', onPress: handlePlaceOrder },
      ]);
    } finally {
      setPlacing(false);
    }
  };

  const renderSlot = (slot: DeliverySlot) => {
    const expired = isSlotExpired(slot, isToday);
    const isSelected = selectedSlot?.id === slot.id && selectedSlot?.date === getDateString(activeDay);
    const isDisabled = !slot.available || expired;

    return (
      <TouchableOpacity
        key={slot.id}
        style={[
          styles.slotCard,
          isSelected && styles.slotCardSelected,
          isDisabled && styles.slotCardDisabled,
        ]}
        onPress={() => handleSlotSelect(slot)}
        disabled={isDisabled}
        activeOpacity={0.7}
      >
        <View style={styles.slotContent}>
          <MaterialIcons
            name="schedule"
            size={18}
            color={isSelected ? COLORS.primary : isDisabled ? COLORS.gray400 : COLORS.gray600}
          />
          <Text
            style={[
              styles.slotTimeText,
              isSelected && styles.slotTimeTextSelected,
              isDisabled && styles.slotTimeTextDisabled,
            ]}
          >
            {slot.label}
          </Text>
        </View>
        <View style={styles.slotRight}>
          {slot.isFreeDelivery && !isDisabled && (
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>Free Delivery</Text>
            </View>
          )}
          {isSelected && (
            <MaterialIcons name="check-circle" size={22} color={COLORS.primary} />
          )}
          {expired && (
            <Text style={styles.expiredText}>Passed</Text>
          )}
          {!slot.available && !expired && (
            <Text style={styles.fullText}>Full</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorView message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LoadingOverlay visible={placing} message="Placing your order..." />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Delivery Time & Payment</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress: 2 steps */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressStep, styles.progressStepDone]} />
        <View style={[styles.progressLine, styles.progressLineDone]} />
        <View style={[styles.progressStep, styles.progressStepActive]} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Day Tabs */}
        <Text style={styles.sectionTitle}>Select Delivery Day</Text>
        <View style={styles.dayTabs}>
          <TouchableOpacity
            style={[styles.dayTab, activeDay === 'today' && styles.dayTabActive]}
            onPress={() => handleDayChange('today')}
          >
            <MaterialIcons name="today" size={20} color={activeDay === 'today' ? '#fff' : COLORS.gray600} />
            <Text style={[styles.dayTabText, activeDay === 'today' && styles.dayTabTextActive]}>Today</Text>
            <Text style={[styles.dayTabDate, activeDay === 'today' && styles.dayTabDateActive]}>{getDisplayDate('today')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dayTab, activeDay === 'tomorrow' && styles.dayTabActive]}
            onPress={() => handleDayChange('tomorrow')}
          >
            <MaterialIcons name="event" size={20} color={activeDay === 'tomorrow' ? '#fff' : COLORS.gray600} />
            <Text style={[styles.dayTabText, activeDay === 'tomorrow' && styles.dayTabTextActive]}>Tomorrow</Text>
            <Text style={[styles.dayTabDate, activeDay === 'tomorrow' && styles.dayTabDateActive]}>{getDisplayDate('tomorrow')}</Text>
          </TouchableOpacity>
        </View>

        {/* Time Slots */}
        <Text style={styles.sectionTitle}>Select Time Slot</Text>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : currentSlots.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="event-busy" size={48} color={COLORS.gray400} />
            <Text style={styles.emptyText}>No time slots available for this day</Text>
          </View>
        ) : (
          <View style={styles.slotsContainer}>
            {currentSlots.map(renderSlot)}
          </View>
        )}

        {/* Payment Method */}
        <Text style={styles.sectionTitle}>Payment Method</Text>
        <View style={styles.paymentCard}>
          <View style={styles.paymentIcon}>
            <MaterialIcons name="payments" size={28} color={COLORS.primary} />
          </View>
          <View style={styles.paymentInfo}>
            <Text style={styles.paymentTitle}>Cash on Delivery</Text>
            <Text style={styles.paymentSubtitle}>Pay when you receive your order</Text>
          </View>
          <MaterialIcons name="check-circle" size={24} color={COLORS.primary} />
        </View>

        {/* Order Summary */}
        <Text style={styles.sectionTitle}>Order Summary</Text>
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal ({items.length} items)</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal())}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery Charge</Text>
            <Text style={[styles.summaryValue, deliveryCharge === 0 && styles.freeText]}>
              {deliveryCharge === 0 ? 'FREE' : formatCurrency(deliveryCharge)}
            </Text>
          </View>
          {deliveryCharge === 0 && selectedSlot?.isFreeDelivery && (
            <Text style={styles.freeNote}>Free delivery on this time slot!</Text>
          )}
          {deliveryCharge === 0 && !selectedSlot?.isFreeDelivery && subtotal() >= deliverySettings.free_delivery_threshold && (
            <Text style={styles.freeNote}>Free delivery on orders above {formatCurrency(deliverySettings.free_delivery_threshold)}</Text>
          )}
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(orderTotal)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Place Order Button */}
      <View style={styles.footer}>
        <Button
          title={`Place Order - ${formatCurrency(orderTotal)}`}
          onPress={handlePlaceOrder}
          disabled={!selectedSlot || placing}
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
    paddingHorizontal: SPACING.xl * 2,
    paddingBottom: SPACING.md,
  },
  progressStep: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.gray300,
  },
  progressStepDone: {
    backgroundColor: COLORS.success,
  },
  progressStepActive: {
    backgroundColor: COLORS.primary,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: COLORS.primaryLighter,
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.gray200,
    marginHorizontal: SPACING.sm,
  },
  progressLineDone: {
    backgroundColor: COLORS.success,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: SPACING.md,
    marginTop: SPACING.md,
  },
  dayTabs: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  dayTab: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.gray50,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 4,
  },
  dayTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  dayTabText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  dayTabTextActive: {
    color: '#fff',
  },
  dayTabDate: {
    fontSize: 12,
    color: COLORS.gray500,
  },
  dayTabDateActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  loadingContainer: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: SPACING.sm,
  },
  slotsContainer: {
    gap: SPACING.sm,
  },
  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  slotCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
  },
  slotCardDisabled: {
    opacity: 0.45,
    backgroundColor: COLORS.gray100,
  },
  slotContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  slotTimeText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.gray700,
  },
  slotTimeTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  slotTimeTextDisabled: {
    color: COLORS.gray400,
  },
  slotRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  freeBadge: {
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  freeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.success,
  },
  expiredText: {
    fontSize: 12,
    color: COLORS.gray400,
    fontWeight: '500',
  },
  fullText: {
    fontSize: 12,
    color: COLORS.error,
    fontWeight: '500',
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLighter,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  paymentIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  paymentSubtitle: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
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
  freeNote: {
    fontSize: 12,
    color: COLORS.success,
    marginBottom: SPACING.sm,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: 0,
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

export default TimeSlotScreen;
