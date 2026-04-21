import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CategoryStackParamList, Product } from '@types';
import { COLORS, SPACING } from '@utils/constants';
import {
  ProductCard,
  ErrorView,
  EmptyState,
  SkeletonList,
} from '@components';
import { productService } from '@services/product.service';

type CategoryProductsRouteProp = RouteProp<CategoryStackParamList, 'CategoryProducts'>;

export const CategoryProductsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CategoryStackParamList>>();
  const route = useRoute<CategoryProductsRouteProp>();
  const { categoryId, categoryName } = route.params;
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      setError(null);
      const response = await productService.getProductsByCategory(categoryId);
      if (response.success) {
        setProducts(response.data as any);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProducts();
  };

  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorView message={error} onRetry={loadProducts} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{categoryName}</Text>
        <Text style={styles.subtitle}>
          {loading ? 'Loading...' : `${products.length} products`}
        </Text>
      </View>

      {loading ? (
        <SkeletonList count={6} />
      ) : products.length > 0 ? (
        <FlatList
          data={products}
          renderItem={({ item }) => (
            <ProductCard product={item} onPress={handleProductPress} horizontal />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      ) : (
        <EmptyState
          icon="inventory-2"
          title="No products found"
          message={`There are no products in the ${categoryName} category yet`}
          actionTitle="Browse Categories"
          onAction={() => navigation.goBack()}
        />
      )}
    </SafeAreaView>
  );
};

import { Text } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: 4,
  },
  list: {
    padding: SPACING.lg,
  },
});

export default CategoryProductsScreen;
