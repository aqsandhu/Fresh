import React, { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { Button } from '@components';
import { getRestaurantInfo, restaurantApi, money } from '@services/restaurant.service';
import { useRestaurantCart } from '@store/restaurantCartStore';
import { RestaurantTabBar } from './RestaurantTabBar';

export const RestaurantCartScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { items, setQty, remove, setDelivery, subtotal, deliveryCharge, total } = useRestaurantCart();

  useEffect(() => {
    getRestaurantInfo().then((i) => { if (!i) navigation.replace('RestaurantLogin'); });
    restaurantApi.getDelivery().then((d) => setDelivery(Number(d?.base_charge) || 100, Number(d?.free_delivery_threshold) || 2000)).catch(() => {});
  }, [navigation, setDelivery]);

  const sub = subtotal();
  const del = deliveryCharge();
  const tot = total();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}><Text style={styles.title}>Cart</Text></View>

      {items.length === 0 ? (
        <View style={styles.center}>
          <MaterialIcons name="shopping-cart" size={48} color={COLORS.gray300} />
          <Text style={{ color: COLORS.gray500, marginTop: SPACING.sm }}>Your cart is empty.</Text>
          <Button title="Browse catalog" onPress={() => navigation.navigate('RestaurantShop')} style={{ marginTop: SPACING.md }} />
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(l) => l.key}
            contentContainerStyle={{ padding: SPACING.md, paddingBottom: 220 }}
            renderItem={({ item: l }) => (
              <View style={styles.line}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{l.name}</Text>
                  <Text style={styles.meta}>Quality {l.quality} · {l.unitShort} · {money(l.unitPrice)}</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity onPress={() => setQty(l.key, l.qty - 1)} style={styles.stepBtn}><MaterialIcons name="remove" size={16} color={COLORS.gray700} /></TouchableOpacity>
                    <Text style={styles.qty}>{l.qty}</Text>
                    <TouchableOpacity onPress={() => setQty(l.key, l.qty + 1)} style={styles.stepBtn}><MaterialIcons name="add" size={16} color={COLORS.gray700} /></TouchableOpacity>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.name}>{money(l.unitPrice * l.qty)}</Text>
                  <TouchableOpacity onPress={() => remove(l.key)} style={{ marginTop: 8 }}>
                    <MaterialIcons name="delete-outline" size={20} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />

          <View style={styles.summary}>
            <Row label="Subtotal" value={money(sub)} />
            <Row label="Delivery" value={del === 0 ? 'FREE' : money(del)} valueColor={del === 0 ? COLORS.success : COLORS.gray900} />
            <Row label="Total" value={money(tot)} bold />
            <Button title="Proceed to Checkout" onPress={() => navigation.navigate('RestaurantCheckout')} style={{ marginTop: SPACING.sm }} />
          </View>
        </>
      )}

      <RestaurantTabBar active="cart" />
    </SafeAreaView>
  );
};

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
  header: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray200 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.gray100 },
  name: { fontSize: 14, fontWeight: '700', color: COLORS.gray900 },
  meta: { fontSize: 12, color: COLORS.gray500, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.gray300, borderRadius: BORDER_RADIUS.sm, alignSelf: 'flex-start', marginTop: 8 },
  stepBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  qty: { width: 28, textAlign: 'center', fontSize: 14, fontWeight: '600', color: COLORS.gray900 },
  summary: { position: 'absolute', bottom: 64, left: 0, right: 0, borderTopWidth: 1, borderTopColor: COLORS.gray200, padding: SPACING.md, backgroundColor: COLORS.white },
});

export default RestaurantCartScreen;
