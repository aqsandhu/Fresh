import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList, Product } from '@types';
import { COLORS, SPACING } from '@utils/constants';
import {
  SearchBar,
  ProductCard,
  EmptyState,
  SkeletonList,
} from '@components';
import { productService } from '@services/product.service';
import { debounce } from '@utils/helpers';

type SearchScreenRouteProp = RouteProp<HomeStackParamList, 'Search'>;

export const SearchScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<SearchScreenRouteProp>();
  const [searchQuery, setSearchQuery] = useState(route.params?.query || '');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const searchProducts = useCallback(
    debounce(async (query: string) => {
      if (!query.trim()) {
        setProducts([]);
        return;
      }
      setLoading(true);
      try {
        const response = await productService.searchProducts(query);
        if (response.success) {
          setProducts(response.data as any);
        }
      } finally {
        setLoading(false);
      }
    }, 500),
    []
  );

  useEffect(() => {
    if (searchQuery) {
      searchProducts(searchQuery);
    }
  }, [searchQuery]);

  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmit={() => searchProducts(searchQuery)}
          onClear={() => setSearchQuery('')}
          placeholder="Search products..."
          autoFocus
        />
      </View>

      {loading ? (
        <SkeletonList count={5} />
      ) : products.length > 0 ? (
        <FlatList
          data={products}
          renderItem={({ item }) => (
            <ProductCard product={item} onPress={handleProductPress} horizontal />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      ) : searchQuery ? (
        <EmptyState
          icon="search-off"
          title="No products found"
          message={`We couldn't find any products matching "${searchQuery}"`}
          actionTitle="Clear Search"
          onAction={() => setSearchQuery('')}
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
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  searchContainer: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  list: {
    padding: SPACING.lg,
  },
});

export default SearchScreen;
