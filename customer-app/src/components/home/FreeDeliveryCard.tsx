import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, DELIVERY } from '@utils/constants';

interface FreeDeliveryCardProps {
  /** Vegetables + fruits subtotal (only this counts toward the threshold). */
  vegFruitSubtotal?: number;
}

export const FreeDeliveryCard: React.FC<FreeDeliveryCardProps> = ({
  vegFruitSubtotal = 0,
}) => {
  const threshold = DELIVERY.FREE_DELIVERY_MIN_ORDER;
  const freeDelivery = vegFruitSubtotal >= threshold;
  const remaining = Math.max(0, threshold - vegFruitSubtotal);

  return (
    <View style={[styles.container, freeDelivery && styles.containerActive]}>
      <View style={styles.iconContainer}>
        <MaterialIcons
          name="local-shipping"
          size={28}
          color={freeDelivery ? COLORS.white : COLORS.primary}
        />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, freeDelivery && styles.textActive]}>
          {freeDelivery ? 'Free Delivery Unlocked!' : 'Free Delivery Available'}
        </Text>
        <Text style={[styles.subtitle, freeDelivery && styles.textActive]}>
          {freeDelivery
            ? `Rs. ${vegFruitSubtotal} in vegetables/fruits qualifies your order.`
            : `Add Rs. ${remaining} more in vegetables/fruits for free delivery (other items don't count).`}
        </Text>
      </View>
      {freeDelivery && (
        <MaterialIcons name="check-circle" size={24} color={COLORS.white} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLighter,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
  },
  containerActive: {
    backgroundColor: COLORS.primary,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.white + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.gray600,
    marginTop: 2,
  },
  textActive: {
    color: COLORS.white,
  },
});

export default FreeDeliveryCard;
