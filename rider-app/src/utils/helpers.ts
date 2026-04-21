import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { TASK_TYPE_LABELS, TASK_STATUS_LABELS, TRANSLATIONS } from './constants';

// Format currency in PKR.
// Hermes in some RN builds silently returns empty string from toLocaleString('en-PK'),
// which leaves "Rs. " with no figure next to it. Format manually so it always renders.
export const formatCurrency = (amount: number | string | null | undefined): string => {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0));
  const safe = Number.isFinite(n) ? n : 0;
  const [intPart, decPart] = Math.abs(safe).toFixed(2).split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = safe < 0 ? '-' : '';
  const body = decPart === '00' ? withCommas : `${withCommas}.${decPart}`;
  return `Rs. ${sign}${body}`;
};

// Format distance
export const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
};

// Format time
export const formatTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'h:mm a');
};

// Format date
export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy');
};

// Format relative time
export const formatRelativeTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
};

// Get task type label
export const getTaskTypeLabel = (type: string, language: 'en' | 'ur' = 'en'): string => {
  return TASK_TYPE_LABELS[type]?.[language] || type;
};

// Get task status label
export const getTaskStatusLabel = (status: string, language: 'en' | 'ur' = 'en'): string => {
  return TASK_STATUS_LABELS[status]?.[language] || status;
};

// Get translation
export const getTranslation = (key: string, language: 'en' | 'ur' = 'en'): string => {
  const translations = TRANSLATIONS[language];
  return (translations as Record<string, string>)[key] || key;
};

// Format phone number (Pakistani format)
export const formatPhoneNumber = (phone: string): string => {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  // If starts with 0, remove it
  const withoutZero = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
  
  // If starts with 92, format as +92 XXX XXXXXXX
  if (withoutZero.startsWith('92')) {
    const rest = withoutZero.slice(2);
    return `+92 ${rest.slice(0, 3)} ${rest.slice(3)}`;
  }
  
  // Otherwise assume it's a local number without country code
  return `+92 ${withoutZero.slice(0, 3)} ${withoutZero.slice(3)}`;
};

// Validate phone number (Pakistani)
export const isValidPhoneNumber = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  // Pakistani numbers: 11 digits starting with 03
  const regex = /^(03\d{9}|92\d{10})$/;
  return regex.test(cleaned);
};

// Calculate estimated time
export const calculateETA = (distanceInMeters: number, speedKmh: number = 25): string => {
  const timeInHours = distanceInMeters / 1000 / speedKmh;
  const timeInMinutes = Math.ceil(timeInHours * 60);
  
  if (timeInMinutes < 1) {
    return '< 1 min';
  } else if (timeInMinutes < 60) {
    return `${timeInMinutes} min`;
  } else {
    const hours = Math.floor(timeInMinutes / 60);
    const mins = timeInMinutes % 60;
    return `${hours}h ${mins}m`;
  }
};

// Generate unique ID
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Debounce function
export const debounce = <T extends (...args: any[]) => void>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Throttle function
export const throttle = <T extends (...args: any[]) => void>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// Deep clone
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

// Check if object is empty
export const isEmptyObject = (obj: object): boolean => {
  return Object.keys(obj).length === 0;
};

// Truncate text
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
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

// Get color based on rating
export const getRatingColor = (rating: number): string => {
  if (rating >= 4.5) return '#10B981'; // Green
  if (rating >= 3.5) return '#F59E0B'; // Amber
  return '#EF4444'; // Red
};

// Sleep function for delays
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

// Parse error message
export const parseErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.message) return error.message;
  return 'An unknown error occurred';
};
