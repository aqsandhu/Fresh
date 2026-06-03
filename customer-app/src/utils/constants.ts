// API Configuration - Environment-specific
import Constants from 'expo-constants';

// React Native environment detection
// __DEV__ is true in development mode
const isDevelopment = __DEV__;

// Auto-detect the dev-machine host from Expo Metro so physical devices
// on the same Wi-Fi can reach the backend without hard-coding an IP.
const getDevHost = (): string | null => {
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost ||
    null;
  if (!hostUri) return null;
  const host = String(hostUri).split(':')[0];
  // Only return LAN IPv4; tunnel hosts (*.exp.direct) can't reach backend port 3000
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : null;
};

const getApiBaseUrl = (): string => {
  // Override for Expo Go / dev testing against deployed backend (website + Supabase via Render).
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  // Production builds (when __DEV__ is false)
  if (!isDevelopment) {
    return 'https://api.freshbazar.pk/api';
  }

  // Metro's hostUri contains the dev-machine address the device/emulator
  // is already using to reach the bundler. On Android emulators this is
  // 10.0.2.2, on real Wi-Fi devices it's the PC's LAN IP — both of which
  // can also reach the backend on port 3000.
  const devHost = getDevHost();
  if (devHost) {
    return `http://${devHost}:3000/api`;
  }

  // Fallback for tunnel mode or when host auto-detect fails.
  // Update this to your PC's current LAN IP for Fresh Bazar development.
  return 'http://192.168.119.226:3000/api';
};

export const API_BASE_URL = getApiBaseUrl();
export const IS_DEVELOPMENT = isDevelopment;
export const API_TIMEOUT = 30000;
/** Keep trying GPS until accuracy is below this (meters). */
export const REQUIRED_LOCATION_ACCURACY_M = 10;

// App Configuration
export const APP_NAME = 'Fresh Bazar';
export const APP_VERSION = '1.0.0';

/** Bottom tab bar height — matches website MobileNav (~64px) */
export const TAB_BAR_BASE_HEIGHT = 56;
/** @deprecated Use useTabBarMetrics() for device-safe tab bar sizing */
export const TAB_BAR_HEIGHT = 64;
/** @deprecated Use useTabBarMetrics().inset */
export const TAB_BAR_INSET = TAB_BAR_HEIGHT + 8;

/** Auto-close cart dropdown after add-to-cart (website Header + app CartMiniSheet). */
export const CART_DROPDOWN_AUTO_CLOSE_MS = 2000;

// Colors — synced with website tailwind.config.ts (primary / secondary scales)
export const COLORS = {
  // Primary (green) — website primary-500/600
  primary: '#22c55e',
  primaryDark: '#16a34a',
  primaryLight: '#4ade80',
  primaryLighter: '#f0fdf4',
  primary50: '#f0fdf4',
  primary100: '#dcfce7',
  primary500: '#22c55e',
  primary600: '#16a34a',
  primary700: '#15803d',

  // Secondary (amber) — website secondary scale
  secondary: '#f59e0b',
  secondaryDark: '#d97706',
  secondaryLight: '#fbbf24',

  // Accent Colors
  accent: '#00BCD4',
  success: '#4CAF50',
  warning: '#FFC107',
  error: '#F44336',
  info: '#2196F3',

  // Neutral Colors
  white: '#FFFFFF',
  black: '#000000',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',

  // Category Colors
  sabzi: '#4CAF50',
  fruit: '#FF9800',
  dryFruit: '#8D6E63',
  chicken: '#F44336',
  atta: '#FFC107',
};

// Typography
export const FONTS = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semiBold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
};

// Spacing
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Border Radius
export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
};

// Delivery Configuration
export const DELIVERY = {
  FREE_DELIVERY_START_TIME: '10:00',
  FREE_DELIVERY_END_TIME: '14:00',
  FREE_DELIVERY_MIN_ORDER: 500,
  STANDARD_DELIVERY_CHARGE: 100,
  EXPRESS_DELIVERY_CHARGE: 100,
  SAME_DAY_CUTOFF_TIME: '16:00',
};

// Atta Chakki Configuration
export const ATTA_CHAKKI = {
  PRICE_PER_KG: 10,
  MIN_WEIGHT_KG: 5,
  MAX_WEIGHT_KG: 100,
  GRINDING_TIME_HOURS: 2,
};

// Categories
export const CATEGORIES = [
  { id: 'sabzi', name: 'Sabzi', nameUrdu: 'سبزی', icon: 'leaf', color: COLORS.sabzi },
  { id: 'fruit', name: 'Fruit', nameUrdu: 'پھل', icon: 'apple-alt', color: COLORS.fruit },
  { id: 'dry-fruit', name: 'Dry Fruit', nameUrdu: 'خشک میوہ', icon: 'seedling', color: COLORS.dryFruit },
  { id: 'chicken', name: 'Chicken', nameUrdu: 'مرغی', icon: 'drumstick-bite', color: COLORS.chicken },
  { id: 'atta', name: 'Atta Chakki', nameUrdu: 'آٹا چکی', icon: 'wheat-awn', color: COLORS.atta },
];

// Order Status Messages in Urdu
export const ORDER_STATUS_MESSAGES: Record<string, { en: string; ur: string }> = {
  pending: { en: 'Order Placed', ur: 'آرڈر دیا گیا' },
  confirmed: { en: 'Order Confirmed', ur: 'آرڈر تصدیق شدہ' },
  preparing: { en: 'Preparing Your Order', ur: 'آپ کا آرڈر تیار ہو رہا ہے' },
  ready_for_pickup: { en: 'Ready for Pickup', ur: 'پک اپ کے لیے تیار' },
  out_for_delivery: { en: 'Out for Delivery', ur: 'ترسیل کے لیے روانہ' },
  delivered: { en: 'Delivered', ur: 'پہنچا دیا گیا' },
  cancelled: { en: 'Cancelled', ur: 'منسوخ' },
};

// Atta Request Status Messages
export const ATTA_STATUS_MESSAGES: Record<string, { en: string; ur: string }> = {
  pending_pickup: { en: 'Request Received', ur: 'درخواست موصول' },
  picked_up: { en: 'Wheat Picked Up', ur: 'گندم اٹھا لی گئی' },
  at_mill: { en: 'At Mill', ur: 'مل میں' },
  milling: { en: 'Grinding in Progress', ur: 'پیسائی جاری' },
  ready_for_delivery: { en: 'Atta Ready', ur: 'آٹا تیار' },
  out_for_delivery: { en: 'Out for Delivery', ur: 'ترسیل کے لیے روانہ' },
  delivered: { en: 'Delivered', ur: 'پہنچا دیا گیا' },
  cancelled: { en: 'Cancelled', ur: 'منسوخ' },
};

// Storage Keys
export const STORAGE_KEYS = {
  TOKEN: '@token',
  REFRESH_TOKEN: '@refreshToken',
  USER: '@user',
  CART: '@cart',
  ADDRESSES: '@addresses',
  SETTINGS: '@settings',
  NOTIFICATIONS: '@notifications',
  FIRST_LAUNCH: '@firstLaunch',
};

// Time Slots
export const TIME_SLOTS = [
  { id: '1', startTime: '09:00', endTime: '11:00', label: '9:00 AM - 11:00 AM' },
  { id: '2', startTime: '11:00', endTime: '13:00', label: '11:00 AM - 1:00 PM' },
  { id: '3', startTime: '13:00', endTime: '15:00', label: '1:00 PM - 3:00 PM' },
  { id: '4', startTime: '15:00', endTime: '17:00', label: '3:00 PM - 5:00 PM' },
  { id: '5', startTime: '17:00', endTime: '19:00', label: '5:00 PM - 7:00 PM' },
  { id: '6', startTime: '19:00', endTime: '21:00', label: '7:00 PM - 9:00 PM' },
];

// Validation Patterns
export const VALIDATION = {
  PHONE_REGEX: /^03[0-9]{9}$/,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  MIN_PASSWORD_LENGTH: 6,
  MIN_NAME_LENGTH: 2,
};

// Error Messages
export const ERROR_MESSAGES = {
  PHONE_INVALID: 'Please enter a valid Pakistani phone number (03XXXXXXXXX)',
  OTP_INVALID: 'Please enter a valid 4-digit OTP',
  NAME_REQUIRED: 'Please enter your name',
  EMAIL_INVALID: 'Please enter a valid email address',
  ADDRESS_REQUIRED: 'Please enter your address',
  NETWORK_ERROR: 'Network error. Please check your internet connection.',
  SOMETHING_WRONG: 'Something went wrong. Please try again.',
  CART_EMPTY: 'Your cart is empty',
  MIN_ORDER: 'Minimum order amount is Rs. 200',
};
