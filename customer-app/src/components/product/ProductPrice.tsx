import React from 'react';
import { Text, TextStyle, View, ViewStyle } from 'react-native';
import { COLORS } from '@utils/constants';
import { formatCurrency, formatProductUnitSuffix } from '@utils/helpers';

interface ProductPriceProps {
  price: number;
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  priceStyle?: TextStyle;
  unitStyle?: TextStyle;
  originalPrice?: number;
  /** Keeps price on one line inside narrow product cards */
  compact?: boolean;
  /** Strikethrough above sale price — clearer on narrow product cards */
  stackDiscount?: boolean;
}

const sizeStyles = {
  sm: { price: 16, unit: 11, original: 13 },
  md: { price: 18, unit: 12, original: 14 },
  lg: { price: 22, unit: 13, original: 15 },
};

export const ProductPrice: React.FC<ProductPriceProps> = ({
  price,
  unit,
  size = 'md',
  style,
  priceStyle,
  unitStyle,
  originalPrice,
  compact = false,
  stackDiscount = false,
}) => {
  const sizes = sizeStyles[size];
  const unitSuffix = formatProductUnitSuffix(unit);
  const hasDiscount = originalPrice != null && originalPrice > price;
  const showOriginal = !compact && hasDiscount;

  const priceRow = (
    <View style={{ flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'baseline', minWidth: 0 }}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit={compact}
        minimumFontScale={compact ? 0.88 : 1}
        style={[
          { fontWeight: '700', color: COLORS.primary600, fontSize: sizes.price, flexShrink: 1 },
          priceStyle,
        ]}
      >
        {formatCurrency(price)}
      </Text>
      {!!unitSuffix && (
        <Text
          numberOfLines={1}
          style={[
            {
              color: COLORS.gray500,
              fontSize: sizes.unit,
              fontWeight: '400',
              flexShrink: 0,
              marginLeft: 2,
            },
            unitStyle,
          ]}
        >
          {unitSuffix}
        </Text>
      )}
    </View>
  );

  if (showOriginal && stackDiscount) {
    return (
      <View style={[{ flexShrink: 1, minWidth: 0 }, style]}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: sizes.original,
            color: COLORS.gray400,
            textDecorationLine: 'line-through',
            marginBottom: 2,
          }}
        >
          {formatCurrency(originalPrice)}
        </Text>
        {priceRow}
      </View>
    );
  }

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          flexShrink: 1,
          minWidth: 0,
          gap: 4,
        },
        style,
      ]}
    >
      {showOriginal && (
        <Text
          numberOfLines={1}
          style={{
            fontSize: sizes.original,
            color: COLORS.gray400,
            textDecorationLine: 'line-through',
            flexShrink: 0,
          }}
        >
          {formatCurrency(originalPrice)}
        </Text>
      )}
      {priceRow}
    </View>
  );
};

export default ProductPrice;
