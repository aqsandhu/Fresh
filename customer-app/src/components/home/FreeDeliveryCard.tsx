import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, DELIVERY } from '@utils/constants';
import { isFreeDelivery } from '@utils/helpers';

interface FreeDeliveryCardProps {
  cartSubtotal?: number;
}

export const FreeDeliveryCard: React.FC<FreeDeliveryCardProps> = ({
  cartSubtotal = 0,
}) => {
  const freeDelivery = isFreeDelivery(cartSubtotal);
  const remaining = DELIVERY.FREE_DELIVERY_MIN_ORDER - cartSubtotal;

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
          {freeDelivery ? 'Free Delivery Applied!' : 'Free Delivery Available'}
        </Text>
        <Text style={[styles.subtitle, freeDelivery && styles.textActive]}>
          {freeDelivery
            ? 'Your order qualifies for free delivery'
            : `Add Rs. ${remaining} more for free delivery (${DELIVERY.FREE_DELIVERY_START_TIME} - ${DELIVERY.FREE_DELIVERY_END_TIME})`}
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
