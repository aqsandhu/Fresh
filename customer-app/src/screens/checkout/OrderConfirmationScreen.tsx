import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { CartStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { Button } from '@components';

type OrderConfirmationRouteProp = RouteProp<CartStackParamList, 'OrderConfirmation'>;

export const OrderConfirmationScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CartStackParamList>>();
  const route = useRoute<OrderConfirmationRouteProp>();
  const { orderId, slotLabel, slotDate } = route.params;
  const canLeave = useRef(false);

  useEffect(() => {
    // Disable hardware back button; allow programmatic navigation via canLeave ref
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (canLeave.current) return;
      e.preventDefault();
    });
    return unsubscribe;
  }, [navigation]);

  const estimatedDelivery = slotLabel
    ? `${slotDate || 'Today'}, ${slotLabel}`
    : 'Check order details';

  const handleTrackOrder = () => {
    canLeave.current = true;
    navigation.getParent()?.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{
          name: 'Main',
          state: {
            routes: [
              { name: 'Home' },
              { name: 'Categories' },
              { name: 'AttaChakki' },
              {
                name: 'Orders',
                state: {
                  routes: [
                    { name: 'OrdersList' },
                    { name: 'OrderDetail', params: { orderId } },
                  ],
                  index: 1,
                },
              },
              { name: 'Profile' },
            ],
            index: 3,
          },
        }],
      })
    );
  };

  const handleContinueShopping = () => {
    canLeave.current = true;
    navigation.getParent()?.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      })
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <MaterialIcons name="check-circle" size={100} color={COLORS.success} />
        </View>

        {/* Success Message */}
        <Text style={styles.title}>Order Placed!</Text>
        <Text style={styles.subtitle}>
          Your order has been placed successfully
        </Text>

        {/* Order ID */}
        <View style={styles.orderIdContainer}>
          <Text style={styles.orderIdLabel}>Order ID</Text>
          <Text style={styles.orderId}>{orderId}</Text>
        </View>

        {/* Info Cards */}
        <View style={styles.infoContainer}>
          <View style={styles.infoCard}>
            <MaterialIcons name="schedule" size={24} color={COLORS.primary} />
            <Text style={styles.infoTitle}>Estimated Delivery</Text>
            <Text style={styles.infoValue}>{estimatedDelivery}</Text>
          </View>
          <View style={styles.infoCard}>
            <MaterialIcons name="notifications" size={24} color={COLORS.primary} />
            <Text style={styles.infoTitle}>Notifications</Text>
            <Text style={styles.infoValue}>We'll keep you updated</Text>
          </View>
        </View>
      </View>

      {/* Buttons */}
      <View style={styles.footer}>
        <Button
          title="Track Order"
          onPress={handleTrackOrder}
          size="large"
        />
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleContinueShopping}
        >
          <Text style={styles.secondaryButtonText}>Continue Shopping</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORS.success + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.gray900,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.gray500,
    textAlign: 'center',
  },
  orderIdContainer: {
    marginTop: SPACING.xl,
    alignItems: 'center',
  },
  orderIdLabel: {
    fontSize: 14,
    color: COLORS.gray500,
  },
  orderId: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },
  infoContainer: {
    flexDirection: 'row',
    marginTop: SPACING.xl,
    gap: SPACING.md,
  },
  infoCard: {
    flex: 1,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: SPACING.sm,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray900,
    marginTop: 2,
    textAlign: 'center',
  },
  footer: {
    padding: SPACING.lg,
  },
  secondaryButton: {
    marginTop: SPACING.md,
    alignItems: 'center',
    padding: SPACING.md,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
});

export default OrderConfirmationScreen;
