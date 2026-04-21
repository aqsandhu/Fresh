import { useEffect, useCallback } from 'react';
import { useLocationStore } from '../store/locationStore';
import { useAuthStore } from '../store/authStore';

export const useLocation = () => {
  const {
    currentLocation,
    isTracking,
    isPermissionGranted,
    lastUpdated,
    error,
    initialize,
    startTracking,
    stopTracking,
    updateLocation,
    requestPermissions,
    clearError,
  } = useLocationStore();

  const { rider } = useAuthStore();

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, []);

  // Start tracking when rider goes online
  const startRiderTracking = useCallback(async () => {
    if (rider?.id) {
      return await startTracking(rider.id);
    }
    return false;
  }, [rider?.id, startTracking]);

  // Stop tracking
  const stopRiderTracking = useCallback(async () => {
    await stopTracking();
  }, [stopTracking]);

  // Update location manually
  const refreshLocation = useCallback(async () => {
    if (rider?.id) {
      await updateLocation(rider.id);
    }
  }, [rider?.id, updateLocation]);

  // Request permissions
  const requestLocationPermissions = useCallback(async () => {
    return await requestPermissions();
  }, [requestPermissions]);

  // Format last updated time
  const getLastUpdatedText = useCallback(() => {
    if (!lastUpdated) return 'Never';
    const seconds = Math.floor((Date.now() - lastUpdated) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }, [lastUpdated]);

  return {
    // State
    currentLocation,
    isTracking,
    isPermissionGranted,
    lastUpdated,
    error,

    // Actions
    startTracking: startRiderTracking,
    stopTracking: stopRiderTracking,
    refreshLocation,
    requestPermissions: requestLocationPermissions,
    clearError,
    getLastUpdatedText,
  };
};

export default useLocation;
