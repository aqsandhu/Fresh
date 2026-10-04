import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, radius } from '../../theme';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
  round?: boolean;
}

/** Pulsing placeholder for loading lists. */
const Skeleton: React.FC<SkeletonProps> = ({ width = '100%', height = 16, style, round }) => {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius: round ? height / 2 : radius.sm, opacity },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  base: { backgroundColor: colors.gray200 },
});

export default Skeleton;
