import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../utils/constants';
import { getTranslation } from '../utils/helpers';
import { useSettingsStore } from '../store/settingsStore';

interface StatusToggleProps {
  isOnline: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

const StatusToggle: React.FC<StatusToggleProps> = ({
  isOnline,
  onToggle,
  isLoading = false,
  disabled = false,
}) => {
  const { language } = useSettingsStore();
  const progress = useSharedValue(isOnline ? 1 : 0);

  // Update progress when isOnline changes
  React.useEffect(() => {
    progress.value = withSpring(isOnline ? 1 : 0, {
      stiffness: 500,
      damping: 30,
    });
  }, [isOnline]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      [COLORS.gray200, `${COLORS.primary}20`]
    );
    return { backgroundColor };
  });

  const animatedThumbStyle = useAnimatedStyle(() => {
    const translateX = progress.value * 60;
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      [COLORS.gray500, COLORS.primary]
    );
    return {
      transform: [{ translateX }],
      backgroundColor,
    };
  });

  const getStatusText = () => {
    if (isLoading) {
      return language === 'ur' ? 'انتظار کریں...' : 'Please wait...';
    }
    return isOnline
      ? getTranslation('online', language)
      : getTranslation('offline', language);
  };

  const getStatusIcon = () => {
    return isOnline ? 'radio-tower' : 'radio-tower';
  };

  return (
    <TouchableOpacity
      style={[styles.container, disabled && styles.disabled]}
      onPress={onToggle}
      disabled={disabled || isLoading}
      activeOpacity={0.8}
    >
      <Animated.View style={[styles.toggleContainer, animatedContainerStyle]}>
        <Animated.View style={[styles.thumb, animatedThumbStyle]}>
          {isLoading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <MaterialCommunityIcons
              name={getStatusIcon()}
              size={20}
              color={COLORS.white}
            />
          )}
        </Animated.View>
      </Animated.View>
      <View style={styles.textContainer}>
        <Text
          style={[
            styles.statusText,
            { color: isOnline ? COLORS.primary : COLORS.gray500 },
          ]}
        >
          {getStatusText()}
        </Text>
        <Text style={styles.subText}>
          {isOnline
            ? language === 'ur'
              ? 'آپ آن لائن ہیں اور کام وصول کر سکتے ہیں'
              : 'You are online and can receive tasks'
            : language === 'ur'
            ? 'آپ آف لائن ہیں - کام وصول نہیں ہوں گے'
            : 'You are offline - no tasks will be assigned'}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    marginHorizontal: SPACING.md,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  disabled: {
    opacity: 0.6,
  },
  toggleContainer: {
    width: 100,
    height: 44,
    borderRadius: BORDER_RADIUS.full,
    padding: 4,
    justifyContent: 'center',
  },
  thumb: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.full,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  textContainer: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  statusText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  subText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});

export default StatusToggle;
