import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { truncateText, formatCurrency } from '@utils/helpers';
import { ProductPrice } from './ProductPrice';
import { ProductQuality, ProductUnit, StoreProduct } from '@app-types';
import { useCartStore } from '@store';
import { useVariableWeightNotice } from '@store/variableWeightNotice';
import {
  getUnitOptions,
  getUnitPickerDisplayLabel,
  UNIT_PICKER_CHIP,
  offeredQualities,
  qualityStock,
} from '@/lib/unitPricing';

interface ProductCardProps {
  product: StoreProduct;
  onPress?: (product: StoreProduct) => void;
  horizontal?: boolean;
  fullWidth?: boolean;
  showMobileAddButton?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onPress,
  horizontal = false,
  fullWidth = false,
  showMobileAddButton = false,
}) => {
  const mobileAdd = showMobileAddButton || fullWidth;
  const { addItem, updateQuantity, removeItem, getItemQuantity } = useCartStore();
  const notifyVariableWeight = useVariableWeightNotice((s) => s.notify);
  // Quality tiers (A/B/C) — mirrors website ProductCard + app ProductDetailScreen.
  // B/C only appear when the admin has set that tier's consumer price.
  const qualities = useMemo(() => offeredQualities(product), [product]);
  const [selectedQuality, setSelectedQuality] = useState<ProductQuality>('A');
  const unitOptions = useMemo(
    () => getUnitOptions(product, selectedQuality),
    [product, selectedQuality]
  );
  const hasFractionUnits = unitOptions.length > 1;
  const [selectedUnit, setSelectedUnit] = useState<ProductUnit>('full');
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);

  const activeOption = unitOptions.find((o) => o.unit === selectedUnit) || unitOptions[0];
  const displayPrice = activeOption?.price ?? product.price;
  // Stock is per-quality (shared with restaurants) — the selected tier's bucket.
  const inStock = qualityStock(product, selectedQuality) > 0;
  const compareAtPrice =
    selectedQuality === 'A' &&
    selectedUnit === 'full' &&
    product.originalPrice != null &&
    product.originalPrice > displayPrice
      ? product.originalPrice
      : undefined;
  const quantity = getItemQuantity(product.id, selectedUnit, selectedQuality);

  const selectQuality = (q: ProductQuality) => {
    setSelectedQuality(q);
    setSelectedUnit('full');
  };

  const qualitySelector =
    qualities.length > 1 ? (
      <View style={styles.qualityRow}>
        <Text style={styles.qualityLabel}>QUALITY</Text>
        <View style={styles.qualityToggle}>
          {qualities.map((q) => {
            const active = selectedQuality === q;
            return (
              <TouchableOpacity
                key={q}
                style={[styles.qualitySeg, active && styles.qualitySegActive]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  selectQuality(q);
                }}
              >
                <Text style={[styles.qualitySegText, active && styles.qualitySegTextActive]}>
                  {q}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    ) : null;

  const handleAddToCart = async () => {
    if (!inStock) return;
    await addItem(product, 1, selectedUnit, selectedQuality);
    if (product.isVariableWeight) {
      notifyVariableWeight(product.id, product.variableWeightNote);
    }
  };

  const handleIncrement = async () => {
    await updateQuantity(product.id, quantity + 1, selectedUnit, selectedQuality);
  };

  const handleDecrement = async () => {
    if (quantity <= 1) {
      await removeItem(product.id, selectedUnit, selectedQuality);
    } else {
      await updateQuantity(product.id, quantity - 1, selectedUnit, selectedQuality);
    }
  };

  const unitPicker = hasFractionUnits ? (
    <>
      <TouchableOpacity style={styles.unitPicker} onPress={() => setUnitMenuOpen(true)}>
        <Text style={styles.unitPickerText}>
          {getUnitPickerDisplayLabel(product, selectedUnit, unitOptions)}
        </Text>
        <MaterialIcons name="expand-more" size={18} color={UNIT_PICKER_CHIP.textColor} />
      </TouchableOpacity>
      <Modal visible={unitMenuOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setUnitMenuOpen(false)}>
          <View style={styles.unitMenu}>
            {unitOptions.map((opt) => (
              <TouchableOpacity
                key={opt.unit}
                style={[styles.unitOption, selectedUnit === opt.unit && styles.unitOptionActive]}
                onPress={() => {
                  setSelectedUnit(opt.unit);
                  setUnitMenuOpen(false);
                }}
              >
                <Text style={styles.unitOptionLabel} numberOfLines={1}>
                  {opt.label}
                </Text>
                <Text style={styles.unitOptionPrice}>{formatCurrency(opt.price)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  ) : null;

  const cartControls =
    quantity > 0 ? (
      <View style={styles.quantityControl}>
        <TouchableOpacity onPress={handleDecrement} style={styles.quantityBtn}>
          <MaterialIcons
            name={quantity <= 1 ? 'delete-outline' : 'remove'}
            size={16}
            color={quantity <= 1 ? COLORS.error : COLORS.gray600}
          />
        </TouchableOpacity>
        <Text style={styles.quantityText}>{quantity}</Text>
        <TouchableOpacity onPress={handleIncrement} style={styles.quantityBtnPlus}>
          <MaterialIcons name="add" size={16} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    ) : (
      <TouchableOpacity onPress={handleAddToCart} style={styles.addBtn}>
        <MaterialIcons name="add" size={20} color={COLORS.white} />
      </TouchableOpacity>
    );

  const mobileInlineStepper =
    quantity > 0 ? (
      <View style={styles.mobileInlineStepper}>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            handleDecrement();
          }}
          style={styles.mobileStepperBtn}
        >
          <MaterialIcons
            name={quantity <= 1 ? 'delete-outline' : 'remove'}
            size={14}
            color={quantity <= 1 ? COLORS.error : COLORS.gray600}
          />
        </TouchableOpacity>
        <Text style={styles.mobileStepperQty}>{quantity}</Text>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            handleIncrement();
          }}
          style={[styles.mobileStepperBtn, styles.mobileStepperBtnPlus]}
        >
          <MaterialIcons name="add" size={14} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    ) : null;

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
          {qualitySelector}
          {unitPicker}
          <ProductPrice
            price={displayPrice}
            unit={product.unit}
            size="md"
            originalPrice={compareAtPrice}
            stackDiscount
          />
        </View>
        <View style={styles.actionContainer}>{inStock ? cartControls : null}</View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, fullWidth && styles.cardFullWidth]}
      onPress={() => onPress?.(product)}
      activeOpacity={0.9}
    >
      <View style={styles.imageWrap}>
        {product.images[0] ? (
          <Image source={{ uri: product.images[0] }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imageFallback]}>
            <MaterialIcons name="shopping-cart" size={32} color={COLORS.gray300} />
          </View>
        )}
        <View style={styles.badgeStack}>
          {product.isFresh !== false && inStock && (
            <View style={styles.freshBadge}>
              <MaterialIcons name="eco" size={10} color={COLORS.white} />
              <Text style={styles.freshText}>Fresh</Text>
            </View>
          )}
          {product.originalPrice ? (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>
                -{Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
              </Text>
            </View>
          ) : null}
        </View>
        {!inStock ? (
          <View style={styles.outOfStockBadge}>
            <Text style={styles.outOfStockText}>Out of Stock</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        {product.nameUrdu ? (
          <Text style={styles.nameUrdu} numberOfLines={1}>
            {product.nameUrdu}
          </Text>
        ) : null}
        {qualitySelector}
        {unitPicker}
        {!mobileAdd ? (
          <View style={styles.footer}>
            <ProductPrice
              price={displayPrice}
              unit={product.unit}
              size="md"
              originalPrice={compareAtPrice}
              stackDiscount
            />
            {inStock ? cartControls : null}
          </View>
        ) : (
          <>
            <View style={styles.mobilePriceRow}>
              <ProductPrice
                price={displayPrice}
                unit={product.unit}
                size="md"
                originalPrice={compareAtPrice}
                stackDiscount
              />
            </View>
            {!inStock ? (
              <View style={styles.mobileOutOfStockRow}>
                <Text style={styles.mobileOutOfStockText}>Out of Stock</Text>
              </View>
            ) : quantity > 0 ? (
              <View style={styles.mobileStepperRow}>{mobileInlineStepper}</View>
            ) : (
              <TouchableOpacity
                style={styles.mobileAddBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleAddToCart();
                }}
              >
                <MaterialIcons name="add-shopping-cart" size={16} color={COLORS.white} />
                <Text style={styles.mobileAddBtnText}>Add to Cart</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 160,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    marginRight: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    overflow: 'hidden',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  cardFullWidth: {
    width: '100%',
    marginRight: 0,
  },
  imageWrap: { position: 'relative', aspectRatio: 1, backgroundColor: COLORS.gray50 },
  image: { width: '100%', height: '100%' },
  imageFallback: { justifyContent: 'center', alignItems: 'center' },
  badgeStack: { position: 'absolute', top: 8, left: 8, gap: 4 },
  discountBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  freshBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  freshText: { color: COLORS.white, fontSize: 10, fontWeight: '700' },
  outOfStockBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: COLORS.gray500,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  outOfStockText: { color: COLORS.white, fontSize: 10, fontWeight: '700' },
  discountText: { color: COLORS.white, fontSize: 10, fontWeight: '700' },
  content: { padding: SPACING.sm, flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.gray900, minHeight: 20 },
  nameUrdu: { fontSize: 14, fontWeight: '700', color: COLORS.gray800, marginBottom: 4, textAlign: 'right' },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  qualityLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: COLORS.gray400,
  },
  qualityToggle: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.lg,
    padding: 2,
  },
  qualitySeg: {
    flex: 1,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualitySegActive: {
    backgroundColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  qualitySegText: { fontSize: 12, fontWeight: '700', color: COLORS.gray500 },
  qualitySegTextActive: { color: COLORS.primary700 },
  mobileOutOfStockRow: {
    marginTop: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gray100,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.lg,
  },
  mobileOutOfStockText: { color: COLORS.gray500, fontSize: 13, fontWeight: '700' },
  unitPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: UNIT_PICKER_CHIP.backgroundColor,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: UNIT_PICKER_CHIP.borderColor,
  },
  unitPickerText: {
    flex: 1,
    fontSize: 12,
    color: UNIT_PICKER_CHIP.textColor,
    fontWeight: '600',
    marginRight: 6,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: SPACING.xs,
  },
  mobilePriceRow: {
    marginTop: 'auto',
    paddingTop: SPACING.xs,
  },
  mobileStepperRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACING.xs,
  },
  addBtn: {
    backgroundColor: COLORS.primary600,
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  quantityBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  quantityBtnPlus: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.primary600,
    borderRadius: BORDER_RADIUS.full,
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary600,
    minWidth: 24,
    textAlign: 'center',
  },
  horizontalCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  horizontalImage: { width: 80, height: 80, borderRadius: BORDER_RADIUS.md },
  horizontalContent: { flex: 1, marginLeft: SPACING.md, justifyContent: 'center' },
  actionContainer: { justifyContent: 'center', marginLeft: SPACING.md },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  unitMenu: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  unitOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
    gap: SPACING.sm,
  },
  unitOptionActive: { backgroundColor: UNIT_PICKER_CHIP.backgroundColor },
  unitOptionLabel: { flex: 1, flexShrink: 1, fontSize: 14, color: COLORS.gray800, fontWeight: '500' },
  unitOptionPrice: { flexShrink: 0, fontSize: 14, fontWeight: '600', color: COLORS.primary600 },
  mobileAddBtn: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary600,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.lg,
  },
  mobileAddBtnText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  mobileInlineStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary50,
    borderRadius: BORDER_RADIUS.xl,
    padding: 2,
    flexShrink: 0,
  },
  mobileStepperBtn: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileStepperBtnPlus: {
    backgroundColor: COLORS.primary600,
    borderWidth: 0,
  },
  mobileStepperQty: {
    minWidth: 26,
    paddingHorizontal: 2,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary700,
  },
});

export default ProductCard;
