import AsyncStorage from '@react-native-async-storage/async-storage';

/** Last successfully used login phone — enables PIN-only return visits. */
export const LAST_PHONE_KEY = '@freshbazar-last-phone';

export async function getLastPhone(): Promise<string | null> {
  const v = await AsyncStorage.getItem(LAST_PHONE_KEY);
  return v && v.trim().length > 0 ? v.trim() : null;
}

export async function setLastPhone(phone: string): Promise<void> {
  if (!phone?.trim()) return;
  await AsyncStorage.setItem(LAST_PHONE_KEY, phone.trim());
}

export async function clearLastPhone(): Promise<void> {
  await AsyncStorage.removeItem(LAST_PHONE_KEY);
}

/** Show only last 4 digits, e.g. •••• •••• 4567 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `•••• •••• ${digits.slice(-4)}`;
}

/** PIN re-auth / return visit window — 3 days. */
export const PIN_STALE_MS = 3 * 24 * 60 * 60 * 1000;
