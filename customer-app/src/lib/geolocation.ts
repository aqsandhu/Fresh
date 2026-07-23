import * as Location from 'expo-location';
import { REQUIRED_LOCATION_ACCURACY_M } from '@utils/constants';

export type LocationTier = 'tight' | 'fallback' | 'approximate';

export interface AccuratePositionWithTier {
  lat: number;
  lng: number;
  accuracy: number;
  tier: LocationTier;
}

const REFINE_MS = 60_000;
/** Max accuracy (m) for a fix to be returned as the 'fallback' tier on timeout. */
const FALLBACK_MAX_ACCURACY_M = 500;

function toResult(loc: Location.LocationObject, tier: LocationTier): AccuratePositionWithTier {
  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? 9999,
    tier,
  };
}

function isAccurateEnough(loc: Location.LocationObject): boolean {
  return (loc.coords.accuracy ?? 9999) <= REQUIRED_LOCATION_ACCURACY_M;
}

export type GetAccuratePositionOptions = {
  onProgress?: (accuracy: number) => void;
  /** Called when the best fix changes so the map can follow the GPS search. */
  onFix?: (fix: AccuratePositionWithTier) => void;
};

/**
 * Keep refining GPS until the fix is accurate enough for a delivery pin.
 * Approximate fixes update the map/progress only; they are not returned as
 * locked locations.
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

  const reportBest = (loc: Location.LocationObject) => {
    const tier: LocationTier = isAccurateEnough(loc) ? 'tight' : 'approximate';
    const result = toResult(loc, tier);
    onProgress?.(result.accuracy);
    onFix?.(result);
    return result;
  };

  try {
    best = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
      mayShowUserSettingsDialog: true,
    });
  } catch {
    best = null;
  }

  if (best) {
    const quick = reportBest(best);
    if (quick.tier === 'tight') return quick;
  }

  const refined = await new Promise<AccuratePositionWithTier | null>((resolve) => {
    let watchBest: Location.LocationObject | null = best;
    let sub: Location.LocationSubscription | null = null;
    let done = false;

    const cleanup = () => {
      sub?.remove();
      clearTimeout(timer);
    };

    const finish = (hit: Location.LocationObject | null) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(hit ? toResult(hit, 'tight') : null);
    };

    // On timeout, resolve the best approximate fix seen so far as the
    // 'fallback' tier instead of null when a reasonable fix exists.
    const finishWithBest = () => {
      if (done) return;
      done = true;
      cleanup();
      const acc = watchBest?.coords.accuracy ?? Infinity;
      if (watchBest && acc <= FALLBACK_MAX_ACCURACY_M) {
        resolve(toResult(watchBest, 'fallback'));
      } else {
        resolve(null);
      }
    };

    const timer = setTimeout(finishWithBest, REFINE_MS);

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (loc) => {
        const acc = loc.coords.accuracy ?? 9999;
        const bestAcc = watchBest?.coords.accuracy ?? 9999;

        if (acc < bestAcc) {
          watchBest = loc;
          reportBest(loc);
        }

        if (acc <= REQUIRED_LOCATION_ACCURACY_M) {
          finish(loc);
        }
      }
    )
      .then((s) => {
        if (done) {
          s.remove();
        } else {
          sub = s;
        }
      })
      .catch(() => finishWithBest());
  });

  return refined;
}
