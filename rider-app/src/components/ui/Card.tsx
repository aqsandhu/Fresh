import React from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity, StyleProp } from 'react-native';
import { colors, radius, spacing, shadow } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Left accent stripe colour (task type / status). */
  accent?: string;
  padded?: boolean;
  testID?: string;
}

const Card: React.FC<CardProps> = ({ children, style, onPress, accent, padded = true, testID }) => {
  const content = (
    <View
      style={[
        styles.card,
        padded && styles.padded,
        accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null,
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
        {content}
      </TouchableOpacity>
    );
  }
  return content;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  padded: {
    padding: spacing.lg,
  },
});

export default Card;
