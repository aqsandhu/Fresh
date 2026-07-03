import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import authService from './auth.service';

const LOCATION_TASK_NAME = 'background-location-task';
const DISCLOSURE_ACCEPTED_KEY = 'fb_rider_location_disclosure_v1';

// Accuracy thresholds (meters)
const MAX_ACCURACY_FOR_TRACKING = 20;   // reject tracking updates worse than 20m
export const MAX_ACCURACY_FOR_PIN = 8;  // reject pin-locations worse than 8m
const GPS_LOCK_TIMEOUT = 60000;         // max ms to wait for a good GPS fix

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

/**
 * Google Play "prominent disclosure": before the system permission dialogs
 * we must show our OWN dialog explaining what location data is collected,
 * why, and that it is also collected in the background. Shown once (until
 * accepted); skipped when permission is already granted.
 */
const showLocationDisclosure = async (): Promise<boolean> => {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status === 'granted') return true;
  try {
    if ((await AsyncStorage.getItem(DISCLOSURE_ACCEPTED_KEY)) === 'yes') return true;
  } catch {
    /* storage unreadable — show the dialog again */
  }

  return new Promise((resolve) => {
    Alert.alert(
      'Location Data Notice',
      'Fresh Bazar Rider collects location data while you are ON DUTY to enable order dispatch, rider monitoring by the Fresh Bazar admin team, and live order tracking for customers — even when the app is closed or not in use. Tracking stops when you go off duty or log out.',
      [
        { text: 'Decline', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'I Agree',
          onPress: async () => {
            try {
              await AsyncStorage.setItem(DISCLOSURE_ACCEPTED_KEY, 'yes');
            } catch {
              /* non-fatal */
            }
            resolve(true);
          },
        },
      ],
      { cancelable: false }
    );
  });
};

export const requestLocationPermissions = async (): Promise<boolean> => {
  // Prominent disclosure FIRST (Play policy), then the system dialogs.
  const disclosed = await showLocationDisclosure();
  if (!disclosed) return false;

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
 * Returns null if no reading meets the required accuracy within the timeout.
 */
export const getAccurateLocation = (
  maxAccuracy: number = MAX_ACCURACY_FOR_PIN,
  timeout: number = GPS_LOCK_TIMEOUT
): Promise<Location.LocationObject | null> => {
  return new Promise((resolve) => {
    // Async work runs in an inner IIFE so the Promise executor itself stays
    // synchronous — an async executor that threw before resolving would leave
    // the promise hanging forever (its rejection is swallowed).
    void (async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        resolve(null);
        return;
      }

      let bestLocation: Location.LocationObject | null = null;
      let sub: Location.LocationSubscription | null = null;
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          sub?.remove();
          resolve(
            bestLocation && (bestLocation.coords.accuracy ?? 9999) <= maxAccuracy
              ? bestLocation
              : null
          );
        }
      }, timeout);

      const createdSub = await Location.watchPositionAsync(
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
            sub?.remove();
            resolve(loc);
          }
        }
      );
      if (settled) {
        createdSub.remove();
      } else {
        sub = createdSub;
      }
    } catch (error) {
      console.error('Error getting accurate location:', error);
      resolve(null);
    }
    })();
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
