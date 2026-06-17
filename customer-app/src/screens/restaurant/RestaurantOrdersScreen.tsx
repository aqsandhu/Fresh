import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { restaurantApi, getRestaurantInfo, money } from '@services/restaurant.service';
import { RestaurantTabBar } from './RestaurantTabBar';

const STATUS_COLOR: Record<string, string> = {
  pending: COLORS.warning,
  confirmed: COLORS.info,
  preparing: COLORS.info,
  out_for_delivery: COLORS.accent,
  delivered: COLORS.success,
  cancelled: COLORS.error,
};

export const RestaurantOrdersScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      if (!(await getRestaurantInfo())) {
        navigation.replace('RestaurantLogin');
        return;
      }
      try {
        setOrders(await restaurantApi.getOrders());
      } catch (e: any) {
        if (e?.status === 401) navigation.replace('RestaurantLogin');
      } finally {
        setLoading(false);
      }
    })();
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>My Orders</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : orders.length === 0 ? (
        <View style={styles.center}><Text style={{ color: COLORS.gray500 }}>No orders yet.</Text></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.xl }}
          renderItem={({ item: o }) => (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.orderNo}>#{o.order_number}</Text>
                <View style={[styles.badge, { backgroundColor: (STATUS_COLOR[o.status] || COLORS.gray400) + '22' }]}>
                  <Text style={[styles.badgeText, { color: STATUS_COLOR[o.status] || COLORS.gray600 }]}>
                    {String(o.status || '').replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
              {(o.items || []).map((it: any, i: number) => (
                <Text key={i} style={styles.itemLine}>
                  {it.product_name} <Text style={{ color: COLORS.gray400 }}>· Q{it.quality} · {String(it.unit).replace('_', ' ')} × {it.quantity}</Text>
                </Text>
              ))}
              <View style={styles.cardFoot}>
                <Text style={styles.foot}>Delivery {money(Number(o.delivery_charge) || 0)}</Text>
                <Text style={styles.total}>Total {money(Number(o.total_amount) || 0)}</Text>
              </View>
            </View>
          )}
        />
      )}
      <RestaurantTabBar active="orders" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray200,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.gray100 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  orderNo: { fontSize: 15, fontWeight: '700', color: COLORS.gray900 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  itemLine: { fontSize: 13, color: COLORS.gray700, marginBottom: 2 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.gray100 },
  foot: { fontSize: 13, color: COLORS.gray500 },
  total: { fontSize: 14, fontWeight: '700', color: COLORS.gray900 },
});

export default RestaurantOrdersScreen;
