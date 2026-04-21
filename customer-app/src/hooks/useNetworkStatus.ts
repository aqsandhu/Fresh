import { useState, useEffect, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Alert } from 'react-native';

interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
  details: any;
}

let hasShownOfflineAlert = false;

export const useNetworkStatus = (showAlerts: boolean = true): NetworkStatus => {
  const [networkState, setNetworkState] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    type: 'unknown',
    details: null,
  });

  const handleNetworkChange = useCallback((state: NetInfoState) => {
    const newState: NetworkStatus = {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
      details: state.details,
    };

    setNetworkState(newState);

    // Show alerts for network status changes
    if (showAlerts) {
      if (!newState.isConnected && !hasShownOfflineAlert) {
        hasShownOfflineAlert = true;
        Alert.alert(
          'No Internet Connection',
          'You are currently offline. Some features may not work properly.',
          [{ text: 'OK' }]
        );
      } else if (newState.isConnected && hasShownOfflineAlert) {
        hasShownOfflineAlert = false;
        // Optionally show back online message
        // Alert.alert('Back Online', 'Your internet connection has been restored.');
      }
    }
  }, [showAlerts]);

  useEffect(() => {
    // Get initial network state
    NetInfo.fetch().then(handleNetworkChange);

    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);

    return () => {
      unsubscribe();
    };
  }, [handleNetworkChange]);

  return networkState;
};

// Hook that returns just the connection status
export const useIsOnline = (): boolean => {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
    });

    return () => unsubscribe();
  }, []);

  return isOnline;
};

// Function to check network status without hook
export const checkNetworkStatus = async (): Promise<NetworkStatus> => {
  const state = await NetInfo.fetch();
  return {
    isConnected: state.isConnected ?? false,
    isInternetReachable: state.isInternetReachable,
    type: state.type,
    details: state.details,
  };
};

export default useNetworkStatus;
