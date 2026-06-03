import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ShopStackParamList, StoreProduct } from '@types';
import { COLORS, SPACING } from '@utils/constants';
import { ProductCard, EmptyState, ErrorView } from '@components';
import { MobileHeader } from '@components/layout/MobileHeader';
import {
  ProductFiltersToolbar,
  SortOption,
  sortMap,
} from '@components/shop/ProductFiltersToolbar';
import { productService } from '@services/product.service';
import { useCityContext } from '@/context/CityContext';

type CategoryProductsRouteProp = RouteProp<ShopStackParamList, 'CategoryProducts'>;

export const CategoryProductsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ShopStackParamList>>();
  const route = useRoute<CategoryProductsRouteProp>();
  const { categoryId, categoryName } = route.params;
  const { selectedCityId } = useCityContext();

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);

  const loadProducts = useCallback(async () => {
    if (!selectedCityId) {
      setProducts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      setError(null);
      const apiSort = sortBy === 'relevance' ? sortMap['name-asc'] : sortMap[sortBy];
      const response = await productService.getProductsByCategory(categoryId, {
        sortBy: apiSort.sortBy,
        sortOrder: apiSort.sortOrder,
        ...(minPrice ? { minPrice: parseInt(minPrice, 10) } : {}),
        ...(maxPrice ? { maxPrice: parseInt(maxPrice, 10) } : {}),
        ...(inStockOnly ? { inStock: 'true' } : {}),
      });
      if (response.success) {
        setProducts(response.data as StoreProduct[]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryId, sortBy, minPrice, maxPrice, inStockOnly, selectedCityId]);

  useEffect(() => {
    setLoading(true);
    setProducts([]);
    loadProducts();
  }, [loadProducts]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProducts();
  };

  const clearFilters = () => {
    setMinPrice('');
    setMaxPrice('');
    setInStockOnly(false);
    setSortBy('name-asc');
  };

  const handleProductPress = (product: StoreProduct) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  const subtitle = useMemo(
    () => (loading ? 'Loading...' : `Showing ${products.length} products`),
    [loading, products.length]
  );

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorView message={error} onRetry={loadProducts} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <MobileHeader onSearchPress={() => navigation.navigate('Search')} />

      <View style={styles.pageHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={COLORS.gray700} />
        </TouchableOpacity>
        <View style={styles.pageHeaderText}>
          <Text style={styles.title}>{categoryName}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      <ProductFiltersToolbar
        sortBy={sortBy}
        onSortChange={setSortBy}
        minPrice={minPrice}
        maxPrice={maxPrice}
        inStockOnly={inStockOnly}
        onMinPriceChange={setMinPrice}
        onMaxPriceChange={setMaxPrice}
        onInStockOnlyChange={setInStockOnly}
        onApply={loadProducts}
        onClear={clearFilters}
      />

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary600} />
        </View>
      ) : products.length > 0 ? (
        <FlatList
          data={products}
          numColumns={2}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={styles.gridItem}>
              <ProductCard product={item} onPress={handleProductPress} fullWidth showMobileAddButton />
            </View>
          )}
        />
      ) : (
        <EmptyState
          icon="inventory-2"
          title="No products found"
          message={`There are no products in ${categoryName} yet`}
          actionTitle="Browse Categories"
          onAction={() => navigation.goBack()}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  backBtn: { padding: 4 },
  pageHeaderText: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.gray900 },
  subtitle: { fontSize: 14, color: COLORS.gray500, marginTop: 2 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  grid: { paddingHorizontal: SPACING.md, paddingBottom: 80 },
  row: { gap: SPACING.sm, marginBottom: SPACING.sm },
  gridItem: { flex: 1 },
});

export default CategoryProductsScreen;
