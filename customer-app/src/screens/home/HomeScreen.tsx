import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList, Category, StoreProduct } from '@app-types';
import { COLORS, SPACING } from '@utils/constants';
import { useTabBarMetrics } from '@/lib/tabBarMetrics';
import { ErrorView } from '@components';
import { MobileHeader } from '@components/layout/MobileHeader';
import {
  HeroSection,
  CategoriesSection,
  FeaturedProductsSection,
  DeliveryInfoSection,
} from '@components/home/sections';
import { productService } from '@services/product.service';
import { cartService, type MyCoupon } from '@services/cart.service';
import { CouponWinModal } from '@components/common/CouponWinModal';
import { useCityContext } from '@/context/CityContext';
import { useAuthStore } from '@store';

/** Mirrors website/app/(shop)/page.tsx section order exactly. */
export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { selectedCityId } = useCityContext();
  const { inset: tabBarInset } = useTabBarMetrics();
  const { isAuthenticated } = useAuthStore();

  const [winCoupons, setWinCoupons] = useState<MyCoupon[]>([]);
  const [winVisible, setWinVisible] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!selectedCityId) {
      setCategories([]);
      setFeaturedProducts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      const [categoriesRes, productsRes] = await Promise.all([
        productService.getCategories(),
        productService.getFeaturedProducts(500),
      ]);

      if (categoriesRes.success) setCategories(categoriesRes.data);
      if (productsRes.success) setFeaturedProducts(productsRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCityId]);

  useEffect(() => {
    setLoading(true);
    setCategories([]);
    setFeaturedProducts([]);
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
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

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorView message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <MobileHeader onSearchPress={() => navigation.navigate('Search')} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <HeroSection
          onShopNow={() => goToShop('ProductsMain')}
          onAttaChakki={() =>
            (navigation.getParent() as { navigate: (name: string, params?: object) => void } | undefined)?.navigate('Profile', { screen: 'AttaChakkiMain' })
          }
        />
        <CategoriesSection
          categories={categories}
          loading={loading}
          onCategoryPress={(category) =>
            navigation.navigate('CategoryProducts', {
              categoryId: category.id,
              categoryName: category.name,
            })
          }
        />
        <FeaturedProductsSection
          products={featuredProducts}
          loading={loading}
          onProductPress={(product) =>
            navigation.navigate('ProductDetail', { productId: product.id })
          }
          onViewAll={() => goToShop('ProductsMain')}
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
