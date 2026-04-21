import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';

interface QuantitySelectorProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  minQuantity?: number;
  maxQuantity?: number;
  size?: 'small' | 'medium' | 'large';
}

export const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  quantity,
  onIncrement,
  onDecrement,
  minQuantity = 1,
  maxQuantity = 99,
  size = 'medium',
}) => {
  const sizeStyles = {
    small: { btn: 24, icon: 14, text: 12 },
    medium: { btn: 32, icon: 18, text: 14 },
    large: { btn: 40, icon: 24, text: 16 },
  };

  const { btn, icon, text } = sizeStyles[size];

  const canDecrement = quantity > minQuantity;
  const canIncrement = quantity < maxQuantity;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={onDecrement}
        disabled={!canDecrement}
        style={[
          styles.button,
          { width: btn, height: btn },
          !canDecrement && styles.buttonDisabled,
        ]}
        activeOpacity={0.8}
      >
        <MaterialIcons
          name="remove"
          size={icon}
          color={canDecrement ? COLORS.primary : COLORS.gray400}
        />
      </TouchableOpacity>

      <Text style={[styles.quantity, { fontSize: text }]}>{quantity}</Text>

      <TouchableOpacity
        onPress={onIncrement}
        disabled={!canIncrement}
        style={[
          styles.button,
          { width: btn, height: btn },
          !canIncrement && styles.buttonDisabled,
        ]}
        activeOpacity={0.8}
      >
        <MaterialIcons
          name="add"
          size={icon}
          color={canIncrement ? COLORS.primary : COLORS.gray400}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLighter,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.xs,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  quantity: {
    fontWeight: '600',
    color: COLORS.primary,
    minWidth: 32,
    textAlign: 'center',
    paddingHorizontal: SPACING.sm,
  },
});

export default QuantitySelector;
