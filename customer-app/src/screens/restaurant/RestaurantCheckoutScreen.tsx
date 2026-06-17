import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { Button } from '@components';
import { getRestaurantInfo, restaurantApi, money, type RestaurantInfo } from '@services/restaurant.service';
import { useRestaurantCart } from '@store/restaurantCartStore';

export const RestaurantCheckoutScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { items, subtotal, deliveryCharge, total, clear } = useRestaurantCart();
  const [info, setInfo] = useState<RestaurantInfo | null>(null);
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    getRestaurantInfo().then((i) => {
      if (!i) navigation.replace('RestaurantLogin');
      else setInfo(i);
    });
  }, [navigation]);

  const placeOrder = async () => {
    if (items.length === 0) return Toast.show({ type: 'error', text1: 'Cart is empty' });
    setPlacing(true);
    try {
      await restaurantApi.placeOrder(
        items.map((l) => ({ product_id: l.productId, quantity: l.qty, unit: l.unit, quality: l.quality })),
        notes.trim() || undefined
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
        {/* Delivery address */}
        <Section icon="location-on" title="Delivery Address">
          <Text style={styles.bizName}>{info?.business_name}</Text>
          {!!info?.address && <Text style={styles.addr}>{info.address}</Text>}
          <Text style={styles.addrMeta}>{info?.city}{info?.phone ? ` · ${info.phone}` : ''}</Text>
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
          <Row label="Subtotal" value={money(subtotal())} />
          <Row label="Delivery" value={deliveryCharge() === 0 ? 'FREE' : money(deliveryCharge())} valueColor={deliveryCharge() === 0 ? COLORS.success : COLORS.gray900} />
          <Row label="Total" value={money(total())} bold />
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
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.primary50, borderRadius: BORDER_RADIUS.sm, padding: SPACING.md },
  payText: { fontSize: 14, fontWeight: '600', color: COLORS.gray900 },
  notes: { borderWidth: 1, borderColor: COLORS.gray300, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, height: 70, textAlignVertical: 'top', color: COLORS.gray900 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  itemText: { flex: 1, fontSize: 13, color: COLORS.gray700, marginRight: 8 },
  itemPrice: { fontSize: 13, fontWeight: '600', color: COLORS.gray900 },
  divider: { height: 1, backgroundColor: COLORS.gray200, marginVertical: SPACING.sm },
});

export default RestaurantCheckoutScreen;
