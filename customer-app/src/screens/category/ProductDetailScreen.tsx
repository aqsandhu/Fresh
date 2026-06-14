import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ShopStackParamList, ProductUnit, StoreProduct } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import {
  ErrorView,
  Skeleton,
  ProductPrice,
  ProductCard,
  ProductReviews,
} from '@components';
import { UnitSelector, getSelectedUnitPrice } from '@components/product/UnitSelector';
import { productService } from '@services/product.service';
import { orderService } from '@services/order.service';
import { useCartStore, useWishlistStore } from '@store';
import { useVariableWeightNotice } from '@store/variableWeightNotice';
import { useCityContext } from '@/context/CityContext';
import { TAB_BAR_BASE_HEIGHT } from '@/lib/tabBarMetrics';

type ProductDetailRouteProp = RouteProp<ShopStackParamList, 'ProductDetail'>;

export const ProductDetailScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ShopStackParamList>>();
  const route = useRoute<ProductDetailRouteProp>();
  const { productId } = route.params;

  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedUnit, setSelectedUnit] = useState<ProductUnit>('full');
  const [quantity, setQuantity] = useState(1);
  const [freeThreshold, setFreeThreshold] = useState(500);

  const { addItem, items } = useCartStore();
  const notifyVariableWeight = useVariableWeightNotice((s) => s.notify);
  const { toggle: toggleWishlist, isWishlisted } = useWishlistStore();
  const { selectedCityId } = useCityContext();
  const insets = useSafeAreaInsets();
  const scrollBottomPad = TAB_BAR_BASE_HEIGHT + insets.bottom + SPACING.md;

  const cartItem = useMemo(
    () =>
      product
        ? items.find(
            (item) =>
              item.product.id === product.id && (item.unit || 'full') === selectedUnit
          )
        : undefined,
    [items, product, selectedUnit]
  );
  const inCart = Boolean(cartItem);
  const wishlisted = product ? isWishlisted(product.id) : false;
  const displayPrice = product ? getSelectedUnitPrice(product, selectedUnit) : 0;

  const loadProduct = useCallback(async () => {
    try {
      setError(null);
      const response = await productService.getProductById(productId);
      if (response.success) {
        setProduct(response.data);
        if (response.data.categoryId) {
          const relatedRes = await productService.getProductsByCategory(response.data.categoryId, {
            limit: 5,
          });
          if (relatedRes.success) {
            setRelatedProducts(
              relatedRes.data.filter((p) => p.id !== productId).slice(0, 4)
            );
          }
        }
      } else {
        setError('Product not found');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load product');
    } finally {
      setLoading(false);
    }
  }, [productId, selectedCityId]);

  useEffect(() => {
    setLoading(true);
    setProduct(null);
    setRelatedProducts([]);
    loadProduct();
  }, [loadProduct]);

  useEffect(() => {
    if (!selectedCityId) return;
    orderService.getDeliverySettings().then((res) => {
      if (res.success && res.data?.free_delivery_threshold) {
        setFreeThreshold(res.data.free_delivery_threshold);
      }
    });
  }, [selectedCityId]);

  const handleAddToCart = async () => {
    if (!product || !product.inStock) return;
    await addItem(product, quantity, selectedUnit);
    if (product.isVariableWeight) {
      notifyVariableWeight(product.id, product.variableWeightNote);
    }
  };

  const handleShare = async () => {
    if (!product) return;
    try {
      await Share.share({
        message: `Check out ${product.name} on Fresh Bazar!`,
      });
    } catch {
      /* user cancelled */
    }
  };

  const handleRelatedPress = (item: StoreProduct) => {
    navigation.push('ProductDetail', { productId: item.id });
  };

  const maxQuantity = product?.stock && product.stock > 0 ? product.stock : 99;

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorView message={error} onRetry={loadProduct} />
      </SafeAreaView>
    );
  }

  if (loading || !product) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
          </TouchableOpacity>
        </View>
        <Skeleton width="100%" height={280} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.breadcrumb}>
          <TouchableOpacity
            onPress={() =>
              (navigation.getParent() as any)?.navigate('Home', { screen: 'HomeMain' })
            }
          >
            <Text style={styles.breadcrumbLink}>Home</Text>
          </TouchableOpacity>
          <MaterialIcons name="chevron-right" size={16} color={COLORS.gray400} />
          {product.categoryName ? (
            <>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('CategoryProducts', {
                    categoryId: product.categoryId,
                    categoryName: product.categoryName || 'Category',
                  })
                }
              >
                <Text style={styles.breadcrumbLink}>{product.categoryName}</Text>
              </TouchableOpacity>
              <MaterialIcons name="chevron-right" size={16} color={COLORS.gray400} />
            </>
          ) : null}
          <Text style={styles.breadcrumbCurrent} numberOfLines={1}>
            {product.name}
          </Text>
        </View>

        <View style={styles.productSection}>
          <View style={styles.imageSection}>
            {product.images[currentImageIndex] ? (
              <Image source={{ uri: product.images[currentImageIndex] }} style={styles.image} />
            ) : (
              <View style={[styles.image, styles.imageFallback]}>
                <MaterialIcons name="shopping-cart" size={48} color={COLORS.gray300} />
              </View>
            )}
            {product.isFresh && product.inStock && (
              <View style={styles.freshBadge}>
                <MaterialIcons name="eco" size={12} color={COLORS.white} />
                <Text style={styles.freshBadgeText}>Fresh</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.wishlistBtn}
              onPress={() => toggleWishlist(product as any)}
            >
              <MaterialIcons
                name={wishlisted ? 'favorite' : 'favorite-border'}
                size={20}
                color={wishlisted ? COLORS.error : COLORS.gray600}
              />
            </TouchableOpacity>
            {product.images.length > 1 && (
              <View style={styles.imageDots}>
                {product.images.map((_, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.imageDot, index === currentImageIndex && styles.imageDotActive]}
                    onPress={() => setCurrentImageIndex(index)}
                  />
                ))}
              </View>
            )}
          </View>

          <View style={styles.infoSection}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{product.name}</Text>
              {product.nameUrdu ? (
                <Text style={styles.nameUrdu}>{product.nameUrdu}</Text>
              ) : null}
            </View>

            {product.rating ? (
              <View style={styles.ratingRow}>
                <MaterialIcons name="star" size={18} color="#FACC15" />
                <Text style={styles.ratingValue}>{product.rating}</Text>
                <Text style={styles.ratingDivider}>|</Text>
                <Text style={styles.reviewCount}>{product.reviewCount || 0} reviews</Text>
              </View>
            ) : null}

            <View style={styles.priceShareRow}>
              <View style={styles.priceBlock}>
                <ProductPrice
                  price={displayPrice}
                  unit={product.unit}
                  size="lg"
                  originalPrice={product.originalPrice}
                />
              </View>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.7}>
                <MaterialIcons name="share" size={20} color={COLORS.gray600} />
              </TouchableOpacity>
            </View>

            <View style={styles.unitPickerWrap}>
              <UnitSelector
                product={product}
                selectedUnit={selectedUnit}
                onChange={setSelectedUnit}
                size="md"
              />
            </View>

            {product.description ? (
              <Text style={styles.description}>{product.description}</Text>
            ) : null}

            <View style={styles.featuresGrid}>
              <View style={styles.featureItem}>
                <MaterialIcons name="local-shipping" size={16} color={COLORS.primary600} />
                <Text style={styles.featureText}>
                  Free Delivery on Rs. {freeThreshold}+ Sabzi/Fruits
                </Text>
              </View>
              <View style={styles.featureItem}>
                <MaterialIcons name="verified-user" size={16} color={COLORS.primary600} />
                <Text style={styles.featureText}>Freshness Guaranteed</Text>
              </View>
            </View>

            {!product.inStock ? (
              <View style={styles.stockBadgeDanger}>
                <Text style={styles.stockBadgeDangerText}>Out of Stock</Text>
              </View>
            ) : product.isFresh ? (
              <View style={styles.stockBadgeSuccess}>
                <Text style={styles.stockBadgeSuccessText}>
                  In Stock ({product.stock ?? '—'} {product.unit}s available)
                </Text>
              </View>
            ) : null}

            {product.inStock && (
              <View style={styles.addToCartRow}>
                <View style={styles.websiteQtyBox}>
                  <TouchableOpacity
                    style={styles.qtyCircleBtn}
                    onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                  >
                    <MaterialIcons
                      name="remove"
                      size={18}
                      color={quantity <= 1 ? COLORS.gray400 : COLORS.gray700}
                    />
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyCircleBtn}
                    onPress={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                    disabled={quantity >= maxQuantity}
                  >
                    <MaterialIcons
                      name="add"
                      size={18}
                      color={quantity >= maxQuantity ? COLORS.gray400 : COLORS.gray700}
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.websiteAddBtn, inCart && styles.websiteAddBtnInCart]}
                  onPress={handleAddToCart}
                  activeOpacity={0.85}
                >
                  <MaterialIcons
                    name={inCart ? 'check-circle' : 'add-shopping-cart'}
                    size={20}
                    color={COLORS.white}
                  />
                  <Text style={styles.websiteAddBtnText}>
                    {inCart ? 'Added to Cart' : 'Add to Cart'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <ProductReviews productId={product.id} />

        {relatedProducts.length > 0 && (
          <View style={styles.relatedSection}>
            <Text style={styles.sectionTitle}>Related Products</Text>
            <View style={styles.relatedGrid}>
              {relatedProducts.map((item) => (
                <View key={item.id} style={styles.relatedItem}>
                  <ProductCard
                    product={item}
                    onPress={handleRelatedPress}
                    fullWidth
                    showMobileAddButton
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: scrollBottomPad }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backBtn: { padding: 4 },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 4,
  },
  breadcrumbLink: { fontSize: 12, color: COLORS.primary600, fontWeight: '500' },
  breadcrumbCurrent: { fontSize: 12, color: COLORS.gray500, flex: 1 },
  productSection: {
    backgroundColor: COLORS.white,
    paddingBottom: SPACING.lg,
  },
  imageSection: {
    position: 'relative',
    marginHorizontal: SPACING.md,
    marginTop: 4,
    aspectRatio: 1,
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  imageFallback: { justifyContent: 'center', alignItems: 'center' },
  freshBadge: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
  },
  freshBadgeText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  wishlistBtn: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  imageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    bottom: SPACING.sm,
    left: 0,
    right: 0,
    gap: 6,
  },
  imageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  imageDotActive: { backgroundColor: COLORS.white, width: 22 },
  infoSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: 8,
    rowGap: 2,
    marginBottom: 4,
  },
  name: { fontSize: 22, fontWeight: '700', color: COLORS.gray900, lineHeight: 28 },
  nameUrdu: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray600,
    lineHeight: 24,
    textAlign: 'right',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  ratingValue: { fontSize: 15, fontWeight: '700', color: COLORS.gray900 },
  ratingDivider: { color: COLORS.gray300 },
  reviewCount: { fontSize: 13, color: COLORS.gray500 },
  priceShareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  priceBlock: { flex: 1, minWidth: 0 },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  unitPickerWrap: { marginBottom: SPACING.sm },
  description: {
    fontSize: 14,
    color: COLORS.gray600,
    lineHeight: 22,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  stockBadgeSuccess: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary50,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary100,
  },
  stockBadgeSuccessText: { fontSize: 12, fontWeight: '700', color: COLORS.primary700 },
  stockBadgeDanger: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.sm,
  },
  stockBadgeDangerText: { fontSize: 12, fontWeight: '700', color: COLORS.error },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '48%',
    minWidth: '46%',
  },
  featureText: { flex: 1, fontSize: 12, color: COLORS.gray600, lineHeight: 16 },
  relatedSection: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  relatedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  relatedItem: { width: '48%' },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: COLORS.gray900 },
  addToCartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  websiteQtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    backgroundColor: COLORS.white,
  },
  qtyCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.gray900,
  },
  websiteAddBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary600,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.lg,
  },
  websiteAddBtnInCart: {
    backgroundColor: COLORS.primary700,
  },
  websiteAddBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ProductDetailScreen;
