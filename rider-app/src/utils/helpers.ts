import { Linking, Platform } from 'react-native';
import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';
import type { GeoPoint } from '../types';

// ── Money ──────────────────────────────────────────────────────────────────
// Hermes in some RN builds returns '' from toLocaleString('en-PK'); format by hand.
export const formatCurrency = (amount: number | string | null | undefined): string => {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0));
  const safe = Number.isFinite(n) ? n : 0;
  const [intPart, decPart] = Math.abs(safe).toFixed(2).split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = safe < 0 ? '-' : '';
  const body = decPart === '00' ? withCommas : `${withCommas}.${decPart}`;
  return `Rs. ${sign}${body}`;
};

export const toNumber = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

export const toNumberOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

// ── Distance ───────────────────────────────────────────────────────────────
export const formatDistance = (meters: number): string => {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

/** Great-circle distance in meters. */
export const haversineMeters = (a: GeoPoint, b: GeoPoint): number => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

// ── Dates ──────────────────────────────────────────────────────────────────
const toDate = (date: string | Date | null | undefined): Date | null => {
  if (!date) return null;
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isValid(d) ? d : null;
};

export const formatTime = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  return d ? format(d, 'h:mm a') : '';
};

export const formatDate = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  return d ? format(d, 'EEE, d MMM yyyy') : '';
};

export const formatDateTime = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  return d ? format(d, 'd MMM, h:mm a') : '';
};

export const formatRelativeTime = (date: string | Date | null | undefined): string => {
  const d = toDate(date);
  return d ? formatDistanceToNow(d, { addSuffix: true }) : '';
};

/** "10:00:00" → "10:00 AM" (time_slots.start_time is a SQL TIME). */
export const formatSqlTime = (time: string | null | undefined): string => {
  if (!time) return '';
  const [h, m] = time.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(Number.isFinite(m) ? m : 0).padStart(2, '0')} ${suffix}`;
};

export const formatSlotRange = (start?: string | null, end?: string | null): string => {
  const s = formatSqlTime(start);
  const e = formatSqlTime(end);
  if (s && e) return `${s} – ${e}`;
  return s || e || '';
};

// ── Phone ──────────────────────────────────────────────────────────────────
/** Pakistani mobile: 03XXXXXXXXX or 92XXXXXXXXXX (with/without +). */
export const isValidPhoneNumber = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  return /^(03\d{9}|923\d{9})$/.test(cleaned);
};

export const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  const withoutZero = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
  const rest = withoutZero.startsWith('92') ? withoutZero.slice(2) : withoutZero;
  return `+92 ${rest.slice(0, 3)} ${rest.slice(3)}`;
};

/** Digits only with country code, for wa.me links. */
export const toWhatsAppNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('92')) return cleaned;
  if (cleaned.startsWith('0')) return `92${cleaned.slice(1)}`;
  return `92${cleaned}`;
};

// ── Navigation / external apps ─────────────────────────────────────────────
/** Open turn-by-turn navigation. Prefers Google Maps; falls back to platform maps. */
export const openNavigation = async (point: GeoPoint, label?: string): Promise<void> => {
  const { latitude, longitude } = point;
  const candidates =
    Platform.OS === 'ios'
      ? [
          `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`,
          `maps://app?daddr=${latitude},${longitude}`,
          `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
        ]
      : [
          `google.navigation:q=${latitude},${longitude}`,
          `geo:${latitude},${longitude}?q=${latitude},${longitude}${label ? `(${encodeURIComponent(label)})` : ''}`,
          `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
        ];
  for (const url of candidates) {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      /* try next */
    }
  }
  // Last resort — web URL opens in the browser.
  await Linking.openURL(candidates[candidates.length - 1]);
};

export const openDialer = (phone: string): Promise<void> =>
  Linking.openURL(Platform.OS === 'ios' ? `telprompt:${phone}` : `tel:${phone}`);

export const openWhatsApp = (phone: string, message: string): Promise<void> =>
  Linking.openURL(`https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`);

// ── Misc ───────────────────────────────────────────────────────────────────
export const generateId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

export const getInitials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

export const getRatingColor = (rating: number): string => {
  if (rating >= 4.5) return '#10B981';
  if (rating >= 3.5) return '#F59E0B';
  return '#EF4444';
};

export const truncateText = (text: string, maxLength: number): string =>
  text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const retry = async <T>(fn: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> => {
  let lastError: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) await sleep(delay * 2 ** i);
    }
  }
  throw lastError;
};

/** Prefer the backend's message, then Error.message, then a generic fallback. */
export const parseErrorMessage = (error: unknown, fallback = 'An unknown error occurred'): string => {
  if (typeof error === 'string') return error;
  const e = error as { response?: { data?: { message?: string } }; message?: string } | null;
  if (e?.response?.data?.message) return e.response.data.message;
  if (e?.message) return e.message;
  return fallback;
};

export const isEmptyObject = (obj: object): boolean => Object.keys(obj).length === 0;

export const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));
