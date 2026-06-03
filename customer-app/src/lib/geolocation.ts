import * as Location from 'expo-location';
import { REQUIRED_LOCATION_ACCURACY_M } from '@utils/constants';

export type LocationTier = 'tight' | 'fallback' | 'approximate';

export interface AccuratePositionWithTier {
  lat: number;
  lng: number;
  accuracy: number;
  tier: LocationTier;
}

const REFINE_MS = 12_000;

function toResult(loc: Location.LocationObject, tier: LocationTier): AccuratePositionWithTier {
  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? 9999,
    tier,
  };
}

export type GetAccuratePositionOptions = {
  onProgress?: (accuracy: number) => void;
  /** First fix for map — called once so the map updates immediately in Expo Go. */
  onFix?: (fix: AccuratePositionWithTier) => void;
};

/**
 * Expo Go friendly: quick GPS first (map moves at once), then up to 12s refine for &lt;10m.
 * Always returns the best fix we got — never leaves the user with nothing.
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

  let best: Location.LocationObject | null = null;

  try {
    best = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: true,
    });
  } catch {
    best = null;
  }

  if (best) {
    const quick = toResult(best, 'approximate');
    onProgress?.(quick.accuracy);
    onFix?.(quick);
    if (quick.accuracy < REQUIRED_LOCATION_ACCURACY_M) {
      return { ...quick, tier: 'tight' };
    }
  }

  const refined = await new Promise<AccuratePositionWithTier | null>((resolve) => {
    let watchBest: Location.LocationObject | null = best;
    let sub: Location.LocationSubscription | null = null;
    let done = false;

    const finish = (hit: Location.LocationObject | null) => {
      if (done) return;
      done = true;
      sub?.remove();
      clearTimeout(timer);

      const pick = hit ?? watchBest;
      if (!pick) {
        resolve(null);
        return;
      }

      const acc = pick.coords.accuracy ?? 9999;
      const tier: LocationTier = acc < REQUIRED_LOCATION_ACCURACY_M ? 'tight' : 'approximate';
      resolve(toResult(pick, tier));
    };

    const timer = setTimeout(() => finish(watchBest), REFINE_MS);

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 1,
      },
      (loc) => {
        const acc = loc.coords.accuracy ?? 9999;
        if (!watchBest || acc < (watchBest.coords.accuracy ?? 9999)) {
          watchBest = loc;
          onProgress?.(acc);
        }
        if (acc < REQUIRED_LOCATION_ACCURACY_M) {
          const result = toResult(loc, 'tight');
          onFix?.(result);
          finish(loc);
        }
      }
    )
      .then((s) => {
        sub = s;
      })
      .catch(() => finish(watchBest));
  });

  if (refined) {
    onFix?.(refined);
    return refined;
  }

  if (best) {
    return toResult(best, 'approximate');
  }

  return null;
}
