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
  // For production builds (when __DEV__ is false), use the production API
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

// App Configuration
export const APP_NAME = 'Fresh Bazar';
export const APP_VERSION = '1.0.0';

// Colors - Green Theme for Pakistani Grocery
export const COLORS = {
  // Primary Colors
  primary: '#2E7D32',
  primaryDark: '#1B5E20',
  primaryLight: '#4CAF50',
  primaryLighter: '#E8F5E9',

  // Secondary Colors
  secondary: '#FF9800',
  secondaryDark: '#F57C00',
  secondaryLight: '#FFB74D',

  // Accent Colors
  accent: '#00BCD4',
  success: '#4CAF50',
  warning: '#FFC107',
  error: '#F44336',
  info: '#2196F3',

  // Neutral Colors
  white: '#FFFFFF',
  black: '#000000',
  gray50: '#FAFAFA',
  gray100: '#F5F5F5',
  gray200: '#EEEEEE',
  gray300: '#E0E0E0',
  gray400: '#BDBDBD',
  gray500: '#9E9E9E',
  gray600: '#757575',
  gray700: '#616161',
  gray800: '#424242',
  gray900: '#212121',

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
  PRICE_PER_KG: 8,
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
