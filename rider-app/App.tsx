import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { requestLocationPermissions } from './src/services/location.service';
import ErrorBoundary from './src/components/ErrorBoundary';
import { useAuthStore } from './src/store/authStore';

export default function App() {
  useEffect(() => {
    // Load the access token from SecureStore into memory on app start
    useAuthStore.getState().hydrateAuth();
    // Request location permissions on app start
    requestLocationPermissions();
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <StatusBar style="light" backgroundColor="#111827" />
        <AppNavigator />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
