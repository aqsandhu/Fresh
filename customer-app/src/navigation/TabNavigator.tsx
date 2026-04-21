import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { MainTabParamList, RootStackParamList } from '@types';
import { COLORS, SPACING } from '@utils/constants';
import { useCartStore, useNotificationStore } from '@store';

import { HomeNavigator } from './HomeNavigator';
import { CategoryNavigator } from './CategoryNavigator';
import { AttaNavigator } from './AttaNavigator';
import { OrdersNavigator } from './OrdersNavigator';
import { ProfileNavigator } from './ProfileNavigator';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TabBarIcon: React.FC<{
  name: string;
  color: string;
  badge?: number;
}> = ({ name, color, badge }) => (
  <View>
    <MaterialIcons name={name as any} size={24} color={color} />
    {badge ? (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
      </View>
    ) : null}
  </View>
);

export const TabNavigator: React.FC = () => {
  const { itemCount } = useCartStore();
  const { getUnreadCount } = useNotificationStore();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const cartCount = itemCount();

  return (
    <View style={{ flex: 1 }}>
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray400,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeNavigator}
        options={{
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="home" color={color} />
          ),
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Categories"
        component={CategoryNavigator}
        options={{
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="category" color={color} />
          ),
          tabBarLabel: 'Categories',
        }}
      />
      <Tab.Screen
        name="AttaChakki"
        component={AttaNavigator}
        options={{
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="grain" color={color} />
          ),
          tabBarLabel: 'Atta',
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersNavigator}
        options={{
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="receipt-long" color={color} />
          ),
          tabBarLabel: 'Orders',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="person" color={color} />
          ),
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>

    {/* Floating Cart Button */}
    {cartCount > 0 && (
      <TouchableOpacity
        style={styles.fab}
        onPress={() => rootNavigation.navigate('CartFlow')}
        activeOpacity={0.85}
      >
        <MaterialIcons name="shopping-cart" size={24} color="#fff" />
        <View style={styles.fabBadge}>
          <Text style={styles.fabBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
        </View>
      </TouchableOpacity>
    )}
    </View>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    height: 60,
    paddingBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
  fab: {
    position: 'absolute',
    bottom: 75,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  fabBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
});

export default TabNavigator;
