// ============================================================================
// Runtime configuration (API URL, GPS thresholds, storage keys). Design tokens
// live in src/theme; copy lives in src/i18n.
// ============================================================================
import Constants from 'expo-constants';

const isDevelopment = __DEV__;

const getDevHost = (): string | null => {
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost ||
    null;
  if (!hostUri) return null;
  const host = String(hostUri).split(':')[0];
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : null;
};

const getApiBaseUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  if (!isDevelopment) {
    return 'https://api.freshbazar.pk/api';
  }
  // Metro's hostUri contains the dev-machine address the device/emulator is
  // already using to reach the bundler (LAN IP for Wi-Fi devices, 10.0.2.2
  // for Android emulators) — both can also reach the backend on 3000.
  const devHost = getDevHost();
  if (devHost) {
    return `http://${devHost}:3000/api`;
  }
  // Fallback for tunnel mode: set EXPO_PUBLIC_API_URL instead of editing this.
  return 'http://192.168.119.226:3000/api';
};

export const API_BASE_URL = getApiBaseUrl();
export const API_TIMEOUT = 30000;

/** App version shown in Login/Settings — from app.json via expo-constants. */
export const APP_VERSION: string =
  (Constants.expoConfig as any)?.version || (Constants as any).manifest?.version || '1.0.0';

// ── GPS thresholds (meters) ─────────────────────────────────────────────────
/** Reject duty-tracking fixes worse than this. */
export const MAX_ACCURACY_FOR_TRACKING = 20;
/** Reject address pins worse than this (a pin is reused for every future order). */
export const MAX_ACCURACY_FOR_PIN = 8;
/** Max time to wait for a pin-quality GPS fix. */
export const GPS_LOCK_TIMEOUT_MS = 60_000;
/** Foreground watcher cadence. */
export const FOREGROUND_TRACK_INTERVAL_MS = 10_000;
export const FOREGROUND_TRACK_DISTANCE_M = 10;
/** Background task cadence. */
export const BACKGROUND_TRACK_INTERVAL_MS = 10_000;
export const BACKGROUND_TRACK_DISTANCE_M = 5;

// ── Storage keys ───────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  SETTINGS: 'settings-storage',
  AUTH: 'auth-storage',
  DUTY: 'duty-storage',
  OFFLINE_QUEUE: '@offline_queue',
  LOCATION_DISCLOSURE: 'fb_rider_location_disclosure_v1',
  BG_LOCATION_BANNER_DISMISSED: 'fb_rider_bg_location_banner_dismissed',
} as const;

// ── Android notification channels ──────────────────────────────────────────
export const NOTIFICATION_CHANNELS = {
  NEW_TASK: 'new-task',
  TASK_UPDATE: 'task-update',
  CHAT: 'chat',
} as const;

// ── Map defaults (Gujrat) ──────────────────────────────────────────────────
export const MAP_CONFIG = {
  defaultLatitude: 32.5742,
  defaultLongitude: 74.0789,
  delta: 0.0025,
} as const;

/** Background location task identifier (expo-task-manager). */
export const LOCATION_TASK_NAME = 'background-location-task';
