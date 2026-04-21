import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import authService from './auth.service';

const LOCATION_TASK_NAME = 'background-location-task';

// Accuracy thresholds (meters)
const MAX_ACCURACY_FOR_TRACKING = 20;   // reject tracking updates worse than 20m
const MAX_ACCURACY_FOR_PIN = 10;        // reject pin-locations worse than 10m
const GPS_LOCK_TIMEOUT = 15000;         // max ms to wait for a good GPS fix

// Define background task — filters out low-accuracy readings
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    // Pick the most accurate reading from the batch
    const best = locations.reduce((a, b) =>
      (a.coords.accuracy ?? 9999) <= (b.coords.accuracy ?? 9999) ? a : b
    );
    if (best && (best.coords.accuracy ?? 9999) <= MAX_ACCURACY_FOR_TRACKING) {
      try {
        await authService.updateLocation(
          best.coords.latitude,
          best.coords.longitude,
          best.coords.accuracy ?? undefined
        );
      } catch (err) {
        console.error('Failed to update location:', err);
      }
    }
  }
});

export const requestLocationPermissions = async (): Promise<boolean> => {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    return false;
  }
  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  return backgroundStatus === 'granted';
};

export const startLocationTracking = async (): Promise<void> => {
  try {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) {
      console.warn('Location permissions not granted');
      return;
    }

    // Start background location updates with highest accuracy
    const isTaskDefined = TaskManager.isTaskDefined(LOCATION_TASK_NAME);
    if (isTaskDefined) {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (!hasStarted) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 10000,
          distanceInterval: 5,
          foregroundService: {
            notificationTitle: 'FreshBazar Rider',
            notificationBody: 'GPS tracking active for deliveries',
            notificationColor: '#10B981',
          },
          mayShowUserSettingsDialog: true,
        });
      }
    }
  } catch (error) {
    console.error('Error starting location tracking:', error);
  }
};

export const stopLocationTracking = async (): Promise<void> => {
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch (error) {
    console.error('Error stopping location tracking:', error);
  }
};

/**
 * Get a high-accuracy location by watching GPS until accuracy is good enough.
 * Falls back to the best reading obtained within the timeout period.
 */
export const getAccurateLocation = (
  maxAccuracy: number = MAX_ACCURACY_FOR_PIN,
  timeout: number = GPS_LOCK_TIMEOUT
): Promise<Location.LocationObject | null> => {
  return new Promise(async (resolve) => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        resolve(null);
        return;
      }

      let bestLocation: Location.LocationObject | null = null;
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          sub?.remove();
          // Return best we got, even if not ideal
          resolve(bestLocation);
        }
      }, timeout);

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
        },
        (loc) => {
          const acc = loc.coords.accuracy ?? 9999;
          const bestAcc = bestLocation?.coords.accuracy ?? 9999;

          // Keep the most accurate reading
          if (acc < bestAcc) {
            bestLocation = loc;
          }

          // If we hit target accuracy, resolve immediately
          if (acc <= maxAccuracy && !settled) {
            settled = true;
            clearTimeout(timer);
            sub.remove();
            resolve(loc);
          }
        }
      );
    } catch (error) {
      console.error('Error getting accurate location:', error);
      resolve(null);
    }
  });
};

/** Quick location for non-critical uses (still high accuracy) */
export const getCurrentLocation = async (): Promise<Location.LocationObject | null> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      return null;
    }
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
  } catch (error) {
    console.error('Error getting current location:', error);
    return null;
  }
};

// locationService object used by locationStore
export const locationService = {
  hasPermissions: async (): Promise<boolean> => {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  },

  getLastKnownLocation: async () => {
    try {
      const loc = await Location.getLastKnownPositionAsync();
      if (!loc) return null;
      return {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? undefined,
        timestamp: loc.timestamp,
      };
    } catch {
      return null;
    }
  },

  startTracking: async (
    riderId: string,
    callback: (location: { latitude: number; longitude: number; accuracy?: number; timestamp?: number }) => void
  ): Promise<boolean> => {
    try {
      const hasPermission = await requestLocationPermissions();
      if (!hasPermission) return false;

      await startLocationTracking();

      // Foreground watcher for real-time UI + server updates
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 5000,
          distanceInterval: 3,
        },
        (loc) => {
          const acc = loc.coords.accuracy ?? 9999;
          // Only accept accurate readings
          if (acc <= MAX_ACCURACY_FOR_TRACKING) {
            callback({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: acc,
              timestamp: loc.timestamp,
            });
            // Also push to server with accuracy so admin panel can show uncertainty radius
            authService.updateLocation(loc.coords.latitude, loc.coords.longitude, acc).catch(() => {});
          }
        }
      );

      (locationService as any)._watchSub = sub;
      return true;
    } catch (error) {
      console.error('startTracking error:', error);
      return false;
    }
  },

  stopTracking: async (): Promise<void> => {
    if ((locationService as any)._watchSub) {
      (locationService as any)._watchSub.remove();
      (locationService as any)._watchSub = null;
    }
    await stopLocationTracking();
  },

  getCurrentLocation: async () => {
    const loc = await getCurrentLocation();
    if (!loc) return null;
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? undefined,
      timestamp: loc.timestamp,
    };
  },

  /** Get the best possible GPS fix — waits for accuracy ≤ threshold */
  getAccurateLocation: async (maxAccuracy?: number) => {
    const loc = await getAccurateLocation(maxAccuracy);
    if (!loc) return null;
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? undefined,
      timestamp: loc.timestamp,
    };
  },

  updateLocation: async (
    riderId: string,
    location: { latitude: number; longitude: number }
  ): Promise<void> => {
    await authService.updateLocation(location.latitude, location.longitude);
  },

  requestPermissions: requestLocationPermissions,
};
