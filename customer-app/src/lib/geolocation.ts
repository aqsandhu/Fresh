import * as Location from 'expo-location';
import {
  REQUIRED_LOCATION_ACCURACY_M,
  FALLBACK_LOCATION_ACCURACY_M,
} from '@utils/constants';

export type LocationTier = 'tight' | 'fallback' | 'approximate';

export interface AccuratePositionWithTier {
  lat: number;
  lng: number;
  accuracy: number;
  tier: LocationTier;
}

const TIGHT_WATCH_MS = 15_000;
const FALLBACK_WATCH_MS = 8_000;

function toResult(
  loc: Location.LocationObject,
  tier: LocationTier
): AccuratePositionWithTier {
  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? 9999,
    tier,
  };
}

/** Single read — instant map pin (behaviour before strict-only watch). */
async function getCurrentPositionOnce(): Promise<Location.LocationObject | null> {
  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: true,
    });
  } catch {
    return null;
  }
}

/**
 * Watch GPS until accuracy is strictly less than maxAccuracyM, or timeout.
 */
function watchForAccurate(
  maxAccuracyM: number,
  timeoutMs: number,
  successTier: 'tight' | 'fallback',
  onProgress?: (accuracy: number) => void,
  onFix?: (fix: AccuratePositionWithTier) => void
): Promise<AccuratePositionWithTier | null> {
  return new Promise((resolve) => {
    let best: Location.LocationObject | null = null;
    let sub: Location.LocationSubscription | null = null;
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      sub?.remove();
      clearTimeout(timer);
    };

    const finish = (hit: Location.LocationObject | null) => {
      if (finished) return;
      const pick = hit ?? best;
      if (!pick) {
        cleanup();
        resolve(null);
        return;
      }

      const acc = pick.coords.accuracy ?? 9999;
      onProgress?.(acc);

      if (acc < maxAccuracyM) {
        const result = toResult(pick, successTier);
        onFix?.(result);
        cleanup();
        resolve(result);
        return;
      }

      cleanup();
      resolve(null);
    };

    const timer = setTimeout(() => finish(best), timeoutMs);

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 1,
      },
      (loc) => {
        const acc = loc.coords.accuracy ?? 9999;
        if (!best || acc < (best.coords.accuracy ?? 9999)) {
          best = loc;
          onProgress?.(acc);
        }
        if (acc < maxAccuracyM) {
          finish(loc);
        }
      }
    ).then((s) => {
      sub = s;
    });
  });
}

export type GetAccuratePositionOptions = {
  onProgress?: (accuracy: number) => void;
  /** Updates the map immediately on each improved reading. */
  onFix?: (fix: AccuratePositionWithTier) => void;
};

/**
 * 1) Quick GPS → map updates immediately.
 * 2) Refine toward accuracy &lt; 10m (then looser fallback).
 * 3) Never discard a usable approximate fix.
 */
export async function getAccuratePosition(
  onProgressOrOptions?: ((accuracy: number) => void) | GetAccuratePositionOptions
): Promise<AccuratePositionWithTier | null> {
  const options: GetAccuratePositionOptions =
    typeof onProgressOrOptions === 'function'
      ? { onProgress: onProgressOrOptions }
      : onProgressOrOptions ?? {};

  const { onProgress, onFix } = options;

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const quick = await getCurrentPositionOnce();
  if (quick) {
    const quickResult = toResult(quick, 'approximate');
    onProgress?.(quickResult.accuracy);
    onFix?.(quickResult);
    if (quickResult.accuracy < REQUIRED_LOCATION_ACCURACY_M) {
      return { ...quickResult, tier: 'tight' };
    }
  }

  const tight = await watchForAccurate(
    REQUIRED_LOCATION_ACCURACY_M,
    TIGHT_WATCH_MS,
    'tight',
    onProgress,
    onFix
  );
  if (tight) return tight;

  const fallback = await watchForAccurate(
    FALLBACK_LOCATION_ACCURACY_M,
    FALLBACK_WATCH_MS,
    'fallback',
    onProgress,
    onFix
  );
  if (fallback) return fallback;

  if (quick) {
    return toResult(quick, 'approximate');
  }

  return null;
}
