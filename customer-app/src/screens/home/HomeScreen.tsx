import React, { useEffect, useState } from 'react';
import { ScrollView, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { HomeStackParamList } from '@app-types';
import { COLORS } from '@utils/constants';
import { useTabBarMetrics } from '@/lib/tabBarMetrics';
import { MobileHeader } from '@components/layout/MobileHeader';
import {
  HeroSection,
  CategoriesSection,
  FeaturedProductsSection,
  DeliveryInfoSection,
} from '@components/home/sections';
import { cartService, type MyCoupon } from '@services/cart.service';
import { CouponWinModal } from '@components/common/CouponWinModal';
import { useCityContext } from '@/context/CityContext';
import { useAuthStore } from '@store';

/** Mirrors website/app/(shop)/page.tsx — each section self-fetches via react-query. */
export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { selectedCityId } = useCityContext();
  const { inset: tabBarInset } = useTabBarMetrics();
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  const [winCoupons, setWinCoupons] = useState<MyCoupon[]>([]);
  const [winVisible, setWinVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['featured-products'] }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // After login, surface any newly-earned coupons (welcome-back / milestone).
  useEffect(() => {
    if (!isAuthenticated) return;
    cartService.getMyCoupons().then((res) => {
      if (res.unseen && res.unseen.length > 0) {
        setWinCoupons(res.unseen);
        setWinVisible(true);
      }
    });
  }, [isAuthenticated, selectedCityId]);

  const closeWinModal = () => {
    setWinVisible(false);
    cartService.markCouponsSeen();
  };

  const goToShop = (screen: 'ProductsMain' | 'CategoriesList' = 'ProductsMain') => {
    (navigation.getParent() as { navigate: (name: string, params?: object) => void } | undefined)?.navigate('Shop', { screen });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <MobileHeader onSearchPress={() => navigation.navigate('Search')} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Website-parity order: products → category wall → hero → delivery. */}
        <FeaturedProductsSection
          onProductPress={(product) =>
            navigation.navigate('ProductDetail', { productId: product.id })
          }
          onViewAll={() => goToShop('ProductsMain')}
        />
        <CategoriesSection
          onCategoryPress={(category) =>
            navigation.navigate('CategoryProducts', {
              categoryId: category.id,
              categoryName: category.name,
            })
          }
        />
        <HeroSection
          onShopNow={() => goToShop('ProductsMain')}
          onAttaChakki={() =>
            (navigation.getParent() as { navigate: (name: string, params?: object) => void } | undefined)?.navigate('Profile', { screen: 'AttaChakkiMain' })
          }
        />
        <DeliveryInfoSection />
        <View style={{ height: tabBarInset }} />
      </ScrollView>
      <CouponWinModal visible={winVisible} coupons={winCoupons} onClose={closeWinModal} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
});

export default HomeScreen;
