import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '@types';
import { COLORS, STORAGE_KEYS } from '@utils/constants';
import { useAuthStore } from '@store';
import { LoadingOverlay } from '@components';
import { CityProvider, useCityContext } from '@/context/CityContext';

import { AuthNavigator } from './AuthNavigator';
import { TabNavigator } from './TabNavigator';
import { CartNavigator } from './CartNavigator';
import { SelectCityScreen } from '@screens/city';
import { navigationRef, getPendingRedirect, clearPendingRedirect } from './navigationUtils';

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator: React.FC = () => {
  const { isReady, selectedCityId } = useCityContext();
  const { isAuthenticated, setToken, setUser } = useAuthStore();
  const prevAuth = useRef(isAuthenticated);
  const [bootstrapped, setBootstrapped] = React.useState(false);

  useEffect(() => {
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
        setBootstrapped(true);
      }
    };
    checkAuth();
  }, [setToken, setUser]);

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

  if (!isReady || !bootstrapped) {
    return <LoadingOverlay visible message="Loading..." />;
  }

  return (
    <>
      <StatusBar style="dark" backgroundColor={COLORS.white} />
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={selectedCityId ? 'Main' : 'SelectCity'}
      >
        <Stack.Screen name="SelectCity" component={SelectCityScreen} />
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen
          name="Auth"
          component={AuthNavigator}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="CartFlow"
          component={CartNavigator}
          options={{ animation: 'slide_from_bottom' }}
        />
      </Stack.Navigator>
      <Toast />
    </>
  );
};

export const AppNavigator: React.FC = () => {
  return (
    <CityProvider>
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
      </NavigationContainer>
    </CityProvider>
  );
};

export default AppNavigator;
