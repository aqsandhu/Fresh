import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { OrdersStackParamList, Order, RootStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS, ORDER_STATUS_MESSAGES } from '@utils/constants';
import { formatCurrency, formatDate, getStatusColor } from '@utils/helpers';
import { ErrorView, EmptyState, SkeletonList, Button } from '@components';
import { MobileHeader } from '@components/layout/MobileHeader';
import { orderService } from '@services/order.service';
import { useAuthStore } from '@store';
import { useCityContext } from '@/context/CityContext';

type OrderTab = 'all' | 'active' | 'completed';

const tabs: { label: string; value: OrderTab }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
];

export const OrdersListScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<OrdersStackParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isAuthenticated } = useAuthStore();
  const { selectedCityId } = useCityContext();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<OrderTab>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setError(null);
      const response = await orderService.getOrders();
      if (response.success) {
        setOrders(response.data.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCityId]);

  useEffect(() => {
    if (!isAuthenticated) {
      rootNavigation.navigate('Auth', { screen: 'Login', params: { redirect: 'Orders' } });
      return;
    }
    setLoading(true);
    setOrders([]);
    loadOrders();
  }, [isAuthenticated, loadOrders, rootNavigation, selectedCityId]);

  useEffect(() => {
    if (activeTab === 'all') {
      setFilteredOrders(orders);
    } else if (activeTab === 'active') {
      setFilteredOrders(
        orders.filter(
          (o) => o.status !== 'delivered' && o.status !== 'cancelled'
        )
      );
    } else {
      setFilteredOrders(
        orders.filter((o) => o.status === 'delivered' || o.status === 'cancelled')
      );
    }
  }, [activeTab, orders]);

  const handleCancelOrder = (orderId: string) => {
    Alert.alert('Cancel Order', 'Are you sure you want to cancel this order?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await orderService.cancelOrder(orderId);
            Toast.show({ type: 'success', text1: 'Order cancelled successfully' });
            loadOrders();
          } catch (err: any) {
            Toast.show({ type: 'error', text1: err.message || 'Failed to cancel order' });
          }
        },
      },
    ]);
  };

  const handleReorder = () => {
    Toast.show({ type: 'success', text1: 'Items added to cart!' });
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const handleOrderPress = (order: Order) => {
    navigation.navigate('OrderDetail', { orderId: order.id });
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const statusColor = getStatusColor(item.status);

    return (
      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderId}>Order #{item.orderNumber || item.id.slice(0, 8)}</Text>
            <Text style={styles.orderDate}>{formatDate(item.createdAt)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {ORDER_STATUS_MESSAGES[item.status]?.en}
            </Text>
          </View>
        </View>

        <View style={styles.orderItems}>
          {item.items.map((orderItem, idx) => (
            <View key={`${item.id}-${idx}`} style={styles.orderItemRow}>
              <Image source={{ uri: orderItem.productImage }} style={styles.itemImage} />
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {orderItem.productName}
                </Text>
                <Text style={styles.itemQuantity}>
                  {orderItem.quantity} × {formatCurrency(orderItem.price)}
                </Text>
              </View>
              <Text style={styles.itemLineTotal}>
                {formatCurrency(orderItem.price * orderItem.quantity)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.orderFooter}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(item.total)}</Text>
        </View>

        <View style={styles.orderActions}>
          {(item.status === 'out_for_delivery' || item.status === 'out-for-delivery') && (
            <Button
              title="Track Order"
              size="small"
              onPress={() => navigation.navigate('TrackOrder', { orderId: item.id })}
              style={styles.actionBtn}
            />
          )}
          {item.status === 'delivered' && (
            <Button
              title="Reorder"
              variant="outline"
              size="small"
              onPress={handleReorder}
              style={styles.actionBtn}
            />
          )}
          {(item.status === 'pending' || item.status === 'confirmed' || item.status === 'preparing') && (
            <Button
              title="Cancel Order"
              variant="outline"
              size="small"
              onPress={() => handleCancelOrder(item.id)}
              style={styles.actionBtn}
            />
          )}
          <Button
            title="View Details"
            variant="outline"
            size="small"
            onPress={() => handleOrderPress(item)}
            style={styles.actionBtn}
          />
        </View>
      </View>
    );
  };

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorView message={error} onRetry={loadOrders} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <MobileHeader
        onSearchPress={() =>
          rootNavigation.navigate('Main', {
            screen: 'Shop',
            params: { screen: 'Search' },
          })
        }
      />
      <View style={styles.header}>
        <Text style={styles.title}>My Orders</Text>
      </View>

      {/* Tabs — website pill style */}
      <View style={styles.tabsContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.tab, activeTab === tab.value && styles.tabActive]}
            onPress={() => setActiveTab(tab.value)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.value && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <SkeletonList count={5} />
      ) : filteredOrders.length > 0 ? (
        <FlatList
          data={filteredOrders}
          renderItem={renderOrder}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      ) : (
        <EmptyState
          icon="receipt-long"
          title="No orders yet"
          message="You haven't placed any orders yet. Start shopping to see your orders here."
          actionTitle="Shop Now"
          onAction={() =>
            rootNavigation.navigate('Main', {
              screen: 'Shop',
              params: { screen: 'ProductsMain' },
            })
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
  },
  tabActive: {
    backgroundColor: COLORS.primary600,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray600,
    textTransform: 'capitalize',
  },
  tabTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  list: {
    padding: SPACING.lg,
  },
  orderCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  orderId: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  orderDate: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderItems: {
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  itemImage: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.md,
  },
  itemInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray900,
  },
  itemQuantity: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  itemLineTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  moreItems: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 2,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingTop: SPACING.md,
  },
  totalLabel: {
    fontSize: 14,
    color: COLORS.gray500,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  orderActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  actionBtn: { flex: 1, minWidth: '45%' },
});

export default OrdersListScreen;
