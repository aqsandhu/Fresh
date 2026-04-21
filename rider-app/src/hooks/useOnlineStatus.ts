import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { offlineQueue } from '../utils/offlineQueue';
import { checkNetworkStatus } from '../services/api';

interface OnlineStatusState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  connectionType: string | null;
  hasPendingActions: boolean;
}

export const useOnlineStatus = () => {
  const [state, setState] = useState<OnlineStatusState>({
    isConnected: true,
    isInternetReachable: null,
    connectionType: null,
    hasPendingActions: false,
  });

  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Check pending actions
  const checkPendingActions = useCallback(async () => {
    const hasPending = await offlineQueue.hasPendingActions();
    setState((prev) => ({ ...prev, hasPendingActions: hasPending }));
  }, []);

  // Initialize network listener
  useEffect(() => {
    // Set up network listener
    unsubscribeRef.current = NetInfo.addEventListener((netInfo: NetInfoState) => {
      setState((prev) => ({
        ...prev,
        isConnected: netInfo.isConnected ?? false,
        isInternetReachable: netInfo.isInternetReachable,
        connectionType: netInfo.type,
      }));

      // Check pending actions when coming back online
      if (netInfo.isConnected && netInfo.isInternetReachable) {
        checkPendingActions();
      }
    });

    // Initial check
    checkPendingActions();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [checkPendingActions]);

  // Check if backend is reachable
  const checkBackendStatus = useCallback(async (): Promise<boolean> => {
    try {
      return await checkNetworkStatus();
    } catch {
      return false;
    }
  }, []);

  // Process offline queue
  const processOfflineQueue = useCallback(
    async <T>(processor: (action: any) => Promise<T>): Promise<void> => {
      if (!state.isConnected || !state.isInternetReachable) {
        console.log('Cannot process queue: offline');
        return;
      }

      await offlineQueue.processQueue(
        processor,
        (action, result) => {
          console.log('Queued action processed:', action.id);
        },
        (action, error) => {
          console.error('Failed to process queued action:', action.id, error);
        }
      );

      await checkPendingActions();
    },
    [state.isConnected, state.isInternetReachable, checkPendingActions]
  );

  // Get queue size
  const getQueueSize = useCallback(async (): Promise<number> => {
    return await offlineQueue.getQueueSize();
  }, []);

  // Get connection quality indicator
  const getConnectionQuality = useCallback((): 'good' | 'fair' | 'poor' | 'none' => {
    if (!state.isConnected) return 'none';
    if (!state.isInternetReachable) return 'poor';

    switch (state.connectionType) {
      case 'wifi':
        return 'good';
      case 'cellular':
        return 'fair';
      case 'unknown':
      case 'none':
        return 'none';
      default:
        return 'fair';
    }
  }, [state.isConnected, state.isInternetReachable, state.connectionType]);

  // Format connection status text
  const getConnectionStatusText = useCallback((): string => {
    if (!state.isConnected) return 'Offline';
    if (!state.isInternetReachable) return 'No Internet';

    switch (state.connectionType) {
      case 'wifi':
        return 'WiFi';
      case 'cellular':
        return 'Mobile Data';
      default:
        return 'Connected';
    }
  }, [state.isConnected, state.isInternetReachable, state.connectionType]);

  return {
    // State
    isConnected: state.isConnected,
    isInternetReachable: state.isInternetReachable,
    connectionType: state.connectionType,
    hasPendingActions: state.hasPendingActions,

    // Actions
    checkBackendStatus,
    processOfflineQueue,
    checkPendingActions,
    getQueueSize,

    // Helpers
    getConnectionQuality,
    getConnectionStatusText,
  };
};

export default useOnlineStatus;
