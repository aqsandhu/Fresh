import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  Modal, TextInput, FlatList, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS, API_BASE_URL } from '@utils/constants';
import { Button } from '@components';
import {
  restaurantApi, getRestaurantInfo, clearRestaurantSession,
  availableQualities, availableUnits, unitPrice, qualityBasePrice, money, round2,
  type Quality, type Unit,
} from '@services/restaurant.service';
import { RestaurantTabBar } from './RestaurantTabBar';

const BACKEND_URL = API_BASE_URL.replace('/api', '');
function imgUrl(path?: string | null): string {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${BACKEND_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

interface CartLine {
  key: string; productId: string; name: string; quality: Quality; unit: Unit; unitShort: string; qty: number; unitPrice: number;
}

export const RestaurantShopScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [activeCat, setActiveCat] = useState('');
  const [delivery, setDelivery] = useState({ base_charge: 100, free_delivery_threshold: 2000 });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [bizName, setBizName] = useState('');

  useEffect(() => {
    (async () => {
      const info = await getRestaurantInfo();
      if (!info) {
        navigation.replace('RestaurantLogin');
        return;
      }
      setBizName(info.business_name);
      try {
        const [cats, prods, del] = await Promise.all([
          restaurantApi.getCategories(),
          restaurantApi.getProducts(),
          restaurantApi.getDelivery().catch(() => ({ base_charge: 100, free_delivery_threshold: 2000 })),
        ]);
        setCategories(cats || []);
        setProducts(prods || []);
        if (del) setDelivery(del);
      } catch (e: any) {
        if (e?.status === 401) navigation.replace('RestaurantLogin');
        else Toast.show({ type: 'error', text1: e?.message || 'Could not load catalog' });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigation]);

  const loadCategory = async (catId: string) => {
    setActiveCat(catId);
    setLoading(true);
    try {
      setProducts((await restaurantApi.getProducts(catId || undefined)) || []);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (line: CartLine) => {
    setCart((prev) => {
      const ex = prev.find((l) => l.key === line.key);
      return ex ? prev.map((l) => (l.key === line.key ? { ...l, qty: l.qty + line.qty } : l)) : [...prev, line];
    });
    Toast.show({ type: 'success', text1: 'Added to cart' });
  };
  const setQty = (key: string, qty: number) => setCart((p) => p.map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l)));
  const removeLine = (key: string) => setCart((p) => p.filter((l) => l.key !== key));

  const subtotal = useMemo(() => round2(cart.reduce((s, l) => s + round2(l.unitPrice * l.qty), 0)), [cart]);
  const deliveryCharge = subtotal === 0 ? 0 : subtotal >= delivery.free_delivery_threshold ? 0 : delivery.base_charge;
  const total = round2(subtotal + deliveryCharge);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  const placeOrder = async () => {
    if (cart.length === 0) return Toast.show({ type: 'error', text1: 'Cart is empty' });
    setPlacing(true);
    try {
      await restaurantApi.placeOrder(
        cart.map((l) => ({ product_id: l.productId, quantity: l.qty, unit: l.unit, quality: l.quality })),
        notes.trim() || undefined
      );
      setCart([]); setNotes(''); setCartOpen(false);
      Toast.show({ type: 'success', text1: 'Order placed!' });
      navigation.navigate('RestaurantOrders');
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Could not place order' });
    } finally {
      setPlacing(false);
    }
  };

  const logout = async () => {
    await clearRestaurantSession();
    navigation.replace('RestaurantLogin');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <MaterialIcons name="restaurant" size={20} color={COLORS.primary} />
          <Text style={styles.title} numberOfLines={1}>{bizName || 'Restaurant store'}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('RestaurantOrders')} style={{ marginRight: SPACING.md }}>
          <MaterialIcons name="receipt-long" size={22} color={COLORS.gray700} />
        </TouchableOpacity>
        <TouchableOpacity onPress={logout}>
          <MaterialIcons name="logout" size={22} color={COLORS.gray700} />
        </TouchableOpacity>
      </View>

      {/* Category chips */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" active={activeCat === ''} onPress={() => loadCategory('')} />
          {categories.map((c) => (
            <Chip key={c.id} label={c.name_en} active={activeCat === c.id} onPress={() => loadCategory(c.id)} />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : products.length === 0 ? (
        <View style={styles.center}><Text style={{ color: COLORS.gray500 }}>No products in this catalog.</Text></View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: SPACING.sm, paddingHorizontal: SPACING.md }}
          contentContainerStyle={{ paddingVertical: SPACING.md, paddingBottom: 180, gap: SPACING.sm }}
          renderItem={({ item }) => <ProductCard product={item} onAdd={addToCart} />}
        />
      )}

      {/* Bottom cart bar (sits above the tab bar) */}
      {cartCount > 0 && (
        <TouchableOpacity style={styles.cartBar} onPress={() => setCartOpen(true)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialIcons name="shopping-cart" size={20} color={COLORS.white} />
            <Text style={styles.cartBarText}>{cartCount} item{cartCount > 1 ? 's' : ''}</Text>
          </View>
          <Text style={styles.cartBarText}>{money(total)} · View cart</Text>
        </TouchableOpacity>
      )}

      {/* Cart modal */}
      <Modal visible={cartOpen} animationType="slide" onRequestClose={() => setCartOpen(false)}>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.header}>
            <Text style={styles.title}>Your cart</Text>
            <TouchableOpacity onPress={() => setCartOpen(false)}>
              <MaterialIcons name="close" size={24} color={COLORS.gray700} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={cart}
            keyExtractor={(l) => l.key}
            contentContainerStyle={{ padding: SPACING.md }}
            ListEmptyComponent={<Text style={{ textAlign: 'center', color: COLORS.gray500, marginTop: SPACING.xl }}>Empty</Text>}
            renderItem={({ item: l }) => (
              <View style={styles.cartLine}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartName}>{l.name}</Text>
                  <Text style={styles.cartMeta}>Quality {l.quality} · {l.unitShort} · {money(l.unitPrice)}</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity onPress={() => setQty(l.key, l.qty - 1)} style={styles.stepBtn}><MaterialIcons name="remove" size={16} color={COLORS.gray700} /></TouchableOpacity>
                    <Text style={styles.qtyText}>{l.qty}</Text>
                    <TouchableOpacity onPress={() => setQty(l.key, l.qty + 1)} style={styles.stepBtn}><MaterialIcons name="add" size={16} color={COLORS.gray700} /></TouchableOpacity>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.cartName}>{money(round2(l.unitPrice * l.qty))}</Text>
                  <TouchableOpacity onPress={() => removeLine(l.key)} style={{ marginTop: 8 }}>
                    <MaterialIcons name="delete-outline" size={20} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
          <View style={styles.cartFooter}>
            <Row label="Subtotal" value={money(subtotal)} />
            <Row label="Delivery" value={deliveryCharge === 0 ? 'FREE' : money(deliveryCharge)} valueColor={deliveryCharge === 0 ? COLORS.success : COLORS.gray900} />
            <Row label="Total" value={money(total)} bold />
            <TextInput value={notes} onChangeText={setNotes} placeholder="Order notes (optional)" style={styles.notes} multiline />
            <Button title="Place Order" onPress={placeOrder} loading={placing} style={{ marginTop: SPACING.sm }} />
          </View>
        </SafeAreaView>
      </Modal>

      <RestaurantTabBar active="shop" />
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

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ProductCard({ product, onAdd }: { product: any; onAdd: (l: CartLine) => void }) {
  const qualities = availableQualities(product);
  const units = availableUnits(product);
  const [quality, setQuality] = useState<Quality>(qualities[0]);
  const [unit, setUnit] = useState<Unit>(units[0].value);
  const [qty, setQty] = useState(1);
  const selUnit = units.find((u) => u.value === unit) || units[0];
  const price = unitPrice(product, quality, unit);
  const out = (product.stock_quantity ?? 0) <= 0;

  const image = imgUrl(product.primary_image);

  return (
    <View style={styles.card}>
      <View style={styles.cardImageWrap}>
        {image ? (
          <Image source={{ uri: image }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <MaterialIcons name="restaurant" size={28} color={COLORS.gray300} />
          </View>
        )}
        {!out ? (
          <View style={styles.freshBadge}><Text style={styles.freshText}>Fresh</Text></View>
        ) : (
          <View style={styles.outBadge}><Text style={styles.outText}>Out of stock</Text></View>
        )}
      </View>
      <Text style={styles.cardName} numberOfLines={1}>{product.name_en}</Text>
      {!!product.name_ur && <Text style={styles.cardNameUr} numberOfLines={1}>{product.name_ur}</Text>}

      {qualities.length > 1 && (
        <>
          <Text style={styles.optLabel}>Quality</Text>
          <View style={styles.optRow}>
            {qualities.map((q) => {
              const qp = qualityBasePrice(product, q);
              const active = quality === q;
              return (
                <TouchableOpacity key={q} onPress={() => setQuality(q)} style={[styles.opt, active && styles.optActive]}>
                  <Text style={[styles.optText, active && styles.optTextActive, { fontWeight: '700' }]}>{q}</Text>
                  <Text style={[styles.optPrice, active && styles.optTextActive]}>{qp != null ? money(qp) : '—'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
      <Text style={styles.optLabel}>Quantity unit</Text>
      <View style={styles.optRow}>
        {units.map((u) => {
          const upr = unitPrice(product, quality, u.value);
          const active = unit === u.value;
          return (
            <TouchableOpacity key={u.value} onPress={() => setUnit(u.value)} style={[styles.opt, active && styles.optActive]}>
              <Text style={[styles.optText, active && styles.optTextActive, { fontWeight: '600' }]}>{u.short}</Text>
              <Text style={[styles.optPrice, active && styles.optTextActive]}>{upr != null ? money(upr) : '—'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.cardBottom}>
        <Text style={styles.rate}>{price != null ? money(price) : '—'} <Text style={{ color: COLORS.gray400 }}>/ {selUnit.short}</Text></Text>
        <View style={styles.stepper}>
          <TouchableOpacity onPress={() => setQty((q) => Math.max(1, q - 1))} style={styles.stepBtn}><MaterialIcons name="remove" size={16} color={COLORS.gray700} /></TouchableOpacity>
          <Text style={styles.qtyText}>{qty}</Text>
          <TouchableOpacity onPress={() => setQty((q) => q + 1)} style={styles.stepBtn}><MaterialIcons name="add" size={16} color={COLORS.gray700} /></TouchableOpacity>
        </View>
      </View>
      <Button
        title={out ? 'Out of stock' : 'Add to cart'}
        onPress={() => {
          if (price == null) return;
          onAdd({ key: `${product.id}|${quality}|${unit}`, productId: product.id, name: product.name_en, quality, unit, unitShort: selUnit.short, qty, unitPrice: price });
          setQty(1);
        }}
        disabled={out || price == null}
        style={{ marginTop: SPACING.sm }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray200,
  },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.gray900 },
  chips: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 8 },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: 999, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.gray200, marginRight: 8 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.gray700 },
  chipTextActive: { color: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { flex: 1, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.gray200 },
  cardImageWrap: { width: '100%', aspectRatio: 1, borderRadius: BORDER_RADIUS.sm, overflow: 'hidden', backgroundColor: COLORS.gray50, marginBottom: 6 },
  cardImage: { width: '100%', height: '100%' },
  cardImagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  freshBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: COLORS.primaryDark, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  freshText: { color: COLORS.white, fontSize: 9, fontWeight: '700' },
  outBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: COLORS.error, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  outText: { color: COLORS.white, fontSize: 9, fontWeight: '700' },
  cardName: { fontSize: 14, fontWeight: '700', color: COLORS.gray900 },
  cardNameUr: { fontSize: 13, color: COLORS.gray500, textAlign: 'right', writingDirection: 'rtl' },
  optLabel: { fontSize: 11, fontWeight: '700', color: COLORS.gray400, textTransform: 'uppercase', marginTop: SPACING.sm, letterSpacing: 0.5 },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  opt: { alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: 6, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: COLORS.gray300, marginRight: 8, marginBottom: 4 },
  optActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary50 },
  optText: { fontSize: 13, color: COLORS.gray700 },
  optPrice: { fontSize: 11, color: COLORS.gray500, marginTop: 1 },
  optTextActive: { color: COLORS.primary600 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.sm },
  rate: { fontSize: 15, fontWeight: '700', color: COLORS.primary600 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.gray300, borderRadius: BORDER_RADIUS.sm },
  stepBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  qtyText: { width: 28, textAlign: 'center', fontSize: 14, fontWeight: '600', color: COLORS.gray900 },
  cartBar: {
    position: 'absolute', left: SPACING.md, right: SPACING.md, bottom: 72,
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  cartBarText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  cartLine: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.gray100 },
  cartName: { fontSize: 14, fontWeight: '700', color: COLORS.gray900 },
  cartMeta: { fontSize: 12, color: COLORS.gray500, marginTop: 2 },
  cartFooter: { borderTopWidth: 1, borderTopColor: COLORS.gray200, padding: SPACING.md, backgroundColor: COLORS.white },
  notes: { borderWidth: 1, borderColor: COLORS.gray300, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, marginTop: SPACING.sm, height: 60, textAlignVertical: 'top', color: COLORS.gray900 },
});

export default RestaurantShopScreen;
