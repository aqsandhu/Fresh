import { asCaughtError } from '@/lib/caughtError';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { Address, CartStackParamList, RootStackParamList } from '@app-types';
import { DeliverySlotWithCapacity } from '@services/order.service';
import { COLORS, SPACING, BORDER_RADIUS, ERROR_MESSAGES } from '@utils/constants';
import { styles } from './CheckoutScreen.styles';
import {
  formatCurrency,
  formatProductUnitSuffix,
  formatSlotTimeRange,
} from '@utils/helpers';
import { resolveLineUnitPrice, unitLabelShort, unitPriceCaption } from '@/lib/unitPricing';
import { addressMatchesSelectedCity } from '@/lib/cityStorage';
import { useOptionalCityName } from '@/context/CityContext';
import { getSelectedCityId } from '@/lib/cityStorage';
import { Button } from '@components';
import { CartSummaryRows } from '@components/cart/CartSummaryRows';
import {
  CheckoutAddressForm,
  CheckoutAddressFormHandle,
} from '@components/checkout/CheckoutAddressForm';
import { CheckoutAddressActions } from '@components/checkout/CheckoutAddressActions';
import { CheckoutAuthPanel } from '@components/checkout/CheckoutAuthPanel';
import { addressService } from '@services/address.service';
import { orderService } from '@services/order.service';
import { cartService, type MyCoupon } from '@services/cart.service';
import { GuidanceTips } from '@components/common/GuidanceTips';
import { CHECKOUT_TIPS } from '@/content/guidanceTips';
import apiClient from '@services/api';
import { useCartStore, useAuthStore } from '@store';
import { getSlotAvailability } from '@/lib/timeSlots';
import { formatAddressLine, addressTypeLabel } from '@/lib/addressDisplay';
import { pktDateString, pktDisplayDate, pktWallClock } from '@/lib/businessDate';

type DayTab = 'today' | 'tomorrow';

export const CheckoutScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CartStackParamList>>();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width: windowWidth } = useWindowDimensions();
  const slotColumns = windowWidth >= 640 ? 2 : 1;
  const slotCardWidth = slotColumns === 1 ? '100%' : '48%';
  const cityName = useOptionalCityName() || 'Your City';
  const newAddressFormRef = useRef<CheckoutAddressFormHandle>(null);

  const { items, subtotal, getDeliveryCharge, loadDeliverySettings, clearCart, hasHydrated, deliverySlotCutoffPercent, syncWithBackend } =
    useCartStore();
  const { isAuthenticated } = useAuthStore();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newAddressValid, setNewAddressValid] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [activeDay, setActiveDay] = useState<DayTab>('today');
  const [timeSlots, setTimeSlots] = useState<DeliverySlotWithCapacity[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [serverSubtotal, setServerSubtotal] = useState<number | null>(null);
  const [serverDeliveryCharge, setServerDeliveryCharge] = useState<number | null>(null);
  const [cartSynced, setCartSynced] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<{
    id: string;
    orderNumber?: string;
    total?: number;
  } | null>(null);

  // Coupon (preview only — the server recomputes it authoritatively at order
  // placement, so the displayed total matches what gets charged).
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount_type: string;
    discount_amount: number;
    free_delivery: boolean;
    summary: string;
  } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [myCoupons, setMyCoupons] = useState<MyCoupon[]>([]);

  // Urgent (on-demand) delivery — a flat super-admin rate instead of a slot.
  // Ignores free delivery + coupons (handled below).
  const [urgent, setUrgent] = useState(false);
  const [urgentInfo, setUrgentInfo] = useState<{ charge: number; eta: string; enabled: boolean }>({
    charge: 0, eta: '', enabled: false,
  });

  useEffect(() => {
    orderService.getDeliverySettings().then((res) => {
      const charge = Number(res.data?.urgent_charge) || 0;
      setUrgentInfo({ charge, eta: String(res.data?.urgent_eta || ''), enabled: charge > 0 });
    });
  }, []);

  const selectedSlot = timeSlots.find((s) => s.id === selectedSlotId);
  const isFreeDeliverySlot = selectedSlot?.isFreeDelivery === true;
  const localSubtotal = subtotal();
  const sub = serverSubtotal ?? localSubtotal;
  const localDelivery = getDeliveryCharge(isFreeDeliverySlot);
  const deliveryCharge = serverDeliveryCharge ?? localDelivery;
  const couponFreeDelivery = appliedCoupon?.free_delivery === true;
  const couponProductDiscount =
    !urgent && appliedCoupon && !couponFreeDelivery
      ? Math.min(Number(appliedCoupon.discount_amount) || 0, sub)
      : 0;
  const effectiveDelivery = urgent
    ? urgentInfo.charge
    : couponFreeDelivery
    ? 0
    : deliveryCharge;
  const total = Math.max(0, sub + effectiveDelivery - couponProductDiscount);
  const canPlaceOrder = Boolean(selectedAddressId) || (showNewAddress && newAddressValid);

  const applyCouponCode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      // Validate against the live cart: push the store (source of truth) first.
      await syncWithBackend();
      const result = await cartService.applyCoupon(trimmed);
      setAppliedCoupon(result);
    } catch (errCaught: unknown) {
      const err = asCaughtError(errCaught);
      setAppliedCoupon(null);
      setCouponError(err?.message || 'Invalid coupon code');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleApplyCoupon = () => applyCouponCode(couponInput);

  const handleRemoveCoupon = async () => {
    await cartService.removeCoupon();
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError('');
  };

  // Load the customer's auto-granted coupons so they can pick one at checkout.
  // Re-run when the customer signs in on this screen (the inline panel): as
  // a guest these calls return nothing, and they used to run only once — so a
  // guest who signed in at checkout saw no saved addresses, no coupons and
  // no server totals.
  useEffect(() => {
    if (!isAuthenticated) return;
    cartService.getMyCoupons().then((res) => setMyCoupons(res.coupons || []));
  }, [isAuthenticated]);

  const loadAddresses = useCallback(async () => {
    setLoadingAddresses(true);
    try {
      const res = await addressService.getAddresses();
      const list = res.success ? res.data ?? [] : [];
      const filtered = cityName
        ? list.filter((a) => addressMatchesSelectedCity(a.city, cityName))
        : list;
      setAddresses(filtered);
      const def = filtered.find((a) => a.isDefault) || filtered[0];
      if (def) setSelectedAddressId(def.id);
      if (filtered.length === 0) setShowNewAddress(true);
    } catch {
      setAddresses([]);
      setShowNewAddress(true);
    } finally {
      setLoadingAddresses(false);
    }
  }, [cityName]);

  const loadTimeSlots = useCallback(async (day: DayTab) => {
    setLoadingSlots(true);
    setSelectedSlotId('');
    try {
      const res = await orderService.getDeliverySlots(pktDateString(day));
      const slots = res.success ? res.data ?? [] : [];
      setTimeSlots(slots);
      const firstAvailable = slots.find((slot) => {
        // A FULL slot was pre-selected too (only expiry was checked), so the
        // order was refused with "no longer available" (I9).
        if ((slot.available_slots ?? 1) <= 0) return false;
        const availability = getSlotAvailability(
          {
            id: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            start_time: slot.startTime,
            end_time: slot.endTime,
          },
          day,
          deliverySlotCutoffPercent,
          pktWallClock()
        );
        return !availability.unavailable;
      });
      if (firstAvailable) setSelectedSlotId(firstAvailable.id);
    } catch {
      setTimeSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [deliverySlotCutoffPercent]);

  const syncCartToServer = useCallback(async () => {
    if (items.length === 0 || cartSynced) return;
    try {
      // ONE atomic request — replaces the old clear + per-item POST loop.
      const cityId = await getSelectedCityId();
      const res = await apiClient.post('/cart/sync', {
        ...(cityId ? { city_id: cityId } : {}),
        items: items.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit: item.unit || 'full',
          quality: item.quality || 'A',
        })),
      });
      const cart = res.data?.data?.cart || res.data?.cart;
      if (cart?.subtotal != null) {
        setServerSubtotal(parseFloat(String(cart.subtotal)));
      }
      setCartSynced(true);
    } catch {
      setCartSynced(true);
    }
  }, [items, cartSynced]);

  const refetchDeliveryCharge = useCallback(async (slotId: string) => {
    if (!slotId) {
      setServerDeliveryCharge(null);
      return;
    }
    setDeliveryLoading(true);
    try {
      const delRes = await apiClient.post('/cart/delivery-charge', { time_slot_id: slotId });
      const delData = delRes.data?.data || delRes.data;
      if (delData?.delivery_charge != null) {
        setServerDeliveryCharge(parseFloat(String(delData.delivery_charge)));
      } else {
        setServerDeliveryCharge(null);
      }
    } catch {
      setServerDeliveryCharge(null);
    } finally {
      setDeliveryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTimeSlots('today');
    loadDeliverySettings();
  }, [loadTimeSlots, loadDeliverySettings]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadAddresses();
    // The cart was "synced" while still a guest (the call failed): push it
    // again now that it belongs to an account, so server totals appear.
    setCartSynced(false);
  }, [isAuthenticated, loadAddresses]);

  useFocusEffect(
    useCallback(() => {
      setCartSynced(false);
      setServerSubtotal(null);
      setServerDeliveryCharge(null);
    }, [])
  );

  useEffect(() => {
    if (items.length > 0 && !cartSynced) syncCartToServer();
  }, [items.length, cartSynced, syncCartToServer]);

  useEffect(() => {
    if (cartSynced && selectedSlotId) refetchDeliveryCharge(selectedSlotId);
  }, [cartSynced, selectedSlotId, refetchDeliveryCharge]);

  useEffect(() => {
    if (hasHydrated && items.length === 0 && !orderPlaced) {
      rootNav.goBack();
    }
  }, [hasHydrated, items.length, orderPlaced, rootNav]);

  const handleDayChange = (day: DayTab) => {
    setActiveDay(day);
    loadTimeSlots(day);
  };

  const syncCartBeforeOrder = async () => {
    // Atomic replace right before order placement — a mid-loop failure in
    // the old version could place an order against a half-synced cart.
    const cityId = await getSelectedCityId();
    await apiClient.post('/cart/sync', {
      ...(cityId ? { city_id: cityId } : {}),
      items: items.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit: item.unit || 'full',
        quality: item.quality || 'A',
      })),
    });
  };

  const handlePlaceOrder = async () => {
    if (!urgent && !selectedSlotId) {
      Toast.show({ type: 'error', text1: 'Please select a delivery time slot' });
      return;
    }

    const selectedSlotForOrder = timeSlots.find((s) => s.id === selectedSlotId);
    if (
      !urgent &&
      selectedSlotForOrder &&
      ((selectedSlotForOrder.available_slots ?? 0) <= 0 ||
        getSlotAvailability(
          {
            id: selectedSlotForOrder.id,
            startTime: selectedSlotForOrder.startTime,
            endTime: selectedSlotForOrder.endTime,
          },
          activeDay,
          deliverySlotCutoffPercent,
          pktWallClock()
        ).unavailable)
    ) {
      Toast.show({
        type: 'error',
        text1: 'Selected time slot is no longer available. Please pick another.',
      });
      return;
    }

    if (items.length === 0) {
      Toast.show({ type: 'error', text1: ERROR_MESSAGES.CART_EMPTY });
      return;
    }

    let addressIdToUse = selectedAddressId;

    if (showNewAddress) {
      if (!newAddressFormRef.current) {
        Toast.show({ type: 'error', text1: 'Please add a delivery address' });
        return;
      }
      if (!newAddressValid) {
        Toast.show({
          type: 'error',
          text1: 'Please enter your full delivery address (at least 5 characters)',
        });
        return;
      }
      setPlacing(true);
      const saved = await newAddressFormRef.current.submit();
      if (!saved?.id) {
        setPlacing(false);
        return;
      }
      addressIdToUse = saved.id;
      setAddresses((prev) => {
        const exists = prev.some((a) => a.id === saved.id);
        return exists ? prev.map((a) => (a.id === saved.id ? saved : a)) : [...prev, saved];
      });
      setSelectedAddressId(saved.id);
    } else if (!addressIdToUse) {
      Toast.show({ type: 'error', text1: 'Please select a delivery address' });
      return;
    }

    // local_* ids exist only on-device (saved during a network outage) — the
    // backend cannot resolve them. Force the user to re-save the address
    // online instead of sending a guaranteed-failing order.
    if (addressIdToUse.startsWith('local_')) {
      Toast.show({
        type: 'error',
        text1:
          'This address was saved offline. Please re-add it while online, then place your order.',
      });
      return;
    }

    setPlacing(true);
    try {
      await syncCartBeforeOrder();

      const body: Record<string, string> = {
        address_id: addressIdToUse,
        payment_method: 'cash_on_delivery',
        customer_notes: '',
      };
      const cityId = await getSelectedCityId();
      if (cityId) body.city_id = cityId;
      if (urgent) {
        body.urgent_delivery = 'true';
      } else {
        if (activeDay === 'tomorrow') body.requested_delivery_date = pktDateString('tomorrow');
        if (selectedSlotId) body.time_slot_id = selectedSlotId;
      }

      const res = await apiClient.post('/orders', body);
      const orderData = res.data?.data || res.data;
      const order = orderData?.order || orderData;

      setPlacedOrder({
        id: order?.id || '',
        orderNumber: order?.order_number,
        total: order?.total_amount != null ? parseFloat(String(order.total_amount)) : total,
      });
      setOrderPlaced(true);
      await clearCart();
    } catch (errCaught: unknown) {
      const err = asCaughtError(errCaught);
      Toast.show({
        type: 'error',
        text1:
          err?.response?.data?.message ||
          err?.message ||
          'Failed to place order. Please try again.',
      });
    } finally {
      setPlacing(false);
    }
  };

  if (!hasHydrated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.hydrateLoader}>
          <ActivityIndicator size="large" color={COLORS.primary600} />
        </View>
      </SafeAreaView>
    );
  }

  // Website parity: guests are NOT bounced to a login screen. They stay on
  // checkout and sign in via the inline panel; the real checkout appears the
  // moment they authenticate.
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>Checkout</Text>
          <CheckoutAuthPanel />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Checkout</Text>
        <GuidanceTips tips={CHECKOUT_TIPS} page="checkout" />

        {/* Address */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIcon}>
              <MaterialIcons name="location-on" size={20} color={COLORS.primary600} />
            </View>
            <Text style={styles.sectionTitle}>Delivery Address</Text>
          </View>
          {loadingAddresses ? (
            <View style={styles.sectionLoader}>
              <ActivityIndicator color={COLORS.primary600} size="small" />
            </View>
          ) : (
            <>
              {addresses.length > 0 && (
                <View style={styles.addressList}>
                  {addresses.map((addr) => (
                    <View
                      key={addr.id}
                      style={[
                        styles.addressCard,
                        selectedAddressId === addr.id && styles.addressCardActive,
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.addressSelectRow}
                        onPress={() => {
                          setSelectedAddressId(addr.id);
                          setShowNewAddress(false);
                        }}
                      >
                        <MaterialIcons
                          name={
                            selectedAddressId === addr.id
                              ? 'radio-button-checked'
                              : 'radio-button-unchecked'
                          }
                          size={22}
                          color={
                            selectedAddressId === addr.id ? COLORS.primary600 : COLORS.gray400
                          }
                        />
                        <View style={styles.addressContent}>
                          <View style={styles.addressLabelRow}>
                            <Text style={styles.addressLabel}>{addressTypeLabel(addr)}</Text>
                            {addr.isDefault && (
                              <View style={styles.defaultBadge}>
                                <Text style={styles.defaultBadgeText}>Default</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.addressText}>{formatAddressLine(addr)}</Text>
                        </View>
                      </TouchableOpacity>
                      <CheckoutAddressActions
                        address={addr}
                        cityName={cityName}
                        onUpdated={(updated) => {
                          setAddresses((prev) =>
                            prev.map((a) => (a.id === updated.id ? updated : a))
                          );
                        }}
                        onDeleted={(deletedId) => {
                          setAddresses((prev) => {
                            const next = prev.filter((a) => a.id !== deletedId);
                            if (selectedAddressId === deletedId) {
                              const fallback = next.find((a) => a.isDefault) || next[0];
                              setSelectedAddressId(fallback?.id || '');
                              if (next.length === 0) setShowNewAddress(true);
                            }
                            return next;
                          });
                        }}
                      />
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={styles.addAddressLink}
                onPress={() => {
                  const next = !showNewAddress;
                  setShowNewAddress(next);
                  if (next) setSelectedAddressId('');
                }}
              >
                <MaterialIcons name="add" size={20} color={COLORS.primary600} />
                <Text style={styles.addAddressText}>Add New Address</Text>
              </TouchableOpacity>

              {showNewAddress && (
                <View style={styles.newAddressWrap}>
                  <CheckoutAddressForm
                    ref={newAddressFormRef}
                    cityName={cityName}
                    defaultOnCreate={addresses.length === 0}
                    hideSubmitButton={false}
                    onValidityChange={setNewAddressValid}
                    onSaved={(saved) => {
                      setAddresses((prev) => {
                        const exists = prev.some((a) => a.id === saved.id);
                        return exists
                          ? prev.map((a) => (a.id === saved.id ? saved : a))
                          : [...prev, saved];
                      });
                      setSelectedAddressId(saved.id);
                      setShowNewAddress(false);
                    }}
                    onCancel={addresses.length > 0 ? () => setShowNewAddress(false) : undefined}
                  />
                  <Text style={styles.addressTip}>
                    Door photo, map pin, and address text are saved when you press{' '}
                    <Text style={styles.addressTipBold}>Place Order</Text> — no need to tap Done on the
                    map or Save here.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Time slots */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIcon}>
              <MaterialIcons name="schedule" size={20} color={COLORS.primary600} />
            </View>
            <Text style={styles.sectionTitle}>Delivery Time</Text>
          </View>

          {urgentInfo.enabled && (
            <TouchableOpacity
              onPress={() => setUrgent((v) => !v)}
              activeOpacity={0.85}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderWidth: 2,
                borderColor: urgent ? '#f59e0b' : COLORS.gray200,
                backgroundColor: urgent ? '#fffbeb' : COLORS.white,
                borderRadius: BORDER_RADIUS.xl,
                padding: SPACING.md,
                marginBottom: urgent ? SPACING.xs : SPACING.md,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <MaterialIcons name="bolt" size={22} color={urgent ? '#d97706' : COLORS.gray400} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: COLORS.gray900 }}>Urgent delivery</Text>
                  <Text style={{ fontSize: 12, color: COLORS.gray500 }}>
                    {urgentInfo.eta ? `Approx. ${urgentInfo.eta}` : 'Fastest available'} · no time slot
                  </Text>
                </View>
              </View>
              <Text style={{ fontWeight: '700', color: '#d97706' }}>{formatCurrency(urgentInfo.charge)}</Text>
            </TouchableOpacity>
          )}
          {urgent && (
            <Text style={{ fontSize: 12, color: '#b45309', marginBottom: SPACING.md }}>
              Free delivery offers and coupons don&apos;t apply to urgent delivery.
            </Text>
          )}

          {!urgent && (
          <>
          <Text style={styles.slotsHeading}>
            {activeDay === 'today' ? 'Today available time slots' : 'Tomorrow time slots'}
          </Text>
          {loadingSlots ? (
            <View style={styles.sectionLoader}>
              <ActivityIndicator color={COLORS.primary600} size="small" />
            </View>
          ) : timeSlots.length === 0 ? (
            <Text style={styles.noSlotsText}>
              No time slots available for {activeDay === 'today' ? 'today' : 'tomorrow'}
            </Text>
          ) : (
            <View style={styles.slotGrid}>
              {timeSlots.map((slot) => {
                const availability = getSlotAvailability(
                  { id: slot.id, startTime: slot.startTime, endTime: slot.endTime },
                  activeDay,
                  deliverySlotCutoffPercent,
                  pktWallClock()
                );
                const availableSlots = slot.available_slots ?? 0;
                const disabled = availableSlots <= 0 || availability.unavailable;
                const selected = selectedSlotId === slot.id;
                const slotLabel = formatSlotTimeRange(slot.startTime, slot.endTime);
                return (
                  <TouchableOpacity
                    key={slot.id}
                    style={[
                      styles.slotCard,
                      { width: slotCardWidth },
                      selected && styles.slotCardActive,
                      disabled && styles.slotDisabled,
                    ]}
                    onPress={() => !disabled && setSelectedSlotId(slot.id)}
                    disabled={disabled}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name="schedule"
                      size={22}
                      color={disabled ? COLORS.gray400 : COLORS.primary600}
                      style={{ marginBottom: 6 }}
                    />
                    <Text style={[styles.slotLabel, selected && styles.slotLabelActive]}>{slotLabel}</Text>
                    {slot.isFreeDelivery && !disabled && (
                      <Text style={styles.freeSlotBadge}>FREE DELIVERY</Text>
                    )}
                    {availableSlots <= 0 && <Text style={styles.slotStatusFull}>FULL</Text>}
                    {availability.unavailable && availableSlots > 0 && (
                      <Text style={styles.slotStatus}>
                        {availability.reason === 'expired' ? 'Passed' : 'Unavailable'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <View style={styles.dayTabs}>
            {(['today', 'tomorrow'] as DayTab[]).map((day) => (
              <TouchableOpacity
                key={day}
                style={[styles.dayTab, activeDay === day && styles.dayTabActive]}
                onPress={() => handleDayChange(day)}
              >
                <MaterialIcons
                  name="calendar-today"
                  size={18}
                  color={activeDay === day ? COLORS.primary700 : COLORS.gray500}
                  style={{ marginBottom: 4 }}
                />
                <Text style={[styles.dayTabText, activeDay === day && styles.dayTabTextActive]}>
                  {day === 'today' ? 'Today' : 'Tomorrow'}
                </Text>
                <Text style={[styles.dayTabDate, activeDay === day && styles.dayTabDateActive]}>
                  {pktDisplayDate(day)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          </>
          )}
        </View>

        {/* Payment */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIcon}>
              <MaterialIcons name="credit-card" size={20} color={COLORS.primary600} />
            </View>
            <Text style={styles.sectionTitle}>Payment Method</Text>
          </View>
          <View style={styles.paymentCard}>
            <View style={styles.codBadge}>
              <Text style={styles.codBadgeText}>COD</Text>
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={styles.paymentTitle}>Cash on Delivery</Text>
              <Text style={styles.paymentSub}>Pay when you receive your order</Text>
            </View>
            <MaterialIcons name="check" size={22} color={COLORS.primary600} />
          </View>
        </View>

        {/* Order summary — Place Order lives here (website mobile pattern) */}
        <View style={styles.section}>
          <Text style={styles.summaryHeading}>Order Summary</Text>

          <ScrollView style={styles.itemsList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {items.map((item) => {
              const unit = item.unit || 'full';
              const unitSuffix = unitLabelShort(unit);
              const linePrice = resolveLineUnitPrice(item);
              const caption = unitPriceCaption(unit);
              const imageUri = item.product.images?.[0] || item.product.imageUrl;
              return (
                <View key={`${item.product.id}::${unit}`} style={styles.lineItem}>
                  <View style={styles.lineThumb}>
                    {imageUri ? (
                      <Image source={{ uri: imageUri }} style={styles.lineImage} />
                    ) : (
                      <MaterialIcons name="shopping-bag" size={20} color={COLORS.gray400} />
                    )}
                  </View>
                  <View style={styles.lineContent}>
                    <Text style={styles.lineName} numberOfLines={2}>
                      {item.product.name}
                      {unitSuffix ? (
                        <Text style={styles.lineUnitSuffix}> ({unitSuffix})</Text>
                      ) : null}
                    </Text>
                    <Text style={styles.lineMeta}>
                      {item.quantity} x {formatCurrency(linePrice)}
                      {unit === 'full' ? (
                        <Text style={styles.lineMetaMuted}>
                          {formatProductUnitSuffix(item.product.unit)}
                        </Text>
                      ) : caption ? (
                        <Text style={styles.lineMetaCaption}> {caption}</Text>
                      ) : null}
                    </Text>
                  </View>
                  <Text style={styles.linePrice}>{formatCurrency(linePrice * item.quantity)}</Text>
                </View>
              );
            })}
          </ScrollView>

          {/* Coupon */}
          <View style={styles.couponBox}>
            {appliedCoupon ? (
              <View style={styles.couponApplied}>
                <View style={styles.couponAppliedInfo}>
                  <Text style={styles.couponAppliedTitle}>
                    <MaterialIcons name="local-offer" size={13} color={COLORS.success} />{' '}
                    {appliedCoupon.code} applied
                  </Text>
                  {!!appliedCoupon.summary && (
                    <Text style={styles.couponAppliedSummary}>{appliedCoupon.summary}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={handleRemoveCoupon} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={COLORS.success} />
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.couponLabel}>
                  <MaterialIcons name="local-offer" size={14} color={COLORS.primary600} /> Have a coupon?
                </Text>
                <View style={styles.couponRow}>
                  <TextInput
                    value={couponInput}
                    onChangeText={(t) => {
                      setCouponInput(t.toUpperCase());
                      if (couponError) setCouponError('');
                    }}
                    placeholder="Enter code"
                    placeholderTextColor={COLORS.gray400}
                    autoCapitalize="characters"
                    style={styles.couponInput}
                    onSubmitEditing={handleApplyCoupon}
                  />
                  <Button
                    title="Apply"
                    variant="outline"
                    size="small"
                    onPress={handleApplyCoupon}
                    loading={couponLoading}
                    disabled={!couponInput.trim() || couponLoading}
                    style={styles.couponApplyBtn}
                  />
                </View>
                {!!couponError && <Text style={styles.couponError}>{couponError}</Text>}

                {myCoupons.length > 0 && (
                  <View style={styles.myCouponsWrap}>
                    <Text style={styles.myCouponsTitle}>Your coupons</Text>
                    {myCoupons.map((c) => (
                      <TouchableOpacity
                        key={c.code}
                        style={styles.myCouponChip}
                        disabled={couponLoading}
                        onPress={() => {
                          setCouponInput(c.code);
                          applyCouponCode(c.code);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.myCouponInfo}>
                          <Text style={styles.myCouponCode}>{c.code}</Text>
                          <Text style={styles.myCouponSummary}>{c.summary}</Text>
                        </View>
                        <Text style={styles.myCouponApply}>Apply</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.priceBreakdown}>
            <CartSummaryRows
              subtotal={sub}
              deliveryCharge={effectiveDelivery}
              total={total}
              deliveryLoading={deliveryLoading}
              couponCode={appliedCoupon?.code}
              couponDiscount={couponProductDiscount}
              couponFreeDelivery={couponFreeDelivery}
            />
          </View>

          <Button
            title={placing ? 'Placing Order...' : 'Place Order'}
            onPress={handlePlaceOrder}
            size="large"
            disabled={!canPlaceOrder || placing}
            style={styles.placeOrderBtn}
          />
          <Text style={styles.termsNote}>
            By placing this order, you agree to our Terms of Service
          </Text>
        </View>
      </ScrollView>

      {/* Success modal */}
      <Modal visible={orderPlaced} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <MaterialIcons name="check-circle" size={40} color={COLORS.success} />
            </View>
            <Text style={styles.successTitle}>Order placed successfully!</Text>
            <Text style={styles.successSub}>Thank you — your order has been received.</Text>
            {placedOrder?.orderNumber && (
              <Text style={styles.successOrder}>
                Order #{' '}
                <Text style={styles.successOrderBold}>{placedOrder.orderNumber}</Text>
                {placedOrder.total != null && (
                  <>
                    {' '}
                    · Total{' '}
                    <Text style={styles.successOrderBold}>{formatCurrency(placedOrder.total)}</Text>
                  </>
                )}
              </Text>
            )}
            <View style={styles.successActions}>
              <Button
                title="Continue Shopping"
                variant="outline"
                icon={<MaterialIcons name="shopping-bag" size={16} color={COLORS.primary600} />}
                onPress={() => {
                  setOrderPlaced(false);
                  rootNav.navigate('Main', { screen: 'Shop', params: { screen: 'ProductsMain' } });
                }}
                style={{ flex: 1 }}
              />
              <Button
                title="View Order"
                icon={<MaterialIcons name="arrow-forward" size={16} color={COLORS.white} />}
                onPress={() => {
                  setOrderPlaced(false);
                  rootNav.navigate('Main', {
                    screen: 'Orders',
                    params: {
                      screen: 'TrackOrder',
                      params: { orderId: placedOrder?.id || '' },
                    },
                  });
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};


export default CheckoutScreen;
