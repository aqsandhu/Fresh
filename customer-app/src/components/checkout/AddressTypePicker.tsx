import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import {
  ADDRESS_TYPES,
  getAddressTypeLabel,
  normalizeAddressType,
  type AddressTypeValue,
} from '@/constants/addressTypes';

type Props = {
  value: string;
  onChange: (value: AddressTypeValue) => void;
  label?: string;
};

/**
 * Full-width address type selector — labels are never clipped (Work, Other, etc.).
 */
export const AddressTypePicker: React.FC<Props> = ({
  value,
  onChange,
  label = 'Address Type',
}) => {
  const [open, setOpen] = useState(false);
  const normalized = normalizeAddressType(value);
  const displayLabel = getAddressTypeLabel(normalized);

  return (
    <View style={styles.wrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.selectField}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Address type, ${displayLabel}`}
      >
        <Text style={styles.selectValue} numberOfLines={1}>
          {displayLabel}
        </Text>
        <MaterialIcons name="arrow-drop-down" size={24} color={COLORS.gray600} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.typeMenu} onPress={() => {}}>
            {ADDRESS_TYPES.map((t) => {
              const active = normalized === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.typeOption, active && styles.typeOptionActive]}
                  onPress={() => {
                    onChange(t.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[styles.typeOptionText, active && styles.typeOptionTextActive]}
                    numberOfLines={1}
                  >
                    {t.label}
                  </Text>
                  {active && (
                    <MaterialIcons
                      name="check"
                      size={20}
                      color={COLORS.primary600}
                      style={styles.checkIcon}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACING.md },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: SPACING.sm,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray300,
    backgroundColor: COLORS.white,
    minHeight: 48,
  },
  selectValue: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 15,
    color: COLORS.gray900,
    marginRight: SPACING.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  typeMenu: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
    minHeight: 48,
  },
  typeOptionActive: { backgroundColor: COLORS.primary50 },
  typeOptionText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 16,
    color: COLORS.gray800,
  },
  typeOptionTextActive: { color: COLORS.primary700, fontWeight: '600' },
  checkIcon: { marginLeft: SPACING.sm, flexShrink: 0 },
});

export default AddressTypePicker;
