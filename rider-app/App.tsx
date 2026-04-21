import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { requestLocationPermissions } from './src/services/location.service';

export default function App() {
  useEffect(() => {
    // Request location permissions on app start
    requestLocationPermissions();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#111827" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
