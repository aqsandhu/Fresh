import * as Location from 'expo-location';
import { REQUIRED_LOCATION_ACCURACY_M } from '@utils/constants';

export type LocationTier = 'tight';

export interface AccuratePositionWithTier {
  lat: number;
  lng: number;
  accuracy: number;
  tier: LocationTier;
}

/** Max wait before giving up (keeps retrying until then). */
const MAX_LOCATION_WAIT_MS = 120_000;

/**
 * Watch GPS until accuracy is strictly less than REQUIRED_LOCATION_ACCURACY_M (10m).
 * Calls onProgress with the latest reading while trying.
 */
export async function getAccuratePosition(
  onProgress?: (accuracy: number) => void
): Promise<AccuratePositionWithTier | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

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

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, MAX_LOCATION_WAIT_MS);

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (loc) => {
        const acc = loc.coords.accuracy ?? 9999;
        if (!best || acc < (best.coords.accuracy ?? 9999)) {
          best = loc;
        }
        onProgress?.(acc);
        if (acc < REQUIRED_LOCATION_ACCURACY_M) {
          cleanup();
          resolve({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            accuracy: acc,
            tier: 'tight',
          });
        }
      }
    ).then((s) => {
      sub = s;
    });
  });
}
