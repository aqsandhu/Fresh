import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList, Product } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { formatCurrency } from '@utils/helpers';
import { Button, EmptyState } from '@components';
import { useWishlistStore, useCartStore } from '@store';

export const WishlistScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { items, remove, clear } = useWishlistStore();
  const { addToCart } = useCartStore();

  const handleRemove = (productId: string) => {
    remove(productId);
  };

  const handleAddToCart = async (product: Product) => {
    if (!product.inStock) {
      Alert.alert('Out of Stock', 'This item is currently out of stock.');
      return;
    }
    try {
      await addToCart(product, 1);
      Alert.alert('Added to Cart', `${product.name} added to cart.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add to cart');
    }
  };

  const handleClear = () => {
    if (items.length === 0) return;
    Alert.alert(
      'Clear Wishlist',
      'Are you sure you want to remove all items from your wishlist?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => clear() },
      ]
    );
  };

  const handleProductPress = (productId: string) => {
    navigation.dispatch(
      CommonActions.navigate({
        name: 'Categories',
        params: {
          screen: 'ProductDetail',
          params: { productId },
        },
      })
    );
  };

  const renderItem = ({ item }: { item: { id: string; product: Product } }) => {
    const product = item.product;
    const outOfStock = !product || !product.inStock;
    const imageUri = product.images && product.images.length > 0 ? product.images[0] : '';
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleProductPress(product.id)}
        activeOpacity={0.8}
      >
        <View style={styles.imageWrap}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <MaterialIcons name="image" size={36} color={COLORS.gray400} />
            </View>
          )}
          {outOfStock && (
            <View style={styles.outOfStockBadge}>
              <Text style={styles.outOfStockText}>Out of Stock</Text>
            </View>
          )}
        </View>

        <View style={styles.details}>
          <Text style={styles.name} numberOfLines={1}>
            {product.name}
          </Text>
          {!!product.unit && (
            <Text style={styles.unit}>
              {product.unit}
            </Text>
          )}
          <Text style={styles.price}>{formatCurrency(product.price)}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.addBtn, outOfStock && styles.addBtnDisabled]}
              onPress={() => handleAddToCart(product)}
              disabled={outOfStock}
            >
              <MaterialIcons name="add-shopping-cart" size={16} color={COLORS.white} />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => handleRemove(product.id)}
            >
              <MaterialIcons name="delete-outline" size={20} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wishlist</Text>
        {items.length > 0 ? (
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.clearBtn} />
        )}
      </View>

      {items.length === 0 ? (
        <EmptyState
          icon="favorite-border"
          title="Your Wishlist is Empty"
          message="Save your favorite items here and find them quickly later."
          actionTitle="Start Shopping"
          onAction={() =>
            navigation.dispatch(CommonActions.navigate({ name: 'Home' }))
          }
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.gray900,
    textAlign: 'center',
  },
  clearBtn: {
    minWidth: 56,
    alignItems: 'flex-end',
  },
  clearText: {
    color: COLORS.error,
    fontWeight: '600',
    fontSize: 14,
  },
  list: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  imageWrap: {
    position: 'relative',
    width: 90,
    height: 90,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.gray100,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  outOfStockBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 2,
    backgroundColor: 'rgba(244, 67, 54, 0.85)',
    alignItems: 'center',
  },
  outOfStockText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '600',
  },
  details: {
    flex: 1,
    marginLeft: SPACING.md,
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  unit: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
  },
  addBtnDisabled: {
    backgroundColor: COLORS.gray400,
  },
  addBtnText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 4,
  },
  removeBtn: {
    marginLeft: SPACING.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.error + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default WishlistScreen;
