import { Platform } from 'react-native';
import { COLORS, DELIVERY } from './constants';

// Format currency (Pakistani Rupees)
// Hermes in some RN builds can silently fail on Intl-backed toLocaleString('en-PK')
// and return an empty string, which makes the value column look blank next to
// "Subtotal" / "Delivery". Format manually so this always renders.
export const formatCurrency = (amount: number | string | null | undefined): string => {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0));
  const safe = Number.isFinite(n) ? n : 0;
  const [intPart, decPart] = Math.abs(safe).toFixed(2).split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = safe < 0 ? '-' : '';
  const body = decPart === '00' ? withCommas : `${withCommas}.${decPart}`;
  return `Rs. ${sign}${body}`;
};

// Format date
export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

// Format time
export const formatTime = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// Format date and time
export const formatDateTime = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// Calculate relative time (e.g., "2 hours ago")
export const getRelativeTime = (date: string | Date): string => {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return formatDate(date);
};

// Check if delivery is free
export const isFreeDelivery = (subtotal: number): boolean => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  
  const [startHour, startMinute] = DELIVERY.FREE_DELIVERY_START_TIME.split(':').map(Number);
  const [endHour, endMinute] = DELIVERY.FREE_DELIVERY_END_TIME.split(':').map(Number);
  
  const startTime = startHour * 60 + startMinute;
  const endTime = endHour * 60 + endMinute;
  
  const isInFreeWindow = currentTime >= startTime && currentTime <= endTime;
  const meetsMinOrder = subtotal >= DELIVERY.FREE_DELIVERY_MIN_ORDER;
  
  return isInFreeWindow && meetsMinOrder;
};

// Calculate delivery charge
export const calculateDeliveryCharge = (subtotal: number): number => {
  if (isFreeDelivery(subtotal)) return 0;
  return DELIVERY.STANDARD_DELIVERY_CHARGE;
};

// Calculate cart totals
export const calculateCartTotals = (items: { product: { price: number }; quantity: number }[]) => {
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const deliveryCharge = calculateDeliveryCharge(subtotal);
  const total = subtotal + deliveryCharge;
  
  return {
    subtotal,
    deliveryCharge,
    total,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
  };
};

// Get status color
export const getStatusColor = (status: string): string => {
  const statusColors: Record<string, string> = {
    pending: COLORS.warning,
    confirmed: COLORS.info,
    preparing: COLORS.info,
    ready_for_pickup: COLORS.primary,
    out_for_delivery: COLORS.primary,
    delivered: COLORS.success,
    cancelled: COLORS.error,
  };
  return statusColors[status] || COLORS.gray500;
};

// Truncate text
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

// Generate unique ID
export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// Validate Pakistani phone number
export const validatePhoneNumber = (phone: string): boolean => {
  const regex = /^03[0-9]{9}$/;
  return regex.test(phone);
};

// Format phone number for display
export const formatPhoneNumber = (phone: string): string => {
  if (phone.length !== 11) return phone;
  return `${phone.slice(0, 4)}-${phone.slice(4, 7)}-${phone.slice(7)}`;
};

// Debounce function
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Deep clone
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

// Check if object is empty
export const isEmpty = (obj: Record<string, any>): boolean => {
  return Object.keys(obj).length === 0;
};

// Get initials from name
export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

// Calculate distance between two coordinates (Haversine formula)
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (value: number): number => {
  return (value * Math.PI) / 180;
};

// Platform-specific shadow
export const getShadow = (elevation: number = 4) => {
  if (Platform.OS === 'ios') {
    return {
      shadowColor: COLORS.black,
      shadowOffset: { width: 0, height: elevation / 2 },
      shadowOpacity: 0.1,
      shadowRadius: elevation,
    };
  }
  return {
    elevation,
  };
};

// Sleep/delay function
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Retry function with exponential backoff
export const retry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(delay * Math.pow(2, i));
      }
    }
  }
  
  throw lastError!;
};

// Parse query params from URL
export const parseQueryParams = (url: string): Record<string, string> => {
  const params: Record<string, string> = {};
  const queryString = url.split('?')[1];
  if (!queryString) return params;
  
  queryString.split('&').forEach((param) => {
    const [key, value] = param.split('=');
    if (key && value) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  });
  
  return params;
};

// Convert file to base64
export const fileToBase64 = async (uri: string): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
