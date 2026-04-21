import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList, Category, Product, Banner } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import {
  SearchBar,
  BannerCarousel,
  CategoryCard,
  ProductCard,
  SectionHeader,
  FreeDeliveryCard,
  SkeletonCard,
  ErrorView,
} from '@components';
import { productService } from '@services/product.service';
import { useCartStore } from '@store';
import { LinearGradient } from 'expo-linear-gradient';

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { subtotal } = useCartStore();

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [categoriesRes, productsRes, bannersRes] = await Promise.all([
        productService.getCategories(),
        productService.getFeaturedProducts(),
        productService.getBanners(),
      ]);

      if (categoriesRes.success) setCategories(categoriesRes.data);
      if (productsRes.success) setFeaturedProducts(productsRes.data.slice(0, 6));
      if (bannersRes.success) setBanners(bannersRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigation.navigate('Search', { query: searchQuery });
    }
  };

  const handleCategoryPress = (category: Category) => {
    navigation.navigate('CategoryProducts', {
      categoryId: category.id,
      categoryName: category.name,
    });
  };

  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  const handleBannerPress = (banner: Banner) => {
    if (banner.actionType === 'category' && banner.actionValue) {
      const category = categories.find((c) => c.id === banner.actionValue);
      if (category) {
        handleCategoryPress(category);
      }
    } else if (banner.actionType === 'product' && banner.actionValue) {
      navigation.navigate('ProductDetail', { productId: banner.actionValue });
    }
  };

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorView message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmit={handleSearch}
            onClear={() => setSearchQuery('')}
            placeholder="Search for vegetables, fruits..."
          />
        </View>

        {/* Banner / Hero Section */}
        {loading ? (
          <View style={styles.bannerSkeleton}>
            <SkeletonCard />
          </View>
        ) : banners.length > 0 ? (
          <BannerCarousel banners={banners} onBannerPress={handleBannerPress} />
        ) : (
          <View style={styles.heroContainer}>
            <LinearGradient
              colors={[COLORS.primary, '#2E7D32']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <Text style={styles.heroTitle}>Fresh Bazar 🥬</Text>
              <Text style={styles.heroSubtitle}>Farm-fresh vegetables, fruits & groceries delivered to your door</Text>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>Free Delivery on orders above Rs. 500</Text>
              </View>
            </LinearGradient>
          </View>
        )}

        {/* Categories */}
        <SectionHeader
          title="Categories"
          subtitle="Browse by category"
          onSeeAll={() => navigation.navigate('CategoriesList' as any)}
        />
        {loading ? (
          <View style={styles.categoriesSkeleton}>
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
        ) : (
          <FlatList
            data={categories}
            renderItem={({ item }) => (
              <CategoryCard category={item} onPress={handleCategoryPress} />
            )}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesList}
          />
        )}

        {/* Free Delivery Card */}
        <FreeDeliveryCard cartSubtotal={subtotal()} />

        {/* Featured Products */}
        <SectionHeader
          title="Featured Products"
          subtitle="Fresh from the farm"
          onSeeAll={() => navigation.navigate('Search' as any)}
        />
        {loading ? (
          <View style={styles.productsSkeleton}>
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
        ) : (
          <FlatList
            data={featuredProducts}
            renderItem={({ item }) => (
              <ProductCard product={item} onPress={handleProductPress} />
            )}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.productsList}
          />
        )}

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  searchContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  bannerSkeleton: {
    paddingHorizontal: SPACING.lg,
  },
  heroContainer: {
    paddingHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
  },
  heroCard: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: SPACING.xs,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    alignSelf: 'flex-start',
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  categoriesList: {
    paddingHorizontal: SPACING.lg,
  },
  categoriesSkeleton: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
  },
  productsList: {
    paddingHorizontal: SPACING.lg,
  },
  productsSkeleton: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
  },
  bottomPadding: {
    height: SPACING.xxl,
  },
});

export default HomeScreen;
