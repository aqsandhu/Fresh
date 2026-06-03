import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { HomeStackParamList, RootStackParamList, StoreProduct } from '@types';
import { COLORS, SPACING } from '@utils/constants';
import { SearchBar, ProductCard, EmptyState, SkeletonList } from '@components';
import {
  ProductFiltersToolbar,
  SortOption,
} from '@components/shop/ProductFiltersToolbar';
import { productService } from '@services/product.service';
import { debounce } from '@utils/helpers';
import { useCityContext } from '@/context/CityContext';

type SearchScreenRouteProp = RouteProp<HomeStackParamList, 'Search'>;

export const SearchScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<SearchScreenRouteProp>();
  const { selectedCityId } = useCityContext();
  const [searchQuery, setSearchQuery] = useState(route.params?.query || '');
  const [rawProducts, setRawProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);

  const searchProducts = useCallback(
    debounce(async (query: string) => {
      if (!query.trim()) {
        setRawProducts([]);
        return;
      }
      setLoading(true);
      try {
        const response = await productService.searchProducts(query);
        if (response.success) {
          setRawProducts(response.data);
        }
      } finally {
        setLoading(false);
      }
    }, 500),
    [selectedCityId]
  );

  useEffect(() => {
    if (searchQuery) {
      setRawProducts([]);
      searchProducts(searchQuery);
    } else {
      setRawProducts([]);
    }
  }, [searchQuery, searchProducts, selectedCityId]);

  const products = useMemo(() => {
    let list = [...rawProducts];
    if (minPrice) list = list.filter((p) => p.price >= parseInt(minPrice, 10));
    if (maxPrice) list = list.filter((p) => p.price <= parseInt(maxPrice, 10));
    if (inStockOnly) list = list.filter((p) => p.inStock);
    list.sort((a, b) => {
      switch (sortBy) {
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'relevance':
        default:
          return 0;
      }
    });
    return list;
  }, [rawProducts, sortBy, minPrice, maxPrice, inStockOnly]);

  const handleProductPress = (product: StoreProduct) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  const clearFilters = () => {
    setMinPrice('');
    setMaxPrice('');
    setInStockOnly(false);
    setSortBy('relevance');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <View style={styles.searchWrap}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmit={() => searchProducts(searchQuery)}
            onClear={() => setSearchQuery('')}
            placeholder="Search products..."
            autoFocus
          />
        </View>
      </View>

      {searchQuery.trim().length >= 2 && (
        <>
          <Text style={styles.pageTitle}>Search Results</Text>
          <Text style={styles.resultCount}>
            {loading ? 'Searching...' : `${products.length} results for "${searchQuery}"`}
          </Text>
          <ProductFiltersToolbar
            sortBy={sortBy}
            onSortChange={setSortBy}
            minPrice={minPrice}
            maxPrice={maxPrice}
            inStockOnly={inStockOnly}
            onMinPriceChange={setMinPrice}
            onMaxPriceChange={setMaxPrice}
            onInStockOnlyChange={setInStockOnly}
            onApply={() => {}}
            onClear={clearFilters}
            hideRelevance={false}
          />
        </>
      )}

      {loading ? (
        <SkeletonList count={5} />
      ) : products.length > 0 ? (
        <FlatList
          data={products}
          numColumns={2}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <View style={styles.gridItem}>
              <ProductCard
                product={item}
                onPress={handleProductPress}
                fullWidth
                showMobileAddButton
              />
            </View>
          )}
        />
      ) : searchQuery ? (
        <EmptyState
          icon="search-off"
          title="No Results Found"
          message={`We couldn't find any products matching "${searchQuery}". Try a different search term or browse our categories.`}
          actionTitle="View All Products"
          onAction={() =>
            rootNavigation.navigate('Main', {
              screen: 'Shop',
              params: { screen: 'ProductsMain' },
            })
          }
          secondaryActionTitle="Go Home"
          onSecondaryAction={() => navigation.navigate('HomeMain')}
        />
      ) : (
        <EmptyState
          icon="search"
          title="Search Products"
          message="Type to search for vegetables, fruits, and more"
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
    gap: SPACING.sm,
  },
  backBtn: { padding: 4 },
  searchWrap: { flex: 1 },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.gray900,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  resultCount: {
    fontSize: 14,
    color: COLORS.gray600,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  grid: { paddingHorizontal: SPACING.md, paddingBottom: 80 },
  row: { gap: SPACING.sm, marginBottom: SPACING.sm },
  gridItem: { flex: 1 },
});

export default SearchScreen;
