import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { StoreProduct } from '@app-types';
import { COLORS, SPACING } from '@utils/constants';
import { useCityContext } from '@/context/CityContext';
import { productService } from '@services/product.service';
import { ProductCard } from '@components';

interface FeaturedProductsSectionProps {
  onProductPress: (product: StoreProduct) => void;
  onViewAll: () => void;
}

/** Self-fetches (react-query) like the website — robust to city-ready timing. */
export const FeaturedProductsSection: React.FC<FeaturedProductsSectionProps> = ({
  onProductPress,
  onViewAll,
}) => {
  const { selectedCityId } = useCityContext();
  const { data: products = [], isLoading: loading } = useQuery({
    queryKey: ['featured-products', selectedCityId],
    queryFn: async () => {
      const res = await productService.getFeaturedProducts(500);
      return res.success ? res.data : [];
    },
    enabled: !!selectedCityId,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <View style={styles.wrap}>
      {/* Subtle top wash — matches website bg-gradient-to-b white → gray-50. */}
      <LinearGradient colors={['#ffffff', '#f9fafb']} style={StyleSheet.absoluteFill} />
      <Text style={styles.title}>Featured Products</Text>

      <TouchableOpacity style={styles.viewAll} onPress={onViewAll} activeOpacity={0.75}>
        <Text style={styles.viewAllText}>Click to View All Products</Text>
        <MaterialIcons name="arrow-forward" size={16} color={COLORS.primary600} />
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color={COLORS.primary600} style={{ paddingVertical: SPACING.xl }} />
      ) : products.length === 0 ? (
        <Text style={styles.empty}>No featured products available at the moment.</Text>
      ) : (
        <View style={styles.grid}>
          {products.map((item) => (
            <View key={item.id} style={styles.gridItem}>
              <ProductCard product={item} onPress={onProductPress} fullWidth showMobileAddButton />
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  // Website: pt-5 (20px) / pb-10 (40px) — first section under the navbar.
  wrap: { paddingTop: 20, paddingBottom: 40, backgroundColor: COLORS.gray50 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.gray900,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  viewAllText: { fontSize: 14, fontWeight: '600', color: COLORS.primary600, textAlign: 'center' },
  empty: { textAlign: 'center', color: COLORS.gray500, paddingVertical: SPACING.xl },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  gridItem: { width: '48%' },
});

export default FeaturedProductsSection;
