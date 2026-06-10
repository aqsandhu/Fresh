import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ProductUnit, StoreProduct } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { formatCurrency } from '@utils/helpers';
import { getUnitOptions, getUnitPickerDisplayLabel, UNIT_PICKER_CHIP } from '@/lib/unitPricing';

interface UnitSelectorProps {
  product: StoreProduct;
  selectedUnit: ProductUnit;
  onChange: (unit: ProductUnit) => void;
  size?: 'sm' | 'md';
}

export function getSelectedUnitPrice(product: StoreProduct, unit: ProductUnit): number {
  const opts = getUnitOptions(product);
  return opts.find((o) => o.unit === unit)?.price ?? product.price;
}

export const UnitSelector: React.FC<UnitSelectorProps> = ({
  product,
  selectedUnit,
  onChange,
  size = 'sm',
}) => {
  const unitOptions = useMemo(() => getUnitOptions(product), [product]);
  const [open, setOpen] = useState(false);

  if (unitOptions.length <= 1) return null;

  const chipStyle = size === 'md' ? styles.chipMd : styles.chipSm;
  const chipTextStyle = size === 'md' ? styles.chipTextMd : styles.chipTextSm;
  const displayLabel = getUnitPickerDisplayLabel(product, selectedUnit, unitOptions);

  return (
    <View>
      <TouchableOpacity style={[styles.chip, chipStyle]} onPress={() => setOpen(true)}>
        <Text style={[styles.chipText, chipTextStyle]}>
          {displayLabel}
        </Text>
        <MaterialIcons name="expand-more" size={size === 'md' ? 20 : 16} color={UNIT_PICKER_CHIP.textColor} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            {unitOptions.map((opt) => (
              <TouchableOpacity
                key={opt.unit}
                style={[styles.option, selectedUnit === opt.unit && styles.optionActive]}
                onPress={() => {
                  onChange(opt.unit);
                  setOpen(false);
                }}
              >
                <Text
                  style={[styles.optionLabel, selectedUnit === opt.unit && styles.optionLabelActive]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
                <Text style={styles.optionPrice}>{formatCurrency(opt.price)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    backgroundColor: UNIT_PICKER_CHIP.backgroundColor,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: UNIT_PICKER_CHIP.borderColor,
    gap: 4,
  },
  chipSm: { paddingHorizontal: 10, paddingVertical: 9 },
  chipMd: { paddingHorizontal: 14, paddingVertical: 11 },
  chipText: { color: UNIT_PICKER_CHIP.textColor, fontWeight: '600', flex: 1 },
  chipTextSm: { fontSize: 12 },
  chipTextMd: { fontSize: 14 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  menu: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
    gap: SPACING.sm,
  },
  optionActive: { backgroundColor: UNIT_PICKER_CHIP.backgroundColor },
  optionLabel: { flex: 1, flexShrink: 1, fontSize: 14, color: COLORS.gray700 },
  optionLabelActive: { color: UNIT_PICKER_CHIP.textColor, fontWeight: '700' },
  optionPrice: { flexShrink: 0, fontSize: 14, fontWeight: '600', color: COLORS.gray600 },
});

export default UnitSelector;
