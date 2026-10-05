import { useState, useEffect, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { offlineQueue } from '../utils/offlineQueue';

interface OnlineStatusState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  connectionType: string | null;
  pendingActions: number;
}

/** Connectivity + offline-queue size for banners and the replay trigger. */
export const useOnlineStatus = () => {
  const [state, setState] = useState<OnlineStatusState>({
    isConnected: true,
    isInternetReachable: null,
    connectionType: null,
    pendingActions: 0,
  });

  const refreshPending = useCallback(async () => {
    const size = await offlineQueue.getQueueSize();
    setState((prev) => (prev.pendingActions === size ? prev : { ...prev, pendingActions: size }));
  }, []);

  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((netInfo: NetInfoState) => {
      setState((prev) => ({
        ...prev,
        isConnected: netInfo.isConnected ?? false,
        isInternetReachable: netInfo.isInternetReachable,
        connectionType: netInfo.type,
      }));
    });
    const unsubscribeQueue = offlineQueue.subscribe((size) =>
      setState((prev) => (prev.pendingActions === size ? prev : { ...prev, pendingActions: size }))
    );
    refreshPending();
    return () => {
      unsubscribeNet();
      unsubscribeQueue();
    };
  }, [refreshPending]);

  // NetInfo reports `isInternetReachable: null` until its probe finishes;
  // treat "connected + unknown" as online so we never show a false banner.
  const isOffline = !state.isConnected || state.isInternetReachable === false;

  return { ...state, isOffline, refreshPending };
};

export default useOnlineStatus;
