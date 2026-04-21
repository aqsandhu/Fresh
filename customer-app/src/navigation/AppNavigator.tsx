import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '@types';
import { COLORS, STORAGE_KEYS } from '@utils/constants';
import { useAuthStore } from '@store';
import { LoadingOverlay } from '@components';

import { AuthNavigator } from './AuthNavigator';
import { TabNavigator } from './TabNavigator';
import { CartNavigator } from './CartNavigator';
import { navigationRef, getPendingRedirect, clearPendingRedirect } from './navigationUtils';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated, setToken, setUser } = useAuthStore();
  const prevAuth = useRef(isAuthenticated);

  useEffect(() => {
    // Check for stored auth token
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
        const userJson = await AsyncStorage.getItem(STORAGE_KEYS.USER);
        
        if (token && userJson) {
          setToken(token);
          setUser(JSON.parse(userJson));
        }
      } catch (error) {
        console.error('Error checking auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [setToken, setUser]);

  // After login, navigate to the page the user was on before being redirected
  useEffect(() => {
    if (isAuthenticated && !prevAuth.current) {
      const pending = getPendingRedirect();
      if (pending) {
        clearPendingRedirect();
        setTimeout(() => {
          if (navigationRef.isReady()) {
            if (pending === 'CartFlow') {
              (navigationRef as any).navigate('CartFlow');
            } else {
              (navigationRef as any).navigate('Main', { screen: pending });
            }
          }
        }, 100);
      }
    }
    prevAuth.current = isAuthenticated;
  }, [isAuthenticated]);

  if (isLoading) {
    return <LoadingOverlay visible={true} message="Loading..." />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style="dark" backgroundColor={COLORS.white} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main" component={TabNavigator} />
            <Stack.Screen
              name="CartFlow"
              component={CartNavigator}
              options={{ animation: 'slide_from_bottom' }}
            />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
      <Toast />
    </NavigationContainer>
  );
};

export default AppNavigator;
