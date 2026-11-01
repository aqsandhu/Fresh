import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { StoreProduct } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useCityContext } from '@/context/CityContext';
import { productService } from '@services/product.service';
import { ProductCard } from '@components';

/**
 * Featured cards shown per batch on Home. The first batch keeps the category
 * wall close (a 2-column grid of 100 cards pushed it thousands of pixels down);
 * "View More Products" reveals the next batch of featured products not shown
 * yet, again and again, until every featured product is on screen.
 * Same batch size as website/components/sections/FeaturedProductsSection.tsx.
 */
const HOME_FEATURED_BATCH = 20;

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
  const { data, isLoading: loading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['featured-products', selectedCityId, 'batches', HOME_FEATURED_BATCH],
      initialPageParam: 1,
      queryFn: ({ pageParam }) => productService.getFeaturedPage(pageParam, HOME_FEATURED_BATCH),
      getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
      enabled: !!selectedCityId,
      staleTime: 5 * 60 * 1000,
    });

  // Flatten the batches; a product whose popularity moved between two clicks
  // could come back on a later page — show it once.
  const products = useMemo(() => {
    const seen = new Set<string>();
    const out: StoreProduct[] = [];
    for (const page of data?.pages ?? []) {
      for (const p of page.items) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          out.push(p);
        }
      }
    }
    return out;
  }, [data]);
  const total = data?.pages[0]?.total ?? products.length;
  const remaining = Math.max(total - products.length, 0);

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
        <>
          <View style={styles.grid}>
            {products.map((item) => (
              <View key={item.id} style={styles.gridItem}>
                <ProductCard product={item} onPress={onProductPress} fullWidth showMobileAddButton />
              </View>
            ))}
          </View>

          {/* Next batch of featured products — sits right above the category wall. */}
          {hasNextPage ? (
            <TouchableOpacity
              style={[styles.moreBtn, isFetchingNextPage && styles.moreBtnBusy]}
              onPress={() => {
                if (!isFetchingNextPage) fetchNextPage();
              }}
              disabled={isFetchingNextPage}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`View more products, ${remaining} more`}
            >
              {isFetchingNextPage ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <MaterialIcons name="expand-more" size={26} color={COLORS.white} />
              )}
              <View style={styles.moreTextWrap}>
                <Text style={styles.moreText}>
                  {isFetchingNextPage ? 'Loading…' : 'View More Products'}
                </Text>
                {/* Urdu and the count are separate runs — mixed in one Text
                    the RTL/LTR reordering read "more 28". */}
                <View style={styles.moreSubRow}>
                  <Text style={styles.moreSub}>مزید پروڈکٹس دیکھیں</Text>
                  {remaining > 0 ? (
                    <View style={styles.moreBadge}>
                      <Text style={styles.moreBadgeText}>+{remaining} more</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          ) : null}
        </>
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
  moreBtn: {
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.md,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primary600,
    shadowColor: COLORS.primary700,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  moreBtnBusy: { opacity: 0.85 },
  moreTextWrap: { alignItems: 'center' },
  moreText: { fontSize: 18, fontWeight: '800', color: COLORS.white, letterSpacing: 0.3 },
  moreSubRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 4 },
  moreSub: { fontSize: 13, fontWeight: '600', color: COLORS.primary100 },
  moreBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  moreBadgeText: { fontSize: 12, fontWeight: '800', color: COLORS.white },
});

export default FeaturedProductsSection;
