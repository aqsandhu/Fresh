import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING } from '@utils/constants';
import { useRestaurantCart } from '@store/restaurantCartStore';

type Active = 'shop' | 'cart' | 'orders' | 'profile';

const TABS: { key: Active; label: string; icon: keyof typeof MaterialIcons.glyphMap; screen: keyof ProfileStackParamList; badge?: boolean }[] = [
  { key: 'shop', label: 'Shop', icon: 'storefront', screen: 'RestaurantShop' },
  { key: 'cart', label: 'Cart', icon: 'shopping-cart', screen: 'RestaurantCart', badge: true },
  { key: 'orders', label: 'Orders', icon: 'receipt-long', screen: 'RestaurantOrders' },
  { key: 'profile', label: 'Profile', icon: 'person', screen: 'RestaurantProfile' },
];

/** Fixed bottom bar for the restaurant screens (mirrors the app's main tab bar). */
export const RestaurantTabBar: React.FC<{ active: Active }> = ({ active }) => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const count = useRestaurantCart((s) => s.totalItems());

  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        const color = isActive ? COLORS.primary : COLORS.gray500;
        return (
          <TouchableOpacity
            key={t.key}
            style={styles.item}
            onPress={() => {
              if (!isActive) navigation.navigate(t.screen as any);
            }}
          >
            <View>
              <MaterialIcons name={t.icon} size={22} color={color} />
              {t.badge && count > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color }]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.gray200,
    paddingVertical: SPACING.sm, paddingBottom: SPACING.md,
  },
  item: { alignItems: 'center', minWidth: 64, paddingVertical: 2 },
  label: { fontSize: 10, marginTop: 2, fontWeight: '600' },
  badge: {
    position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: COLORS.white, fontSize: 9, fontWeight: '700' },
});

export default RestaurantTabBar;
