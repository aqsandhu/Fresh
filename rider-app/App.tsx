import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import LoadingSpinner from './src/components/LoadingSpinner';
import { useAuthStore } from './src/store/authStore';
import { colors } from './src/theme';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Load the access token from SecureStore before deciding Auth vs Main so
    // a signed-in rider never flashes the Login screen on launch.
    // Location permission is deliberately NOT requested here (Play policy):
    // it is requested in context when the rider goes on duty (dutyStore).
    useAuthStore
      .getState()
      .hydrateAuth()
      .finally(() => setReady(true));
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <StatusBar style="light" backgroundColor={colors.gray900} />
        {ready ? <AppNavigator /> : <LoadingSpinner fullScreen />}
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
