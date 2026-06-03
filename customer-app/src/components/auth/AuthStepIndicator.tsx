import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';

const STEPS = [
  { key: 'phone', label: 'Phone' },
  { key: 'otp', label: 'OTP' },
  { key: 'profile', label: 'Name' },
  { key: 'pin', label: 'PIN' },
] as const;

export type RegisterStep = (typeof STEPS)[number]['key'];

interface AuthStepIndicatorProps {
  currentStep: RegisterStep;
}

export const AuthStepIndicator: React.FC<AuthStepIndicatorProps> = ({ currentStep }) => {
  const currentIndex =
    currentStep === 'pin' ? STEPS.length - 1 : STEPS.findIndex((s) => s.key === currentStep);

  return (
    <View style={styles.row}>
      {STEPS.map((step, i) => (
        <View key={step.key} style={styles.stepGroup}>
          <View
            style={[
              styles.circle,
              i < currentIndex && styles.circleDone,
              i === currentIndex && styles.circleActive,
            ]}
          >
            {i < currentIndex ? (
              <MaterialIcons name="check" size={14} color={COLORS.white} />
            ) : (
              <Text
                style={[
                  styles.circleText,
                  i === currentIndex && styles.circleTextActive,
                ]}
              >
                {i + 1}
              </Text>
            )}
          </View>
          {i < STEPS.length - 1 && (
            <View style={[styles.line, i < currentIndex && styles.lineDone]} />
          )}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  stepGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDone: {
    backgroundColor: COLORS.primary600,
  },
  circleActive: {
    backgroundColor: COLORS.primary100,
    borderWidth: 2,
    borderColor: COLORS.primary500,
  },
  circleText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gray400,
  },
  circleTextActive: {
    color: COLORS.primary700,
  },
  line: {
    width: 24,
    height: 2,
    backgroundColor: COLORS.gray200,
    marginHorizontal: 4,
  },
  lineDone: {
    backgroundColor: COLORS.primary500,
  },
});

export default AuthStepIndicator;
