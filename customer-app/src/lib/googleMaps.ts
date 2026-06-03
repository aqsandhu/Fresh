import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Default map center (Gujrat area) — matches website checkout map picker. */
export const DEFAULT_MAP_LAT = 32.5742;
export const DEFAULT_MAP_LNG = 74.0789;

export function getGoogleMapsApiKey(): string {
  const extra = Constants.expoConfig?.extra as { googleMapsApiKey?: string } | undefined;
  return (
    extra?.googleMapsApiKey?.trim() ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    ''
  );
}

export function hasGoogleMapsApiKey(): boolean {
  return getGoogleMapsApiKey().length > 0;
}

/** Expo Go on Android no longer loads Google map tiles — need a dev/production build. */
export function isExpoGoClient(): boolean {
  return Constants.appOwnership === 'expo';
}

/**
 * Use Google as the map provider only when a key is configured.
 * iOS without a key falls back to Apple Maps (works in Expo Go).
 */
export function shouldUseGoogleMapsProvider(): boolean {
  if (!hasGoogleMapsApiKey()) return false;
  if (Platform.OS === 'android') return true;
  if (Platform.OS === 'ios') return true;
  return false;
}

export type MapUnavailableReason = 'missing-key' | 'expo-go-android';

export function getMapUnavailableReason(): MapUnavailableReason | null {
  if (Platform.OS === 'android' && !hasGoogleMapsApiKey()) {
    return 'missing-key';
  }
  if (Platform.OS === 'android' && isExpoGoClient()) {
    return 'expo-go-android';
  }
  return null;
}
