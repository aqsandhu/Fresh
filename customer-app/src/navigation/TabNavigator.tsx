import React, { useEffect, useState } from 'react';

import { View, Text, StyleSheet } from 'react-native';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { MaterialIcons } from '@expo/vector-icons';

import { MainTabParamList } from '@types';

import { COLORS } from '@utils/constants';

import { useTabBarMetrics } from '@/lib/tabBarMetrics';

import { useCartStore } from '@store';

import { FloatingCityButton } from '@components/city/FloatingCityButton';

import { CartMiniSheet } from '@components/cart/CartMiniSheet';



import { HomeNavigator } from './HomeNavigator';

import { ShopNavigator } from './ShopNavigator';

import { CartTabNavigator } from './CartTabNavigator';

import { OrdersNavigator } from './OrdersNavigator';

import { ProfileNavigator } from './ProfileNavigator';



const Tab = createBottomTabNavigator<MainTabParamList>();



const TabBarIcon: React.FC<{

  name: keyof typeof MaterialIcons.glyphMap;

  color: string;

  badge?: number;

}> = ({ name, color, badge }) => (

  <View style={styles.iconWrap}>

    <MaterialIcons name={name} size={22} color={color} />

    {badge ? (

      <View style={styles.badge}>

        <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>

      </View>

    ) : null}

  </View>

);



export const TabNavigator: React.FC = () => {

  const { getTotalItems } = useCartStore();

  const [mounted, setMounted] = useState(false);

  const cartCount = mounted ? getTotalItems() : 0;

  const { height: tabBarHeight, bottomInset } = useTabBarMetrics();



  useEffect(() => {

    setMounted(true);

  }, []);



  return (

    <View style={styles.wrap}>

      <Tab.Navigator

        screenOptions={{

          headerShown: false,

          tabBarActiveTintColor: COLORS.primary600,

          tabBarInactiveTintColor: COLORS.gray500,

          tabBarStyle: {

            height: tabBarHeight,

            paddingBottom: Math.max(bottomInset, 6),

            paddingTop: 6,

            borderTopWidth: 1,

            borderTopColor: COLORS.gray200,

            backgroundColor: COLORS.white,

          },

          tabBarLabelStyle: styles.tabBarLabel,

          tabBarItemStyle: styles.tabBarItem,

        }}

      >

        <Tab.Screen

          name="Home"

          component={HomeNavigator}

          options={{

            tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,

            tabBarLabel: 'Home',

          }}

        />

        <Tab.Screen

          name="Shop"

          component={ShopNavigator}

          options={{

            tabBarIcon: ({ color }) => <TabBarIcon name="grid-view" color={color} />,

            tabBarLabel: 'Shop',

          }}

        />

        <Tab.Screen

          name="Cart"

          component={CartTabNavigator}

          options={{

            tabBarIcon: ({ color }) => (

              <TabBarIcon name="shopping-cart" color={color} badge={cartCount || undefined} />

            ),

            tabBarLabel: 'Cart',

          }}

        />

        <Tab.Screen

          name="Orders"

          component={OrdersNavigator}

          options={{

            tabBarIcon: ({ color }) => <TabBarIcon name="inventory-2" color={color} />,

            tabBarLabel: 'Orders',

          }}

        />

        <Tab.Screen

          name="Profile"

          component={ProfileNavigator}

          options={{

            tabBarIcon: ({ color }) => <TabBarIcon name="person" color={color} />,

            tabBarLabel: 'Profile',

          }}

        />

      </Tab.Navigator>

      <FloatingCityButton />

      <CartMiniSheet />

    </View>

  );

};



const styles = StyleSheet.create({

  wrap: { flex: 1 },

  tabBarItem: {

    paddingTop: 2,

  },

  tabBarLabel: {

    fontSize: 11,

    fontWeight: '600',

    marginTop: 0,

    marginBottom: 0,

  },

  iconWrap: {

    position: 'relative',

    width: 26,

    height: 26,

    alignItems: 'center',

    justifyContent: 'center',

  },

  badge: {

    position: 'absolute',

    top: -6,

    right: -8,

    backgroundColor: COLORS.primary600,

    borderRadius: 8,

    minWidth: 16,

    height: 16,

    justifyContent: 'center',

    alignItems: 'center',

    paddingHorizontal: 3,

  },

  badgeText: {

    color: COLORS.white,

    fontSize: 10,

    fontWeight: '600',

  },

});



export default TabNavigator;

