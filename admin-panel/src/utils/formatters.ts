import { format, parseISO } from 'date-fns';

// Backend host derived from VITE_API_URL (strips trailing /api). Used for
// resolving relative `/uploads/...` paths and re-hosting legacy absolute
// dev/LAN URLs that used to be stored in the DB.
const BACKEND_HOST = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');

// Normalize any image reference into something the browser can load from the
// current backend. Accepts: data URLs (pass-through), absolute URLs (re-host
// if they point at localhost/LAN, else pass-through), and relative paths.
export const resolveImageUrl = (path: string | null | undefined): string => {
  if (!path) return '';
  if (path.startsWith('data:')) return path;
  const absMatch = path.match(/^https?:\/\/([^/]+)(\/.*)?$/);
  if (absMatch) {
    const host = absMatch[1].split(':')[0];
    const rest = absMatch[2] || '';
    const isLocalOrLan = host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
    return isLocalOrLan ? `${BACKEND_HOST}${rest}` : path;
  }
  if (path.startsWith('//')) return path;
  return path.startsWith('/') ? `${BACKEND_HOST}${path}` : `${BACKEND_HOST}/${path}`;
};

// Manual formatter — outputs "Rs. 1,234" or "Rs. 1,234.50" to match
// customer-app / rider-app / website so staff see the same currency label
// in every surface. Avoids Intl locale quirks that output "PKR 1,234".
export const formatCurrency = (amount: number | string | null | undefined): string => {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0));
  const safe = Number.isFinite(n) ? n : 0;
  const [intPart, decPart] = Math.abs(safe).toFixed(2).split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = safe < 0 ? '-' : '';
  const body = decPart === '00' ? withCommas : `${withCommas}.${decPart}`;
  return `Rs. ${sign}${body}`;
};

export const formatDate = (date: string | Date, formatStr = 'MMM dd, yyyy'): string => {
  if (!date) return '-';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatStr);
};

export const formatDateTime = (date: string | Date): string => {
  if (!date) return '-';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'MMM dd, yyyy HH:mm');
};

export const formatRelativeTime = (date: string | Date): string => {
  if (!date) return '-';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - dateObj.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
  return `${Math.floor(diffInMinutes / 1440)} days ago`;
};

export const formatPhoneNumber = (phone: string): string => {
  if (!phone) return '-';
  // Format Pakistani phone numbers
  if (phone.startsWith('92')) {
    return `+${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
  }
  if (phone.startsWith('0')) {
    return `+92 ${phone.slice(1, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  }
  return phone;
};

export const truncateText = (text: string, maxLength: number): string => {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

export const getOrderStatusColor = (status: string): { bg: string; text: string } => {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    confirmed: { bg: 'bg-blue-100', text: 'text-blue-800' },
    preparing: { bg: 'bg-purple-100', text: 'text-purple-800' },
    ready: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
    ready_for_pickup: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
    out_for_delivery: { bg: 'bg-orange-100', text: 'text-orange-800' },
    delivered: { bg: 'bg-green-100', text: 'text-green-800' },
    cancelled: { bg: 'bg-red-100', text: 'text-red-800' },
    refunded: { bg: 'bg-pink-100', text: 'text-pink-800' },
    pending_pickup: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    picked_up: { bg: 'bg-blue-100', text: 'text-blue-800' },
    at_mill: { bg: 'bg-purple-100', text: 'text-purple-800' },
    milling: { bg: 'bg-violet-100', text: 'text-violet-800' },
    ready_for_delivery: { bg: 'bg-teal-100', text: 'text-teal-800' },
  };
  return colors[status] || { bg: 'bg-gray-100', text: 'text-gray-800' };
};

export const getRiderStatusColor = (status: string): { bg: string; text: string } => {
  const colors: Record<string, { bg: string; text: string }> = {
    available: { bg: 'bg-green-100', text: 'text-green-800' },
    busy: { bg: 'bg-orange-100', text: 'text-orange-800' },
    offline: { bg: 'bg-gray-100', text: 'text-gray-800' },
  };
  return colors[status] || { bg: 'bg-gray-100', text: 'text-gray-800' };
};

export const formatOrderStatus = (status: string): string => {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Escape HTML special characters to prevent XSS when inserting into HTML.
 * Use this instead of raw interpolation in document.write/innerHTML.
 */
export const escapeHtml = (unsafe: string | number | null | undefined): string => {
  if (unsafe == null) return '';
  const str = String(unsafe);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};
