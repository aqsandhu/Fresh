import React from 'react';
import { Text, TextStyle, ViewStyle } from 'react-native';
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
}

const sizeStyles = {
  sm: { price: 14, unit: 10, original: 12 },
  md: { price: 16, unit: 11, original: 13 },
  lg: { price: 24, unit: 14, original: 16 },
};

export const ProductPrice: React.FC<ProductPriceProps> = ({
  price,
  unit,
  size = 'md',
  style,
  priceStyle,
  unitStyle,
  originalPrice,
}) => {
  const sizes = sizeStyles[size];
  const unitSuffix = formatProductUnitSuffix(unit);

  return (
    <Text style={style}>
      <Text
        style={[
          { fontWeight: 'bold', color: COLORS.primary, fontSize: sizes.price },
          priceStyle,
        ]}
      >
        {formatCurrency(price)}
      </Text>
      {!!unitSuffix && (
        <Text
          style={[
            { color: COLORS.gray500, fontSize: sizes.unit, fontWeight: 'normal' },
            unitStyle,
          ]}
        >
          {unitSuffix}
        </Text>
      )}
      {originalPrice != null && originalPrice > price && (
        <Text
          style={{
            fontSize: sizes.original,
            color: COLORS.gray400,
            textDecorationLine: 'line-through',
            marginLeft: 6,
          }}
        >
          {formatCurrency(originalPrice)}
        </Text>
      )}
    </Text>
  );
};

export default ProductPrice;
