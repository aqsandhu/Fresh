import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {

  View,

  Text,

  StyleSheet,

  FlatList,

  ActivityIndicator,

} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';

import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ShopStackParamList, StoreProduct } from '@types';

import { COLORS, SPACING } from '@utils/constants';

import { ProductCard, EmptyState } from '@components';

import { MobileHeader } from '@components/layout/MobileHeader';

import {

  ProductFiltersToolbar,

  SortOption,

  sortMap,

} from '@components/shop/ProductFiltersToolbar';

import { productService } from '@services/product.service';

import { useOptionalCityName, useCityContext } from '@/context/CityContext';



export const ProductsScreen: React.FC = () => {

  const navigation = useNavigation<NativeStackNavigationProp<ShopStackParamList>>();

  const cityName = useOptionalCityName();
  const { selectedCityId } = useCityContext();

  const [products, setProducts] = useState<StoreProduct[]>([]);

  const [loading, setLoading] = useState(true);

  const [sortBy, setSortBy] = useState<SortOption>('name-asc');

  const [minPrice, setMinPrice] = useState('');

  const [maxPrice, setMaxPrice] = useState('');

  const [inStockOnly, setInStockOnly] = useState(false);



  const loadProducts = useCallback(async () => {
    if (!selectedCityId) {
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {

      const apiSort = sortBy === 'relevance' ? sortMap['name-asc'] : sortMap[sortBy];

      const res = await productService.getProducts({

        limit: 200,

        sortBy: apiSort.sortBy,

        sortOrder: apiSort.sortOrder,

        ...(minPrice ? { minPrice: parseInt(minPrice, 10) } : {}),

        ...(maxPrice ? { maxPrice: parseInt(maxPrice, 10) } : {}),

        ...(inStockOnly ? { inStock: 'true' } : {}),

      });

      if (res.success) {

        setProducts(res.data.data);

      }

    } finally {

      setLoading(false);

    }

  }, [sortBy, minPrice, maxPrice, inStockOnly, selectedCityId]);



  useEffect(() => {

    setLoading(true);

    setProducts([]);

    loadProducts();

  }, [loadProducts]);



  const subtitle = useMemo(

    () => `Fresh groceries delivered across ${cityName}`,

    [cityName]

  );



  const handleProductPress = (product: StoreProduct) => {

    navigation.navigate('ProductDetail', { productId: product.id });

  };



  const clearFilters = () => {

    setMinPrice('');

    setMaxPrice('');

    setInStockOnly(false);

    setSortBy('name-asc');

  };



  return (

    <SafeAreaView style={styles.container} edges={['top']}>

      <MobileHeader onSearchPress={() => navigation.navigate('Search')} />

      <View style={styles.header}>

        <Text style={styles.title}>Shop All Products</Text>

        <Text style={styles.subtitle}>{subtitle}</Text>

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



      <Text style={styles.count}>

        {loading ? 'Loading...' : `Showing ${products.length} products`}

      </Text>



      {loading ? (

        <View style={styles.loader}>

          <ActivityIndicator size="large" color={COLORS.primary600} />

        </View>

      ) : products.length === 0 ? (

        <EmptyState

          icon="shopping-bag"

          title="No products yet"

          message="Try adjusting filters or check back later."

        />

      ) : (

        <FlatList

          data={products}

          numColumns={2}

          keyExtractor={(item) => item.id}

          contentContainerStyle={styles.grid}

          columnWrapperStyle={styles.row}

          renderItem={({ item }) => (

            <View style={styles.gridItem}>

              <ProductCard product={item} onPress={handleProductPress} fullWidth showMobileAddButton />

            </View>

          )}

        />

      )}

    </SafeAreaView>

  );

};



const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: COLORS.gray50 },

  header: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },

  title: { fontSize: 28, fontWeight: '700', color: COLORS.gray900, marginBottom: 4 },

  subtitle: { fontSize: 14, color: COLORS.gray600 },

  count: { fontSize: 13, color: COLORS.gray500, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm },

  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  grid: { paddingHorizontal: SPACING.sm, paddingBottom: 80 },

  row: { justifyContent: 'space-between', paddingHorizontal: SPACING.xs },

  gridItem: { width: '48%', marginBottom: SPACING.md },

});



export default ProductsScreen;

