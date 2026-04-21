import React, { useEffect } from 'react';
import { LogBox, View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppNavigator } from '@navigation';
import { useNetworkStatus } from '@hooks';
import { COLORS, SPACING } from '@utils/constants';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// Ignore specific warnings
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'ViewPropTypes will be removed from React Native',
]);

// Network Status Banner Component
const NetworkStatusBanner: React.FC = () => {
  const { isConnected, isInternetReachable } = useNetworkStatus(true);
  
  if (isConnected && isInternetReachable !== false) {
    return null;
  }

  return (
    <View style={bannerStyles.container}>
      <Text style={bannerStyles.text}>
        {!isConnected ? 'No Internet Connection' : 'Limited Connectivity'}
      </Text>
    </View>
  );
};

const bannerStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.error,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
  },
  text: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '500',
  },
});

export default function App() {
  useEffect(() => {
    // Initialize app
    console.log('PakGrocery Customer App Started');
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NetworkStatusBanner />
          <AppNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
