import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { Button } from '@components';
import { CheckoutMapPicker } from '@components/checkout/CheckoutMapPicker';
import { getRestaurantInfo, restaurantApi, money, round2, type RestaurantInfo } from '@services/restaurant.service';
import { useRestaurantCart } from '@store/restaurantCartStore';
import { getAccuratePosition } from '@/lib/geolocation';
import { DEFAULT_MAP_LAT, DEFAULT_MAP_LNG } from '@/lib/googleMaps';
import { pickDoorPhotoFromLibrary } from '@/lib/pickDoorPhoto';
import { getSlotAvailability } from '@/lib/timeSlots';

function fmtTime(t?: string): string {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  let hh = parseInt(h, 10);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${hh}:${m || '00'} ${ampm}`;
}

function localDateStr(day: 'today' | 'tomorrow'): string {
  const d = new Date();
  if (day === 'tomorrow') d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const RestaurantCheckoutScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { items, subtotal, clear } = useRestaurantCart();
  const [info, setInfo] = useState<RestaurantInfo | null>(null);
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);

  const [delivery, setDelivery] = useState({ base_charge: 100, free_delivery_threshold: 2000, urgent_charge: 0, urgent_eta: '', slot_cutoff_percent: 60 });
  const [slots, setSlots] = useState<any[]>([]);
  const [timeSlotId, setTimeSlotId] = useState('');
  const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today');
  const [ready, setReady] = useState(false);
  const [urgent, setUrgent] = useState(false);

  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pinning, setPinning] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [frontImageUrl, setFrontImageUrl] = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);

  const sub = subtotal();

  useEffect(() => {
    getRestaurantInfo().then((i) => {
      if (!i) { navigation.replace('RestaurantLogin'); return; }
      setInfo(i);
      setAddress(i.address || '');
      setReady(true);
    });
    (async () => {
      try {
        const [d, me] = await Promise.all([
          restaurantApi.getDelivery(),
          restaurantApi.getMe().catch(() => null),
        ]);
        setDelivery(d);
        if (me) {
          if (me.address) setAddress((prev) => prev || me.address || '');
          if (me.latitude != null && me.longitude != null) setCoords({ lat: Number(me.latitude), lng: Number(me.longitude) });
          if (me.front_image_url) setFrontImageUrl(me.front_image_url);
        }
      } catch {
        /* keep defaults */
      }
    })();
  }, [navigation]);

  // (Re)load slots whenever the day changes; reset the picked slot.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setTimeSlotId('');
    restaurantApi
      .getTimeSlots(localDateStr(selectedDay))
      .then((s) => { if (!cancelled) setSlots(s || []); })
      .catch(() => { if (!cancelled) setSlots([]); });
    return () => { cancelled = true; };
  }, [ready, selectedDay]);

  const urgentEnabled = delivery.urgent_charge > 0;

  const deliveryCharge = useMemo(() => {
    if (urgent) return urgentEnabled ? delivery.urgent_charge : 0;
    if (!timeSlotId) return sub >= delivery.free_delivery_threshold ? 0 : delivery.base_charge;
    const slot = slots.find((s) => s.id === timeSlotId);
    if (slot?.is_free_delivery_slot) return 0;
    return sub >= delivery.free_delivery_threshold ? 0 : delivery.base_charge;
  }, [urgent, urgentEnabled, delivery, timeSlotId, slots, sub]);

  const total = round2(sub + deliveryCharge);

  const pinLocation = async () => {
    setPinning(true);
    setShowMapPicker(true);
    setLocationAccuracy(null);
    try {
      const pos = await getAccuratePosition((accuracy) => {
        setLocationAccuracy(Math.round(accuracy));
      });
      if (!pos) { Toast.show({ type: 'error', text1: 'Location permission denied' }); return; }
      setCoords({ lat: pos.lat, lng: pos.lng });
      setLocationAccuracy(Math.round(pos.accuracy));
      Toast.show({ type: 'success', text1: 'Location pinned' });
    } finally {
      setPinning(false);
    }
  };

  const pickImage = async () => {
    const picked = await pickDoorPhotoFromLibrary();
    if (!picked) return;
    setUploadingImg(true);
    try {
      const { front_image_url } = await restaurantApi.uploadFrontImage(picked.uri);
      setFrontImageUrl(front_image_url);
      Toast.show({ type: 'success', text1: 'Storefront photo updated' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Could not upload photo' });
    } finally {
      setUploadingImg(false);
    }
  };

  const placeOrder = async () => {
    if (items.length === 0) return Toast.show({ type: 'error', text1: 'Cart is empty' });
    if (!urgent && !timeSlotId) return Toast.show({ type: 'error', text1: 'Please select a delivery time slot' });
    if (urgent && !urgentEnabled) return Toast.show({ type: 'error', text1: 'Urgent delivery is not available right now' });
    setPlacing(true);
    try {
      await restaurantApi.placeOrder(
        items.map((l) => ({ product_id: l.productId, quantity: l.qty, unit: l.unit, quality: l.quality })),
        {
          customer_notes: notes.trim() || undefined,
          time_slot_id: urgent ? null : timeSlotId,
          requested_delivery_date: urgent ? undefined : localDateStr(selectedDay),
          urgent_delivery: urgent,
          address: address.trim() || undefined,
          ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
          ...(frontImageUrl ? { front_image_url: frontImageUrl } : {}),
        }
      );
      clear();
      Toast.show({ type: 'success', text1: 'Order placed!' });
      navigation.navigate('RestaurantOrders');
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Could not place the order' });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.xl }}>
        {/* Delivery address (editable) */}
        <Section icon="location-on" title="Delivery Address">
          <Text style={styles.bizName}>{info?.business_name}</Text>
          <Text style={styles.addrMeta}>{info?.city}{info?.phone ? ` · ${info.phone}` : ''}</Text>
          <TextInput value={address} onChangeText={setAddress} multiline placeholder="Full delivery address"
            style={styles.addrInput} />
          {!showMapPicker && !coords && (
            <View style={styles.pinRow}>
              <TouchableOpacity style={styles.pinBtn} onPress={() => setShowMapPicker(true)}>
                <MaterialIcons name="location-on" size={16} color={COLORS.primary} />
                <Text style={styles.pinBtnText}>Add Google Map Location</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.gpsBtn} onPress={pinLocation} disabled={pinning}>
                {pinning ? <ActivityIndicator size="small" color={COLORS.white} /> : <MaterialIcons name="my-location" size={16} color={COLORS.white} />}
                <Text style={styles.gpsBtnText}>{pinning ? 'Getting location...' : 'Get My Location'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {coords && !showMapPicker && (
            <View style={styles.pinnedRow}>
              <MaterialIcons name="check-circle" size={18} color={COLORS.success} />
              <Text style={styles.coordsText}>
                Location pinned ({coords.lat.toFixed(5)}, {coords.lng.toFixed(5)})
                {locationAccuracy != null ? ` +/-${Math.round(locationAccuracy)}m` : ''}
              </Text>
              <TouchableOpacity onPress={() => setShowMapPicker(true)}>
                <Text style={styles.pinActionText}>Change</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setCoords(null);
                  setLocationAccuracy(null);
                }}
              >
                <Text style={styles.clearPinText}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}

          {showMapPicker && (
            <CheckoutMapPicker
              lat={coords?.lat ?? DEFAULT_MAP_LAT}
              lng={coords?.lng ?? DEFAULT_MAP_LNG}
              accuracy={locationAccuracy}
              isLocating={pinning}
              hasLocation={coords != null}
              onLatLngChange={(lat, lng) => {
                setCoords({ lat, lng });
                setLocationAccuracy(null);
              }}
              onGetLocation={pinLocation}
              onDone={() => setShowMapPicker(false)}
              onCancel={() => {
                setCoords(null);
                setLocationAccuracy(null);
                setShowMapPicker(false);
              }}
            />
          )}

          <Text style={styles.photoLabel}>Storefront photo (helps the rider find you)</Text>
          {frontImageUrl ? (
            <View>
              <Image source={{ uri: frontImageUrl }} style={styles.photo} />
              <TouchableOpacity onPress={pickImage} disabled={uploadingImg}>
                <Text style={styles.photoChange}>{uploadingImg ? 'Uploading…' : 'Change photo'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.photoAdd} onPress={pickImage} disabled={uploadingImg}>
              {uploadingImg ? <ActivityIndicator size="small" color={COLORS.gray500} /> : <MaterialIcons name="photo-camera" size={18} color={COLORS.gray500} />}
              <Text style={styles.photoAddText}>{uploadingImg ? 'Uploading…' : 'Add photo'}</Text>
            </TouchableOpacity>
          )}
        </Section>

        {/* Delivery time */}
        <Section icon="schedule" title="Delivery Time">
          {urgentEnabled && (
            <TouchableOpacity style={[styles.urgentRow, urgent && styles.urgentRowActive]} onPress={() => setUrgent((u) => !u)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="bolt" size={18} color={COLORS.warning || '#f59e0b'} />
                <Text style={styles.urgentText}>Urgent delivery{delivery.urgent_eta ? ` (${delivery.urgent_eta})` : ''}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.urgentPrice}>{money(delivery.urgent_charge)}</Text>
                <MaterialIcons name={urgent ? 'check-box' : 'check-box-outline-blank'} size={20} color={urgent ? COLORS.primary : COLORS.gray400} />
              </View>
            </TouchableOpacity>
          )}
          {!urgent && (
            <>
              {/* Today / Tomorrow */}
              <View style={styles.dayToggle}>
                {(['today', 'tomorrow'] as const).map((d) => (
                  <TouchableOpacity key={d} onPress={() => setSelectedDay(d)}
                    style={[styles.dayBtn, selectedDay === d && styles.dayBtnActive]}>
                    <Text style={[styles.dayBtnText, selectedDay === d && styles.dayBtnTextActive]}>
                      {d === 'today' ? 'Today' : 'Tomorrow'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {slots.length === 0 ? (
                <Text style={styles.addrMeta}>No delivery slots available {selectedDay === 'today' ? 'today' : 'tomorrow'}.</Text>
              ) : (
                <View style={styles.slotWrap}>
                  {slots.map((s) => {
                    const active = timeSlotId === s.id;
                    const avail = getSlotAvailability(s, selectedDay, delivery.slot_cutoff_percent);
                    const disabled = (s.available_slots ?? 1) <= 0 || avail.unavailable;
                    return (
                      <TouchableOpacity key={s.id} disabled={disabled}
                        onPress={() => setTimeSlotId(s.id)}
                        style={[styles.slot, active && styles.slotActive, disabled && styles.slotFull]}>
                        <Text style={[styles.slotText, active && styles.slotTextActive]}>
                          {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                        </Text>
                        {s.is_free_delivery_slot ? <Text style={styles.slotFree}>Free delivery</Text> : null}
                        {(s.available_slots ?? 1) <= 0
                          ? <Text style={styles.slotFreeMuted}>Full</Text>
                          : avail.unavailable
                          ? <Text style={styles.slotFreeMuted}>{avail.reason === 'expired' ? 'Passed' : 'Closing'}</Text>
                          : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </Section>

        {/* Payment */}
        <Section icon="payments" title="Payment Method">
          <View style={styles.payRow}>
            <Text style={styles.payText}>Cash on Delivery</Text>
            <MaterialIcons name="check-circle" size={20} color={COLORS.primary} />
          </View>
        </Section>

        {/* Notes */}
        <Section icon="notes" title="Order notes (optional)">
          <TextInput value={notes} onChangeText={setNotes} multiline placeholder="Anything our team should know…"
            style={styles.notes} />
        </Section>

        {/* Summary */}
        <Section icon="receipt-long" title="Order Summary">
          {items.map((l) => (
            <View key={l.key} style={styles.itemRow}>
              <Text style={styles.itemText} numberOfLines={1}>
                {l.name} <Text style={{ color: COLORS.gray400 }}>· Q{l.quality} · {l.unitShort} × {l.qty}</Text>
              </Text>
              <Text style={styles.itemPrice}>{money(l.unitPrice * l.qty)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <Row label="Subtotal" value={money(sub)} />
          <Row label="Delivery" value={deliveryCharge === 0 ? 'FREE' : money(deliveryCharge)} valueColor={deliveryCharge === 0 ? COLORS.success : COLORS.gray900} />
          <Row label="Total" value={money(total)} bold />
        </Section>

        <Button title="Place Order" onPress={placeOrder} loading={placing} style={{ marginTop: SPACING.sm }} />
      </ScrollView>
    </SafeAreaView>
  );
};

function Section({ icon, title, children }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <MaterialIcons name={icon} size={18} color={COLORS.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Row({ label, value, bold, valueColor }: { label: string; value: string; bold?: boolean; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
      <Text style={{ color: COLORS.gray600, fontWeight: bold ? '700' : '400', fontSize: bold ? 16 : 14 }}>{label}</Text>
      <Text style={{ color: valueColor || COLORS.gray900, fontWeight: bold ? '700' : '600', fontSize: bold ? 18 : 14 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray200 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  section: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.gray100 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray900 },
  bizName: { fontSize: 15, fontWeight: '700', color: COLORS.gray900 },
  addr: { fontSize: 13, color: COLORS.gray600, marginTop: 4 },
  addrMeta: { fontSize: 13, color: COLORS.gray500, marginTop: 2 },
  addrInput: { borderWidth: 1, borderColor: COLORS.gray300, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, marginTop: SPACING.sm, minHeight: 48, textAlignVertical: 'top', color: COLORS.gray900 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: SPACING.sm, flexWrap: 'wrap' },
  pinBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.primary, borderRadius: BORDER_RADIUS.sm, paddingVertical: 6, paddingHorizontal: 10 },
  pinBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.sm, paddingVertical: 7, paddingHorizontal: 10 },
  gpsBtnText: { color: COLORS.white, fontSize: 13, fontWeight: '600' },
  pinnedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.sm, padding: SPACING.sm, borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', borderRadius: BORDER_RADIUS.sm, flexWrap: 'wrap' },
  coordsText: { flex: 1, minWidth: 160, fontSize: 12, color: COLORS.gray600 },
  pinActionText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  clearPinText: { fontSize: 12, color: COLORS.error, fontWeight: '700' },
  photoLabel: { fontSize: 13, fontWeight: '600', color: COLORS.gray700, marginTop: SPACING.md, marginBottom: 6 },
  photo: { width: 110, height: 110, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.gray100 },
  photoChange: { color: COLORS.primary, fontSize: 13, fontWeight: '600', marginTop: 6 },
  photoAdd: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.gray300, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, alignSelf: 'flex-start' },
  photoAddText: { fontSize: 13, color: COLORS.gray600 },
  urgentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 2, borderColor: COLORS.gray200, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, marginBottom: SPACING.sm },
  urgentRowActive: { borderColor: COLORS.warning || '#f59e0b', backgroundColor: '#fffbeb' },
  urgentText: { fontSize: 14, fontWeight: '600', color: COLORS.gray900 },
  urgentPrice: { fontSize: 14, fontWeight: '700', color: COLORS.gray900 },
  dayToggle: { flexDirection: 'row', backgroundColor: COLORS.gray100, borderRadius: BORDER_RADIUS.sm, padding: 3, marginBottom: SPACING.sm, alignSelf: 'flex-start' },
  dayBtn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: BORDER_RADIUS.sm - 2 },
  dayBtnActive: { backgroundColor: COLORS.white },
  dayBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
  dayBtnTextActive: { color: COLORS.primary700 || COLORS.primary },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { borderWidth: 1, borderColor: COLORS.gray200, borderRadius: BORDER_RADIUS.sm, paddingVertical: 8, paddingHorizontal: 10, minWidth: '30%', alignItems: 'center' },
  slotActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary50 },
  slotFull: { opacity: 0.4 },
  slotText: { fontSize: 12, color: COLORS.gray700, fontWeight: '600' },
  slotTextActive: { color: COLORS.primary },
  slotFree: { fontSize: 10, color: COLORS.success, marginTop: 2 },
  slotFreeMuted: { fontSize: 10, color: COLORS.gray400, marginTop: 2 },
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.primary50, borderRadius: BORDER_RADIUS.sm, padding: SPACING.md },
  payText: { fontSize: 14, fontWeight: '600', color: COLORS.gray900 },
  notes: { borderWidth: 1, borderColor: COLORS.gray300, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, height: 70, textAlignVertical: 'top', color: COLORS.gray900 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  itemText: { flex: 1, fontSize: 13, color: COLORS.gray700, marginRight: 8 },
  itemPrice: { fontSize: 13, fontWeight: '600', color: COLORS.gray900 },
  divider: { height: 1, backgroundColor: COLORS.gray200, marginVertical: SPACING.sm },
});

export default RestaurantCheckoutScreen;
