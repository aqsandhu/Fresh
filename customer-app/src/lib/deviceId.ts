import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'fb_device_id';
let cached: string | null = null;

/** Stable per-device id for anonymous cart/abandonment tracking. */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    let id = await AsyncStorage.getItem(KEY);
    if (!id) {
      id = `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await AsyncStorage.setItem(KEY, id);
    }
    cached = id;
    return id;
  } catch {
    return '';
  }
}
