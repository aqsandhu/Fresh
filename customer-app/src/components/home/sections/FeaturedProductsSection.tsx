import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StoreProduct } from '@types';
import { COLORS, SPACING } from '@utils/constants';
import { ProductCard } from '@components';

interface FeaturedProductsSectionProps {
  products: StoreProduct[];
  loading: boolean;
  onProductPress: (product: StoreProduct) => void;
  onViewAll: () => void;
}

export const FeaturedProductsSection: React.FC<FeaturedProductsSectionProps> = ({
  products,
  loading,
  onProductPress,
  onViewAll,
}) => (
  <View style={styles.wrap}>
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

const styles = StyleSheet.create({
  wrap: { paddingVertical: SPACING.xl, backgroundColor: COLORS.gray50 },
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
