import React, { useEffect, useRef } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuthStore } from '../store/authStore';
import { useTaskStore, processQueuedAction } from '../store/taskStore';
import { useDutyStore } from '../store/dutyStore';
import { offlineQueue } from '../utils/offlineQueue';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { notificationService, NotificationTapData } from '../services/notification.service';
import { socketService } from '../services/socket.service';
import { useT } from '../i18n';
import { colors, typography } from '../theme';
import {
  navigationRef,
  getPendingRedirect,
  clearPendingRedirect,
  navigateToTask,
  navigateToChat,
  navigateToTab,
} from './navigationUtils';
import type { RootStackParamList, AuthStackParamList, MainTabParamList } from '../types';

import LoginScreen from '../screens/auth/LoginScreen';
import HomeScreen from '../screens/home/HomeScreen';
import TasksListScreen from '../screens/tasks/TasksListScreen';
import TaskDetailScreen from '../screens/tasks/TaskDetailScreen';
import ChatScreen from '../screens/tasks/ChatScreen';
import EarningsScreen from '../screens/profile/EarningsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import HelpScreen from '../screens/settings/HelpScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.background, primary: colors.primary, card: colors.surface, text: colors.text, border: colors.border },
};

type TabIcon = keyof typeof MaterialCommunityIcons.glyphMap;
const tabIcons: Record<keyof MainTabParamList, { active: TabIcon; inactive: TabIcon }> = {
  Home: { active: 'home-variant', inactive: 'home-variant-outline' },
  Tasks: { active: 'clipboard-list', inactive: 'clipboard-list-outline' },
  Earnings: { active: 'wallet', inactive: 'wallet-outline' },
  Profile: { active: 'account-circle', inactive: 'account-circle-outline' },
};

const MainTabs = () => {
  const { t } = useT();
  const activeCount = useTaskStore((s) => s.activeTasks.length);
  return (
    <Tab.Navigator
      id="MainTabs"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
        },
        tabBarLabelStyle: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold },
        tabBarIcon: ({ focused, color }) => (
          <MaterialCommunityIcons name={focused ? tabIcons[route.name].active : tabIcons[route.name].inactive} size={26} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: t('tabs.home') }} />
      <Tab.Screen
        name="Tasks"
        component={TasksListScreen}
        options={{
          tabBarLabel: t('tabs.tasks'),
          tabBarBadge: activeCount > 0 ? activeCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.white, fontWeight: typography.weight.bold },
        }}
      />
      <Tab.Screen name="Earnings" component={EarningsScreen} options={{ tabBarLabel: t('tabs.earnings') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: t('tabs.profile') }} />
    </Tab.Navigator>
  );
};

const AuthNavigator = () => (
  <AuthStack.Navigator id="AuthStack" screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
  </AuthStack.Navigator>
);

/** Everything that must run while a rider is signed in. */
const SessionEffects = () => {
  const { isOffline } = useOnlineStatus();
  const wasOffline = useRef<boolean | null>(null);

  // Resume duty tracking, open the socket, register push, wire notification taps.
  useEffect(() => {
    socketService.connect();
    useDutyStore.getState().resume().catch(() => {});
    useTaskStore.getState().refreshAll().catch(() => {});
    useAuthStore.getState().refreshProfile().catch(() => {});

    let detach: (() => void) | null = null;
    const onTap = (data: NotificationTapData) => {
      if (data.type === 'chat' && data.orderId) {
        navigateToChat(data.orderId, data.orderNumber);
        return;
      }
      if (data.taskId) {
        navigateToTask(data.taskId);
        return;
      }
      navigateToTab('Tasks');
    };
    notificationService.bootstrap(onTap).then((unsub) => {
      detach = unsub;
    });
    return () => {
      detach?.();
    };
  }, []);

  // Re-sync when the app returns to the foreground.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        socketService.connect();
        useTaskStore.getState().fetchActiveTasks().catch(() => {});
        useDutyStore.getState().refreshPermissions().catch(() => {});
        notificationService.clearBadge().catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  // Replay the offline queue when connectivity returns.
  useEffect(() => {
    if (wasOffline.current === true && !isOffline) {
      (async () => {
        try {
          await offlineQueue.processQueue(processQueuedAction);
          await useTaskStore.getState().refreshAll();
        } catch (error) {
          console.error('[OfflineQueue] replay failed:', error);
        }
      })();
    }
    wasOffline.current = isOffline;
  }, [isOffline]);

  return null;
};

const MainNavigator = () => {
  const { t } = useT();
  return (
    <>
      <SessionEffects />
      <Stack.Navigator id="RootStack" screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('settings.title') }} />
        <Stack.Screen name="Help" component={HelpScreen} options={{ title: t('help.title') }} />
      </Stack.Navigator>
    </>
  );
};

const AppNavigator = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const prevAuth = useRef(isAuthenticated);

  // After re-login, return to the tab the rider was on when the session ended.
  useEffect(() => {
    if (isAuthenticated && !prevAuth.current) {
      const pending = getPendingRedirect();
      if (pending) {
        clearPendingRedirect();
        setTimeout(() => navigateToTab(pending), 150);
      }
    }
    prevAuth.current = isAuthenticated;
  }, [isAuthenticated]);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default AppNavigator;
