import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { CategoryStackParamList, Product } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { formatCurrency, truncateText } from '@utils/helpers';
import {
  Button,
  QuantitySelector,
  ErrorView,
  Skeleton,
  LoadingOverlay,
} from '@components';
import { productService } from '@services/product.service';
import { useCartStore, useWishlistStore } from '@store';

type ProductDetailRouteProp = RouteProp<CategoryStackParamList, 'ProductDetail'>;

export const ProductDetailScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CategoryStackParamList>>();
  const route = useRoute<ProductDetailRouteProp>();
  const { productId } = route.params;
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  const { addToCart, updateQuantity, removeFromCart, getItemQuantity } = useCartStore();
  const { toggle: toggleWishlist, isWishlisted } = useWishlistStore();
  const cartQuantity = product ? getItemQuantity(product.id) : 0;
  const wishlisted = product ? isWishlisted(product.id) : false;

  const loadProduct = useCallback(async () => {
    try {
      setError(null);
      const response = await productService.getProductById(productId);
      if (response.success) {
        setProduct(response.data);
      } else {
        setError('Product not found');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load product');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  const handleAddToCart = async () => {
    if (product) {
      await addToCart(product, 1);
    }
  };

  const handleIncrement = async () => {
    if (product) {
      await updateQuantity(product.id, cartQuantity + 1);
    }
  };

  const handleDecrement = async () => {
    if (product) {
      if (cartQuantity <= 1) {
        await removeFromCart(product.id);
      } else {
        await updateQuantity(product.id, cartQuantity - 1);
      }
    }
  };

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
        <Skeleton width="100%" height={300} />
        <View style={styles.skeletonContent}>
          <Skeleton width="70%" height={24} />
          <Skeleton width="40%" height={18} style={{ marginTop: 8 }} />
          <Skeleton width="100%" height={60} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => product && toggleWishlist(product)}>
          <MaterialIcons
            name={wishlisted ? 'favorite' : 'favorite-border'}
            size={24}
            color={wishlisted ? COLORS.error : COLORS.gray700}
          />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image Carousel */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: product.images[currentImageIndex] }}
            style={styles.image}
            resizeMode="cover"
          />
          {product.images.length > 1 && (
            <View style={styles.imageDots}>
              {product.images.map((_, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.imageDot,
                    index === currentImageIndex && styles.imageDotActive,
                  ]}
                  onPress={() => setCurrentImageIndex(index)}
                />
              ))}
            </View>
          )}
          {product.originalPrice && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>
                {Math.round(
                  ((product.originalPrice - product.price) / product.originalPrice) * 100
                )}% OFF
              </Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <View style={styles.titleContainer}>
              <Text style={styles.name}>{product.name}</Text>
              <Text style={styles.nameUrdu}>{product.nameUrdu}</Text>
            </View>
            <View style={styles.ratingContainer}>
              <MaterialIcons name="star" size={16} color={COLORS.secondary} />
              <Text style={styles.rating}>{product.rating}</Text>
              <Text style={styles.reviewCount}>({product.reviewCount})</Text>
            </View>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatCurrency(product.price)}</Text>
            <Text style={styles.unit}>/{product.unit}</Text>
            {product.originalPrice && (
              <Text style={styles.originalPrice}>
                {formatCurrency(product.originalPrice)}
              </Text>
            )}
          </View>

          {/* Tags */}
          {product.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {product.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{product.description}</Text>
          </View>

          {/* Nutritional Info */}
          {product.nutritionalInfo && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Nutritional Information</Text>
              <View style={styles.nutritionGrid}>
                {product.nutritionalInfo.calories && (
                  <View style={styles.nutritionItem}>
                    <Text style={styles.nutritionValue}>
                      {product.nutritionalInfo.calories}
                    </Text>
                    <Text style={styles.nutritionLabel}>Calories</Text>
                  </View>
                )}
                {product.nutritionalInfo.protein && (
                  <View style={styles.nutritionItem}>
                    <Text style={styles.nutritionValue}>
                      {product.nutritionalInfo.protein}g
                    </Text>
                    <Text style={styles.nutritionLabel}>Protein</Text>
                  </View>
                )}
                {product.nutritionalInfo.carbs && (
                  <View style={styles.nutritionItem}>
                    <Text style={styles.nutritionValue}>
                      {product.nutritionalInfo.carbs}g
                    </Text>
                    <Text style={styles.nutritionLabel}>Carbs</Text>
                  </View>
                )}
                {product.nutritionalInfo.fat && (
                  <View style={styles.nutritionItem}>
                    <Text style={styles.nutritionValue}>
                      {product.nutritionalInfo.fat}g
                    </Text>
                    <Text style={styles.nutritionLabel}>Fat</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Bottom padding */}
          <View style={styles.bottomPadding} />
        </View>
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomAction}>
        {cartQuantity > 0 ? (
          <View style={styles.quantityContainer}>
            <Text style={styles.quantityLabel}>Quantity:</Text>
            <QuantitySelector
              quantity={cartQuantity}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
              size="large"
            />
          </View>
        ) : (
          <Button
            title="Add to Cart"
            onPress={handleAddToCart}
            size="large"
            style={styles.addButton}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 300,
  },
  imageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    bottom: SPACING.md,
    left: 0,
    right: 0,
  },
  imageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.white + '80',
    marginHorizontal: 4,
  },
  imageDotActive: {
    backgroundColor: COLORS.white,
    width: 20,
  },
  discountBadge: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.lg,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  discountText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  content: {
    padding: SPACING.lg,
  },
  skeletonContent: {
    padding: SPACING.lg,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleContainer: {
    flex: 1,
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  nameUrdu: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.secondary + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  rating: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.secondary,
    marginLeft: 4,
  },
  reviewCount: {
    fontSize: 12,
    color: COLORS.gray500,
    marginLeft: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: SPACING.md,
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  unit: {
    fontSize: 16,
    color: COLORS.gray500,
  },
  originalPrice: {
    fontSize: 16,
    color: COLORS.gray400,
    textDecorationLine: 'line-through',
    marginLeft: SPACING.md,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  tag: {
    backgroundColor: COLORS.primaryLighter,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  tagText: {
    fontSize: 12,
    color: COLORS.primary,
    textTransform: 'capitalize',
  },
  section: {
    marginTop: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: SPACING.sm,
  },
  description: {
    fontSize: 14,
    color: COLORS.gray600,
    lineHeight: 20,
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  nutritionItem: {
    backgroundColor: COLORS.gray50,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    minWidth: 80,
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  nutritionLabel: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  bottomPadding: {
    height: 100,
  },
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  addButton: {
    width: '100%',
  },
});

export default ProductDetailScreen;
