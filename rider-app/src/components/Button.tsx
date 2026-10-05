import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View, ViewStyle, TextStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, TOUCH_TARGET } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'outline' | 'ghost' | 'dark';
export type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  testID?: string;
}

const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: 'transparent' },
  secondary: { bg: colors.info, fg: colors.white, border: 'transparent' },
  success: { bg: colors.success, fg: colors.white, border: 'transparent' },
  danger: { bg: colors.danger, fg: colors.white, border: 'transparent' },
  dark: { bg: colors.gray900, fg: colors.white, border: 'transparent' },
  outline: { bg: 'transparent', fg: colors.primaryDark, border: colors.primary },
  ghost: { bg: 'transparent', fg: colors.textSecondary, border: 'transparent' },
};

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  style,
  textStyle,
  accessibilityLabel,
  testID,
}) => {
  const { bg, fg, border } = palette[variant];
  const isDisabled = disabled || loading;
  const height = size === 'small' ? 40 : size === 'large' ? 56 : TOUCH_TARGET;
  const fontSize = size === 'small' ? typography.size.sm : size === 'large' ? typography.size.lg : typography.size.md;
  const iconSize = size === 'small' ? 16 : size === 'large' ? 24 : 20;
  const textColor = isDisabled && variant !== 'outline' && variant !== 'ghost' ? colors.gray500 : fg;

  const iconNode = icon && !loading ? (
    <MaterialCommunityIcons
      name={icon}
      size={iconSize}
      color={textColor}
      style={iconPosition === 'left' ? styles.iconLeft : styles.iconRight}
    />
  ) : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      style={[
        styles.button,
        {
          height,
          backgroundColor: isDisabled && bg !== 'transparent' ? colors.gray200 : bg,
          borderColor: isDisabled ? colors.gray300 : border,
          borderWidth: variant === 'outline' ? 2 : 0,
          paddingHorizontal: size === 'small' ? spacing.md : spacing.xl,
          opacity: isDisabled && (variant === 'outline' || variant === 'ghost') ? 0.5 : 1,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={textColor} />
          <Text style={[styles.text, { color: textColor, fontSize }, textStyle]}>{title}</Text>
        </View>
      ) : (
        <View style={styles.row}>
          {iconPosition === 'left' && iconNode}
          <Text style={[styles.text, { color: textColor, fontSize }, textStyle]} numberOfLines={1}>
            {title}
          </Text>
          {iconPosition === 'right' && iconNode}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  fullWidth: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { fontWeight: typography.weight.bold, letterSpacing: 0.2 },
  iconLeft: { marginRight: 0 },
  iconRight: { marginLeft: 0 },
});

export default Button;
