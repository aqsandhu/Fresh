import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@utils/constants';
import { useLeftDrawer } from '@store/drawerUi';
import { useCityContext } from '@/context/CityContext';
import { productService } from '@services/product.service';
import { navigationRef } from '@/navigation/navigationUtils';
import { TodaysBasketModal } from '@components/home/TodaysBasketModal';
import { useActiveRouteName } from '@/lib/activeRoute';
import { EdgeDrawer } from './EdgeDrawer';
import type { Category } from '@app-types';

const HIDE_ON = new Set(['SelectCity', 'CartMain', 'Checkout', 'AddAddress', 'ChangePin', 'SetPin']);

export const CategoriesDrawer: React.FC = () => {
  const open = useLeftDrawer((s) => s.open);
  const peek = useLeftDrawer((s) => s.peek);
  const setOpen = useLeftDrawer((s) => s.setOpen);
  const { selectedCityId } = useCityContext();
  const [basketOpen, setBasketOpen] = useState(false);
  const route = useActiveRouteName();

  // SAME key + queryFn as the home CategoriesSection → they share one cache
  // entry, so the home wall always shows exactly what this drawer shows.
  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories', selectedCityId],
    queryFn: async () => {
      const res = await productService.getCategories();
      return res.success ? res.data : [];
    },
    enabled: !!selectedCityId,
    staleTime: 5 * 60 * 1000,
  });

  const hidden = !selectedCityId || HIDE_ON.has(route) || String(route).startsWith('Restaurant');

  const goToCategory = (c: Category) => {
    setOpen(false);
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('Main', {
        screen: 'Shop',
        params: { screen: 'CategoryProducts', params: { categoryId: c.id, categoryName: c.name } },
      });
    }
  };

  const items: React.ReactNode[] = isLoading
    ? [<ActivityIndicator key="loading" color={COLORS.white} />]
    : [
        ...(categories || []).map((c) => {
          const uri = c.image || c.imageUrl;
          return (
            <TouchableOpacity
              key={c.id}
              style={styles.item}
              onPress={() => goToCategory(c)}
              activeOpacity={0.85}
            >
              <View style={styles.chip}>
                {uri ? (
                  <Image source={{ uri }} style={styles.chipImg} />
                ) : (
                  <View style={[styles.chipImg, styles.chipFallback]}>
                    <Text style={styles.chipFallbackText}>{c.name.charAt(0)}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.itemLabel} numberOfLines={2}>
                {c.nameUrdu || c.name}
              </Text>
            </TouchableOpacity>
          );
        }),
        <TouchableOpacity
          key="todays-basket"
          style={styles.item}
          onPress={() => {
            setOpen(false);
            setBasketOpen(true);
          }}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#fbbf24', '#d97706']} style={styles.chipBasket}>
            <MaterialIcons name="shopping-basket" size={22} color={COLORS.white} />
          </LinearGradient>
          <Text style={styles.itemLabel}>آج کی ٹوکری</Text>
        </TouchableOpacity>,
      ];

  return (
    <>
      <EdgeDrawer
        side="left"
        open={open}
        peek={peek}
        setOpen={setOpen}
        hidden={hidden}
        accessibilityLabel="Open categories"
        items={items}
      />

      <TodaysBasketModal visible={basketOpen} onClose={() => setBasketOpen(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  item: { alignItems: 'center', gap: 4, width: 96 },
  chip: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    elevation: 4,
  },
  chipImg: { width: '100%', height: '100%' },
  chipFallback: { backgroundColor: COLORS.primary200, justifyContent: 'center', alignItems: 'center' },
  chipFallbackText: { fontSize: 18, fontWeight: '700', color: COLORS.primary700 },
  chipBasket: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  itemLabel: {
    maxWidth: 96,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

export default CategoriesDrawer;
