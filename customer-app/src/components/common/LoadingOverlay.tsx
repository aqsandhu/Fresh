import React from 'react';
import { View, StyleSheet, ActivityIndicator, Modal, Text } from 'react-native';
import { COLORS, SPACING } from '@utils/constants';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  visible,
  message,
}) => {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          {message && <Text style={styles.message}>{message}</Text>}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: COLORS.white,
    padding: SPACING.xl,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 150,
  },
  message: {
    marginTop: SPACING.md,
    fontSize: 14,
    color: COLORS.gray700,
    textAlign: 'center',
  },
});

export default LoadingOverlay;
