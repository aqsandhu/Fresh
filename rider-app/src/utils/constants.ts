// API Configuration
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
  if (!isDevelopment) {
    return 'https://api.freshbazar.pk/api';
  }
  // Metro's hostUri contains the dev-machine address the device/emulator
  // is already using to reach the bundler (LAN IP for Wi-Fi devices,
  // 10.0.2.2 for Android emulators) — both can also reach the backend on 3000.
  const devHost = getDevHost();
  if (devHost) {
    return `http://${devHost}:3000/api`;
  }
  // Fallback: update this to the PC's current LAN IP for Fresh Bazar Rider development.
  return 'http://192.168.119.226:3000/api';
};

export const API_BASE_URL = getApiBaseUrl();
export const API_TIMEOUT = 30000;

// Location Tracking Configuration
export const LOCATION_TRACKING_INTERVAL = 30000; // 30 seconds
export const LOCATION_ACCURACY = 6; // High accuracy for navigation
export const LOCATION_DISTANCE_INTERVAL = 10; // Update every 10 meters

// Task Type Labels (English & Urdu)
export const TASK_TYPE_LABELS: Record<string, { en: string; ur: string }> = {
  delivery: { en: 'Delivery', ur: 'ڈیلیوری' },
  pickup: { en: 'Pickup', ur: 'پک اپ' },
  atta_pickup: { en: 'Atta Pickup', ur: 'آٹا پک اپ' },
  atta_delivery: { en: 'Atta Delivery', ur: 'آٹا ڈیلیوری' },
};

// Task Status Labels
export const TASK_STATUS_LABELS: Record<string, { en: string; ur: string }> = {
  pending: { en: 'Pending', ur: 'زیر التوا' },
  assigned: { en: 'Assigned', ur: 'تفویض کردہ' },
  picked_up: { en: 'Picked Up', ur: 'اٹھا لیا' },
  in_transit: { en: 'In Transit', ur: 'راستے میں' },
  delivered: { en: 'Delivered', ur: 'پہنچا دیا' },
  cancelled: { en: 'Cancelled', ur: 'منسوخ' },
};

// Status Colors
export const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B', // Amber
  assigned: '#3B82F6', // Blue
  picked_up: '#8B5CF6', // Purple
  in_transit: '#10B981', // Green
  delivered: '#059669', // Dark Green
  cancelled: '#EF4444', // Red
  online: '#10B981',
  offline: '#6B7280',
  busy: '#F59E0B',
};

// Colors
export const COLORS = {
  primary: '#10B981', // Green
  primaryDark: '#059669',
  secondary: '#3B82F6', // Blue
  accent: '#F59E0B', // Amber
  danger: '#EF4444', // Red
  success: '#22C55E',
  warning: '#F59E0B',
  info: '#3B82F6',
  white: '#FFFFFF',
  black: '#000000',
  
  // Grays
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  
  // Backgrounds
  background: '#FFFFFF',
  surface: '#F9FAFB',
  card: '#FFFFFF',
  
  // Text
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  
  // Borders
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
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

// Font Sizes
export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  display: 32,
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

// Urdu Translations
export const TRANSLATIONS = {
  ur: {
    // Auth
    login: 'لاگ ان',
    phoneNumber: 'فون نمبر',
    password: 'پاس ورڈ',
    enterPhone: 'اپنا فون نمبر درج کریں',
    enterPassword: 'اپنا پاس ورڈ درج کریں',
    
    // Home
    welcome: 'خوش آمدید',
    online: 'آن لائن',
    offline: 'آف لائن',
    todayStats: 'آج کے اعداد و شمار',
    deliveries: 'ڈیلیوریز',
    earnings: 'کمائی',
    distance: 'فاصلہ',
    activeTasks: 'فعال کام',
    viewTasks: 'کام دیکھیں',
    myStats: 'میرے اعداد و شمار',
    
    // Tasks
    tasks: 'کام',
    active: 'فعال',
    completed: 'مکمل',
    taskDetails: 'کام کی تفصیلات',
    orderNumber: 'آرڈر نمبر',
    customerAddress: 'صارف کا پتہ',
    houseNumber: 'گھر نمبر',
    specialInstructions: 'خصوصی ہدایات',
    timeWindow: 'وقت کی حد',
    
    // Actions
    markPickedUp: 'اٹھا لیا نشان کریں',
    markDelivered: 'پہنچا دیا نشان کریں',
    navigate: 'راستہ دکھائیں',
    callCustomer: 'صارف کو کال کریں',
    ringing: 'کال ہو رہی ہے...',
    
    // Profile
    profile: 'پروفائل',
    earningsHistory: 'کمائی کی تاریخ',
    totalDeliveries: 'کل ڈیلیوریز',
    rating: 'درجہ بندی',
    
    // Settings
    settings: 'ترتیبات',
    language: 'زبان',
    english: 'انگریزی',
    urdu: 'اردو',
    notifications: 'اطلاعات',
    logout: 'لاگ آؤٹ',
    
    // Messages
    locationSharing: 'مقام کی شیئرنگ فعال ہے',
    noTasks: 'کوئی کام دستیاب نہیں',
    taskAssigned: 'نیا کام تفویض کیا گیا',
    pickupConfirmed: 'پک اپ تصدیق شدہ',
    deliveryConfirmed: 'ڈیلیوری تصدیق شدہ',
    callingCustomer: 'صارف کو کال کر رہے ہیں...',
    callRequestSent: 'کال کی درخواست بھیج دی گئی',
    
    // Errors
    errorLogin: 'لاگ ان ناکام',
    errorNetwork: 'انٹرنیٹ کنکشن چیک کریں',
    errorLocation: 'مقام کی اجازت درکار ہے',
  },
  en: {
    // Auth
    login: 'Login',
    phoneNumber: 'Phone Number',
    password: 'Password',
    enterPhone: 'Enter your phone number',
    enterPassword: 'Enter your password',
    
    // Home
    welcome: 'Welcome',
    online: 'Online',
    offline: 'Offline',
    todayStats: 'Today\'s Stats',
    deliveries: 'Deliveries',
    earnings: 'Earnings',
    distance: 'Distance',
    activeTasks: 'Active Tasks',
    viewTasks: 'View Tasks',
    myStats: 'My Stats',
    
    // Tasks
    tasks: 'Tasks',
    active: 'Active',
    completed: 'Completed',
    taskDetails: 'Task Details',
    orderNumber: 'Order Number',
    customerAddress: 'Customer Address',
    houseNumber: 'House Number',
    specialInstructions: 'Special Instructions',
    timeWindow: 'Time Window',
    
    // Actions
    markPickedUp: 'Mark Picked Up',
    markDelivered: 'Mark Delivered',
    navigate: 'Navigate',
    callCustomer: 'Call Customer',
    ringing: 'Ringing...',
    
    // Profile
    profile: 'Profile',
    earningsHistory: 'Earnings History',
    totalDeliveries: 'Total Deliveries',
    rating: 'Rating',
    
    // Settings
    settings: 'Settings',
    language: 'Language',
    english: 'English',
    urdu: 'Urdu',
    notifications: 'Notifications',
    logout: 'Logout',
    
    // Messages
    locationSharing: 'Location sharing active',
    noTasks: 'No tasks available',
    taskAssigned: 'New task assigned',
    pickupConfirmed: 'Pickup confirmed',
    deliveryConfirmed: 'Delivery confirmed',
    callingCustomer: 'Calling customer...',
    callRequestSent: 'Call request sent',
    
    // Errors
    errorLogin: 'Login failed',
    errorNetwork: 'Check internet connection',
    errorLocation: 'Location permission required',
  },
};

// AsyncStorage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: '@auth_token',
  REFRESH_TOKEN: '@refresh_token',
  RIDER_DATA: '@rider_data',
  SETTINGS: '@settings',
  OFFLINE_QUEUE: '@offline_queue',
  LAST_LOCATION: '@last_location',
};

// Notification Channels
export const NOTIFICATION_CHANNELS = {
  NEW_TASK: 'new-task',
  TASK_UPDATE: 'task-update',
  CALL_REQUEST: 'call-request',
  ADMIN_MESSAGE: 'admin-message',
};

// Map Configuration
export const MAP_CONFIG = {
  defaultLatitude: 32.5742, // Gujrat
  defaultLongitude: 74.0789,
  defaultZoom: 14,
  markerSize: 40,
};
