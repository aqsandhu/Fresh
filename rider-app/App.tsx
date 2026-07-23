import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { useAuthStore } from './src/store/authStore';

export default function App() {
  useEffect(() => {
    // Load the access token from SecureStore into memory on app start
    useAuthStore.getState().hydrateAuth();
    // NOTE: location permission is deliberately NOT requested here. Play
    // policy wants it in context — it's requested (after the prominent
    // disclosure) when the rider goes ON DUTY (see AppNavigator/isOnline)
    // or pins a delivery location.
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
