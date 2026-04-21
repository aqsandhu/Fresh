import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { COLORS, BORDER_RADIUS } from '@utils/constants';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = BORDER_RADIUS.sm,
  style,
}) => {
  const shimmer = useSharedValue(0);

  React.useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1500 }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(shimmer.value, [0, 1], [0.3, 0.7]),
    };
  });

  return (
    <View style={[styles.container, { width, height, borderRadius }, style]}>
      <Animated.View style={[styles.shimmer, animatedStyle]} />
    </View>
  );
};

// Skeleton components for common patterns
export const SkeletonCard: React.FC = () => (
  <View style={styles.card}>
    <Skeleton width="100%" height={150} borderRadius={BORDER_RADIUS.md} />
    <View style={styles.cardContent}>
      <Skeleton width="70%" height={20} />
      <Skeleton width="40%" height={16} style={{ marginTop: 8 }} />
      <Skeleton width="50%" height={16} style={{ marginTop: 8 }} />
    </View>
  </View>
);

export const SkeletonProduct: React.FC = () => (
  <View style={styles.product}>
    <Skeleton width={120} height={120} borderRadius={BORDER_RADIUS.md} />
    <Skeleton width={100} height={16} style={{ marginTop: 8 }} />
    <Skeleton width={60} height={14} style={{ marginTop: 4 }} />
  </View>
);

export const SkeletonList: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <View style={styles.list}>
    {Array.from({ length: count }).map((_, index) => (
      <View key={index} style={styles.listItem}>
        <Skeleton width={60} height={60} borderRadius={BORDER_RADIUS.md} />
        <View style={styles.listItemContent}>
          <Skeleton width="60%" height={18} />
          <Skeleton width="40%" height={14} style={{ marginTop: 8 }} />
        </View>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.gray200,
    overflow: 'hidden',
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.gray300,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    marginBottom: 16,
  },
  cardContent: {
    padding: 16,
  },
  product: {
    alignItems: 'center',
    padding: 12,
  },
  list: {
    padding: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  listItemContent: {
    flex: 1,
    marginLeft: 12,
  },
});

export default Skeleton;
