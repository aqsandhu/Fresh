import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { formatCurrency, truncateText } from '@utils/helpers';
import { Product } from '@types';
import { useCartStore } from '@store';

interface ProductCardProps {
  product: Product;
  onPress?: (product: Product) => void;
  horizontal?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onPress,
  horizontal = false,
}) => {
  const { addToCart, updateQuantity, removeFromCart, getItemQuantity } = useCartStore();
  const quantity = getItemQuantity(product.id);

  const handleAddToCart = async () => {
    await addToCart(product, 1);
  };

  const handleIncrement = async () => {
    await updateQuantity(product.id, quantity + 1);
  };

  const handleDecrement = async () => {
    if (quantity <= 1) {
      await removeFromCart(product.id);
    } else {
      await updateQuantity(product.id, quantity - 1);
    }
  };

  if (horizontal) {
    return (
      <TouchableOpacity
        style={styles.horizontalCard}
        onPress={() => onPress?.(product)}
        activeOpacity={0.9}
      >
        <Image source={{ uri: product.images[0] }} style={styles.horizontalImage} />
        <View style={styles.horizontalContent}>
          <Text style={styles.name}>{truncateText(product.name, 25)}</Text>
          <Text style={styles.unit}>{product.unit}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatCurrency(product.price)}</Text>
            {product.originalPrice && (
              <Text style={styles.originalPrice}>
                {formatCurrency(product.originalPrice)}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.actionContainer}>
          {quantity > 0 ? (
            <View style={styles.quantityControl}>
              <TouchableOpacity onPress={handleDecrement} style={styles.quantityBtn}>
                <MaterialIcons name="remove" size={18} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.quantityText}>{quantity}</Text>
              <TouchableOpacity onPress={handleIncrement} style={styles.quantityBtn}>
                <MaterialIcons name="add" size={18} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={handleAddToCart} style={styles.addBtn}>
              <MaterialIcons name="add" size={20} color={COLORS.white} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress?.(product)}
      activeOpacity={0.9}
    >
      <Image source={{ uri: product.images[0] }} style={styles.image} />
      {product.originalPrice && (
        <View style={styles.discountBadge}>
          <Text style={styles.discountText}>
            {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
          </Text>
        </View>
      )}
      <View style={styles.content}>
        <Text style={styles.name}>{truncateText(product.name, 20)}</Text>
        <Text style={styles.unit}>{product.unit}</Text>
        <View style={styles.footer}>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatCurrency(product.price)}</Text>
            {product.originalPrice && (
              <Text style={styles.originalPrice}>
                {formatCurrency(product.originalPrice)}
              </Text>
            )}
          </View>
          {quantity > 0 ? (
            <View style={styles.quantityControl}>
              <TouchableOpacity onPress={handleDecrement} style={styles.quantityBtn}>
                <MaterialIcons name="remove" size={16} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.quantityText}>{quantity}</Text>
              <TouchableOpacity onPress={handleIncrement} style={styles.quantityBtn}>
                <MaterialIcons name="add" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={handleAddToCart} style={styles.addBtn}>
              <MaterialIcons name="add" size={20} color={COLORS.white} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 160,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    marginRight: SPACING.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  image: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  discountText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
  content: {
    padding: SPACING.sm,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  unit: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  originalPrice: {
    fontSize: 12,
    color: COLORS.gray400,
    textDecorationLine: 'line-through',
    marginLeft: SPACING.xs,
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLighter,
    borderRadius: BORDER_RADIUS.md,
  },
  quantityBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    minWidth: 24,
    textAlign: 'center',
  },
  // Horizontal styles
  horizontalCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  horizontalImage: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.md,
  },
  horizontalContent: {
    flex: 1,
    marginLeft: SPACING.md,
    justifyContent: 'center',
  },
  actionContainer: {
    justifyContent: 'center',
    marginLeft: SPACING.md,
  },
});

export default ProductCard;
