import { Linking, Alert } from 'react-native';

/** Build a WhatsApp deep link from admin-configured URL or phone number. */
export function buildWhatsAppUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10) return null;

  const intl = digits.startsWith('92') ? digits : digits.startsWith('0') ? `92${digits.slice(1)}` : `92${digits}`;
  return `https://wa.me/${intl}`;
}

export async function openWhatsAppOrder(raw: string): Promise<boolean> {
  const url = buildWhatsAppUrl(raw);
  if (!url) {
    Alert.alert('WhatsApp', 'Order link is not configured for your city yet.');
    return false;
  }

  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('WhatsApp', 'Could not open WhatsApp on this device.');
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert('WhatsApp', 'Could not open WhatsApp. Please try again.');
    return false;
  }
}
