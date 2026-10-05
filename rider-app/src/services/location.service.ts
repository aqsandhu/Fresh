/**
 * Location plumbing. This module owns the expo-location / expo-task-manager
 * calls only — WHEN tracking runs is decided by store/dutyStore.ts.
 *
 * Two pipelines, deliberately separate:
 *   • Foreground watcher → callback (dutyStore emits over the socket).
 *   • Background task    → REST `PUT /rider/location` (survives app kill).
 */
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import authService from './auth.service';
import { t } from '../i18n';
import {
  LOCATION_TASK_NAME,
  MAX_ACCURACY_FOR_TRACKING,
  MAX_ACCURACY_FOR_PIN,
  GPS_LOCK_TIMEOUT_MS,
  FOREGROUND_TRACK_INTERVAL_MS,
  FOREGROUND_TRACK_DISTANCE_M,
  BACKGROUND_TRACK_INTERVAL_MS,
  BACKGROUND_TRACK_DISTANCE_M,
  STORAGE_KEYS,
} from '../utils/constants';
import type { LocationFix } from '../types';

export { MAX_ACCURACY_FOR_PIN, MAX_ACCURACY_FOR_TRACKING };

const toFix = (loc: Location.LocationObject): LocationFix => ({
  latitude: loc.coords.latitude,
  longitude: loc.coords.longitude,
  accuracy: loc.coords.accuracy ?? undefined,
  timestamp: loc.timestamp,
});

// ── Background task (module scope: must be defined at import time) ──────────
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[Location] background task error:', error);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;
  const best = locations.reduce((a, b) =>
    (a.coords.accuracy ?? 9999) <= (b.coords.accuracy ?? 9999) ? a : b
  );
  if ((best.coords.accuracy ?? 9999) > MAX_ACCURACY_FOR_TRACKING) return;
  try {
    await authService.updateLocation(best.coords.latitude, best.coords.longitude, best.coords.accuracy ?? undefined);
  } catch (err) {
    console.error('[Location] background update failed:', err);
  }
});

// ── Permissions ─────────────────────────────────────────────────────────────

export const hasForegroundPermission = async (): Promise<boolean> => {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === 'granted';
};

export const hasBackgroundPermission = async (): Promise<boolean> => {
  try {
    const { status } = await Location.getBackgroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
};

/**
 * Google Play "prominent disclosure": our own dialog BEFORE the system
 * permission prompts. Shown once (until accepted); skipped when permission is
 * already granted.
 */
export const showLocationDisclosure = async (): Promise<boolean> => {
  if (await hasForegroundPermission()) return true;
  try {
    if ((await AsyncStorage.getItem(STORAGE_KEYS.LOCATION_DISCLOSURE)) === 'yes') return true;
  } catch {
    /* unreadable storage → show again */
  }
  return new Promise((resolve) => {
    Alert.alert(
      t('duty.disclosureTitle'),
      t('duty.disclosureBody'),
      [
        { text: t('duty.disclosureDecline'), style: 'cancel', onPress: () => resolve(false) },
        {
          text: t('duty.disclosureAccept'),
          onPress: async () => {
            try {
              await AsyncStorage.setItem(STORAGE_KEYS.LOCATION_DISCLOSURE, 'yes');
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

export type PermissionOutcome = 'granted' | 'foreground_only' | 'denied';

/** Disclosure → foreground → (best-effort) background. */
export const requestLocationPermissions = async (): Promise<PermissionOutcome> => {
  const disclosed = await showLocationDisclosure();
  if (!disclosed) return 'denied';

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return 'denied';

  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted' ? 'granted' : 'foreground_only';
  } catch {
    return 'foreground_only';
  }
};

// ── Background pipeline ─────────────────────────────────────────────────────

export const isBackgroundTrackingRunning = async (): Promise<boolean> => {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
};

export const startBackgroundTracking = async (): Promise<boolean> => {
  if (!(await hasBackgroundPermission())) return false;
  if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) return false;
  if (await isBackgroundTrackingRunning()) return true;
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: BACKGROUND_TRACK_INTERVAL_MS,
    distanceInterval: BACKGROUND_TRACK_DISTANCE_M,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Fresh Bazar Rider',
      notificationBody: 'On duty — sharing location for deliveries',
      notificationColor: '#10B981',
      killServiceOnDestroy: false,
    },
    mayShowUserSettingsDialog: true,
  });
  return true;
};

export const stopBackgroundTracking = async (): Promise<void> => {
  try {
    if (await isBackgroundTrackingRunning()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch (error) {
    console.error('[Location] stopBackgroundTracking:', error);
  }
};

// ── Foreground pipeline ─────────────────────────────────────────────────────

let foregroundSub: Location.LocationSubscription | null = null;

export const startForegroundWatch = async (
  onFix: (fix: LocationFix) => void,
  onRawFix?: (fix: LocationFix) => void
): Promise<boolean> => {
  if (!(await hasForegroundPermission())) return false;
  stopForegroundWatch();
  foregroundSub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: FOREGROUND_TRACK_INTERVAL_MS,
      distanceInterval: FOREGROUND_TRACK_DISTANCE_M,
    },
    (loc) => {
      const fix = toFix(loc);
      onRawFix?.(fix);
      if ((fix.accuracy ?? 9999) <= MAX_ACCURACY_FOR_TRACKING) onFix(fix);
    }
  );
  return true;
};

export const stopForegroundWatch = (): void => {
  foregroundSub?.remove();
  foregroundSub = null;
};

// ── One-shot fixes ──────────────────────────────────────────────────────────

export const getLastKnownLocation = async (): Promise<LocationFix | null> => {
  try {
    const loc = await Location.getLastKnownPositionAsync();
    return loc ? toFix(loc) : null;
  } catch {
    return null;
  }
};

export const getCurrentLocation = async (): Promise<LocationFix | null> => {
  try {
    if (!(await hasForegroundPermission())) return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
    return toFix(loc);
  } catch (error) {
    console.error('[Location] getCurrentLocation:', error);
    return null;
  }
};

/**
 * Watch GPS until a fix meets `maxAccuracy` or `timeout` elapses. Returns the
 * best fix if it meets the threshold, otherwise null.
 */
export const getAccurateLocation = (
  maxAccuracy: number = MAX_ACCURACY_FOR_PIN,
  timeout: number = GPS_LOCK_TIMEOUT_MS
): Promise<LocationFix | null> =>
  new Promise((resolve) => {
    void (async () => {
      try {
        if (!(await hasForegroundPermission())) {
          resolve(null);
          return;
        }
        let best: Location.LocationObject | null = null;
        let sub: Location.LocationSubscription | null = null;
        let settled = false;

        const finish = (value: Location.LocationObject | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          sub?.remove();
          resolve(value ? toFix(value) : null);
        };

        const timer = setTimeout(() => {
          finish(best && (best.coords.accuracy ?? 9999) <= maxAccuracy ? best : null);
        }, timeout);

        const created = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          (loc) => {
            const acc = loc.coords.accuracy ?? 9999;
            if (acc < (best?.coords.accuracy ?? 9999)) best = loc;
            if (acc <= maxAccuracy) finish(loc);
          }
        );
        if (settled) created.remove();
        else sub = created;
      } catch (error) {
        console.error('[Location] getAccurateLocation:', error);
        resolve(null);
      }
    })();
  });
