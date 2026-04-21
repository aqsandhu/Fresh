import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';

import { useAuthStore } from '../store/authStore';
import { startLocationTracking, stopLocationTracking } from '../services/location.service';
import { navigationRef, getPendingRedirect, clearPendingRedirect } from './navigationUtils';

// Screens
import LoginScreen from '../screens/auth/LoginScreen';
import DashboardScreen from '../screens/home/DashboardScreen';
import TasksListScreen from '../screens/tasks/TasksListScreen';
import TaskDetailScreen from '../screens/tasks/TaskDetailScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

// Types
export type RootStackParamList = {
  MainTabs: undefined;
  TaskDetail: { taskId: string };
};

export type AuthStackParamList = {
  Login: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Tasks: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Simple Tab Icon Component
const TabIcon = ({ name, focused }: { name: string; focused: boolean }) => (
  <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
    <Text style={[styles.tabIconText, focused && styles.tabIconTextActive]}>
      {name}
    </Text>
  </View>
);

// Main Tab Navigator
const MainTabNavigator = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: styles.tabBar,
    }}
  >
    <Tab.Screen
      name="Dashboard"
      component={DashboardScreen}
      options={{
        tabBarLabel: () => null,
        tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="D" focused={focused} />,
      }}
    />
    <Tab.Screen
      name="Tasks"
      component={TasksListScreen}
      options={{
        tabBarLabel: () => null,
        tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="T" focused={focused} />,
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        tabBarLabel: () => null,
        tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="P" focused={focused} />,
      }}
    />
  </Tab.Navigator>
);

// Auth Navigator
const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
  </AuthStack.Navigator>
);

// Main Navigator with TaskDetail
const MainNavigator = () => {
  const isOnline = useAuthStore((state) => state.isOnline);

  useEffect(() => {
    if (isOnline) {
      startLocationTracking();
    } else {
      stopLocationTracking();
    }

    return () => {
      stopLocationTracking();
    };
  }, [isOnline]);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{
          headerShown: true,
          headerTitle: 'Task Details',
          headerStyle: styles.header,
          headerTitleStyle: styles.headerTitle,
        }}
      />
    </Stack.Navigator>
  );
};

// Root Navigator
const AppNavigator = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const prevAuth = useRef(isAuthenticated);

  // After login, navigate to the page the user was on before being redirected
  useEffect(() => {
    if (isAuthenticated && !prevAuth.current) {
      const pending = getPendingRedirect();
      if (pending) {
        clearPendingRedirect();
        setTimeout(() => {
          if (navigationRef.isReady()) {
            (navigationRef as any).navigate('MainTabs', { screen: pending });
          }
        }, 100);
      }
    }
    prevAuth.current = isAuthenticated;
  }, [isAuthenticated]);

  return (
    <NavigationContainer ref={navigationRef}>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    height: 70,
    backgroundColor: '#1F2937',
    borderTopWidth: 0,
    paddingBottom: 10,
    paddingTop: 10,
  },
  tabIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIconActive: {
    backgroundColor: '#10B981',
  },
  tabIconText: {
    color: '#9CA3AF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  tabIconTextActive: {
    color: '#FFFFFF',
  },
  header: {
    backgroundColor: '#10B981',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default AppNavigator;
