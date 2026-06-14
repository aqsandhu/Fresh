import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useVariableWeightNotice } from '@store/variableWeightNotice';

/** Urdu popup shown when a customer adds a variable-weight product to the cart. */
export const VariableWeightNoticeModal: React.FC = () => {
  const { open, note, dismiss } = useVariableWeightNotice();

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="scale" size={30} color={COLORS.warning || '#d97706'} />
          </View>
          <Text style={styles.note}>{note}</Text>
          <TouchableOpacity style={styles.btn} onPress={dismiss} activeOpacity={0.85}>
            <Text style={styles.btnText}>سمجھ گیا (OK)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  note: {
    fontSize: 16,
    lineHeight: 30,
    color: COLORS.gray800,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  btn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary600,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: SPACING.xl,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
});

export default VariableWeightNoticeModal;
