import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { OrdersStackParamList, OrderStatus } from '@types';
import { COLORS, SPACING, BORDER_RADIUS, ORDER_STATUS_MESSAGES } from '@utils/constants';
import { formatDateTime, getStatusColor } from '@utils/helpers';
import { ErrorView, LoadingOverlay } from '@components';
import { orderService } from '@services/order.service';
import { socketService } from '@services/socket.service';
import OrderChat from '@components/OrderChat';

type TrackOrderRouteProp = RouteProp<OrdersStackParamList, 'TrackOrder'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const statusOrder: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
];

interface TrackingData {
  order: {
    id: string;
    order_number: string;
    status: OrderStatus;
    delivery_address?: string;
  };
  timeline: Array<{
    status: string;
    label: string;
    time: string | null;
    completed: boolean;
  }>;
  rider: {
    id: string;
    name: string;
    location: {
      latitude: number;
      longitude: number;
    } | null;
  } | null;
}

export const TrackOrderScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<OrdersStackParamList>>();
  const route = useRoute<TrackOrderRouteProp>();
  const { orderId } = route.params;

  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const loadOrder = useCallback(async () => {
    try {
      setError(null);
      const response = await orderService.trackOrder(orderId);
      if (response.success) {
        setTrackingData(response.data);
      } else {
        setError('Order not found');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Setup socket for real-time order updates
  useEffect(() => {
    loadOrder();

    const setupSocket = async () => {
      await socketService.connect();

      // Subscribe to order-specific updates
      socketService.subscribeToOrder(orderId, (data: any) => {
        console.log('[TrackOrder] Real-time update:', data);
        // Refresh order data on any update
        loadOrder();
      });

      // Listen for rider assignment
      socketService.on('order:rider_assigned', (data: any) => {
        if (data.orderId === orderId) {
          loadOrder();
        }
      });

      // Listen for status changes
      socketService.on('order:status_changed', (data: any) => {
        if (data.orderId === orderId) {
          loadOrder();
        }
      });

      // Listen for delivery confirmation
      socketService.on('order:delivered', (data: any) => {
        if (data.orderId === orderId) {
          loadOrder();
          Alert.alert('Delivered!', data.message || 'Your order has been delivered!');
        }
      });
    };

    setupSocket();

    // Connection status check
    const connectionInterval = setInterval(() => {
      setIsSocketConnected(socketService.isConnected());
    }, 5000);

    // Keep REST polling as fallback every 30s
    const pollInterval = setInterval(loadOrder, 30000);

    return () => {
      socketService.unsubscribeFromOrder(orderId);
      socketService.off('order:rider_assigned');
      socketService.off('order:status_changed');
      socketService.off('order:delivered');
      clearInterval(connectionInterval);
      clearInterval(pollInterval);
    };
  }, [orderId, loadOrder]);

  const currentStatusIndex = trackingData
    ? statusOrder.indexOf(trackingData.order.status)
    : -1;

  const handleCallRider = async () => {
    Alert.alert('Info', 'Rider contact not available from tracking');
  };

  const riderLocation = trackingData?.rider?.location || {
    latitude: 32.5742,
    longitude: 74.0789,
  };

  const deliveryLocation = {
    latitude: 32.5742,
    longitude: 74.0789,
  };

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorView message={error} onRetry={loadOrder} />
      </SafeAreaView>
    );
  }

  if (loading || !trackingData) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingOverlay visible={true} message="Loading..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Track Order</Text>
          <View style={styles.liveIndicator}>
            <View style={[styles.liveDot, isSocketConnected && styles.liveDotActive]} />
            <Text style={[styles.liveText, isSocketConnected && styles.liveTextActive]}>
              {isSocketConnected ? 'LIVE' : 'Reconnecting...'}
            </Text>
          </View>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: (riderLocation.latitude + deliveryLocation.latitude) / 2,
              longitude: (riderLocation.longitude + deliveryLocation.longitude) / 2,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
          >
            {/* Rider Marker */}
            <Marker coordinate={riderLocation}>
              <View style={styles.riderMarker}>
                <MaterialIcons name="delivery-dining" size={24} color={COLORS.white} />
              </View>
            </Marker>

            {/* Delivery Location Marker */}
            <Marker coordinate={deliveryLocation}>
              <View style={styles.deliveryMarker}>
                <MaterialIcons name="home" size={20} color={COLORS.white} />
              </View>
            </Marker>

            {/* Route Line */}
            <Polyline
              coordinates={[riderLocation, deliveryLocation]}
              strokeColor={COLORS.primary}
              strokeWidth={3}
            />
          </MapView>

          {/* Rider Info Card */}
          {trackingData.rider && (
            <View style={styles.riderCard}>
              <View style={styles.riderAvatar}>
                <MaterialIcons name="person" size={24} color={COLORS.gray400} />
              </View>
              <View style={styles.riderInfo}>
                <Text style={styles.riderName}>{trackingData.rider.name}</Text>
              </View>
              <TouchableOpacity
                style={styles.callButton}
                onPress={handleCallRider}
                activeOpacity={0.7}
              >
                <MaterialIcons name="phone" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Status Timeline */}
        <View style={styles.timelineSection}>
          <Text style={styles.sectionTitle}>Order Status</Text>
          <View style={styles.timeline}>
            {statusOrder.map((status, index) => {
              const isCompleted = index <= currentStatusIndex;
              const isCurrent = index === currentStatusIndex;
              const statusColor = getStatusColor(status);

              return (
                <View key={status} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    <View
                      style={[
                        styles.timelineDot,
                        isCompleted && { backgroundColor: statusColor },
                        isCurrent && styles.timelineDotCurrent,
                      ]}
                    >
                      {isCompleted && (
                        <MaterialIcons
                          name="check"
                          size={14}
                          color={COLORS.white}
                        />
                      )}
                    </View>
                    {index < statusOrder.length - 1 && (
                      <View
                        style={[
                          styles.timelineLine,
                          index < currentStatusIndex && { backgroundColor: statusColor },
                        ]}
                      />
                    )}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text
                      style={[
                        styles.timelineTitle,
                        isCompleted && styles.timelineTitleCompleted,
                        isCurrent && { color: statusColor, fontWeight: 'bold' },
                      ]}
                    >
                      {ORDER_STATUS_MESSAGES[status]?.en}
                    </Text>
                    <Text style={styles.timelineUrdu}>
                      {ORDER_STATUS_MESSAGES[status]?.ur}
                    </Text>
                    {isCurrent && false && (
                      <Text style={styles.estimatedTime}>
                        Estimated delivery time
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Chat with Rider */}
        {trackingData.order.status !== 'delivered' && trackingData.order.status !== 'cancelled' && (
          <View style={styles.chatSection}>
            <OrderChat orderId={orderId} orderStatus={trackingData.order.status} />
          </View>
        )}

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerCenter: {
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.gray400,
  },
  liveDotActive: {
    backgroundColor: '#FF3B30',
  },
  liveText: {
    fontSize: 10,
    color: COLORS.gray400,
    fontWeight: '600',
  },
  liveTextActive: {
    color: '#FF3B30',
  },
  mapContainer: {
    height: 300,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  riderMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  deliveryMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  riderCard: {
    position: 'absolute',
    bottom: SPACING.md,
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  riderInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  riderName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  riderVehicle: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryLighter,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.gray900,
    marginBottom: SPACING.md,
  },
  timeline: {
    paddingLeft: SPACING.sm,
  },
  timelineItem: {
    flexDirection: 'row',
  },
  timelineLeft: {
    alignItems: 'center',
    width: 24,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.gray300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDotCurrent: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.gray200,
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  timelineTitle: {
    fontSize: 14,
    color: COLORS.gray500,
  },
  timelineTitleCompleted: {
    color: COLORS.gray700,
    fontWeight: '500',
  },
  timelineUrdu: {
    fontSize: 12,
    color: COLORS.gray400,
    marginTop: 2,
  },
  estimatedTime: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 4,
    fontWeight: '500',
  },
  chatSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
  bottomPadding: {
    height: SPACING.xxl,
  },
});

export default TrackOrderScreen;
