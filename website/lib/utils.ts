import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Base URL used for images served from the backend /uploads directory.
const BACKEND_HOST = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '')

// Re-host absolute dev/LAN URLs onto the current backend host. Backend used to
// store absolute http://localhost:3000/... which breaks on any non-local browser.
export function resolveImageUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (path.startsWith('data:')) return path
  const absMatch = path.match(/^https?:\/\/([^/]+)(\/.*)?$/)
  if (absMatch) {
    const host = absMatch[1].split(':')[0]
    const rest = absMatch[2] || ''
    const isLocalOrLan = host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host)
    return isLocalOrLan ? `${BACKEND_HOST}${rest}` : path
  }
  if (path.startsWith('//')) return path
  return path.startsWith('/') ? `${BACKEND_HOST}${path}` : `${BACKEND_HOST}/${path}`
}

// Unified price formatter. Output: "Rs. 1,234" or "Rs. 1,234.50" — matches
// customer-app / rider-app so users see the same currency label everywhere.
function formatRupees(amount: number | string | null | undefined): string {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0))
  const safe = Number.isFinite(n) ? n : 0
  const [intPart, decPart] = Math.abs(safe).toFixed(2).split('.')
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = safe < 0 ? '-' : ''
  const body = decPart === '00' ? withCommas : `${withCommas}.${decPart}`
  return `Rs. ${sign}${body}`
}

export function formatPrice(price: number): string {
  return formatRupees(price)
}

export function formatPriceShort(price: number): string {
  return formatRupees(price)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date))
}

export function getDeliveryMessage(subtotal: number, hasOnlyChicken: boolean): string {
  if (hasOnlyChicken) {
    return 'Delivery charges apply for chicken-only orders'
  }
  if (subtotal >= 500) {
    return 'Free delivery on orders above Rs. 500'
  }
  const remaining = 500 - subtotal
  return `Add Rs. ${remaining} more for free delivery`
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim()
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function getCategoryName(slug: string): string {
  const categories: Record<string, string> = {
    'sabzi': 'Fresh Vegetables',
    'fruit': 'Fresh Fruits',
    'dry-fruit': 'Dry Fruits',
    'chicken': 'Fresh Chicken',
    'atta': 'Atta Chakki',
  }
  return categories[slug] || 'Products'
}

export function getCategoryNameUrdu(slug: string): string {
  const categories: Record<string, string> = {
    'sabzi': 'تازہ سبزیاں',
    'fruit': 'تازہ پھل',
    'dry-fruit': 'خشک میوے',
    'chicken': 'تازہ مرغی',
    'atta': 'آٹا چکی',
  }
  return categories[slug] || 'مصنوعات'
}

export function getOrderStatusColor(status: string): string {
  const colors: Record<string, string> = {
    'received': 'bg-blue-100 text-blue-800',
    'preparing': 'bg-yellow-100 text-yellow-800',
    'out-for-delivery': 'bg-purple-100 text-purple-800',
    'delivered': 'bg-green-100 text-green-800',
    'cancelled': 'bg-red-100 text-red-800',
    'refunded': 'bg-orange-100 text-orange-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

export function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'received': 'Order Received',
    'preparing': 'Preparing',
    'out-for-delivery': 'Out for Delivery',
    'delivered': 'Delivered',
    'cancelled': 'Cancelled',
    'refunded': 'Refunded',
  }
  return labels[status] || status
}

export function isFreeDeliveryTimeSlot(): boolean {
  const now = new Date()
  const hours = now.getHours()
  // Free delivery 10AM-2PM if ordered before 10AM
  return hours < 10
}

export function getTimeSlots(): { value: string; label: string; isFree: boolean }[] {
  const isFree = isFreeDeliveryTimeSlot()
  return [
    { value: '10am-2pm', label: '10:00 AM - 2:00 PM', isFree },
    { value: '2pm-6pm', label: '2:00 PM - 6:00 PM', isFree: false },
    { value: '6pm-9pm', label: '6:00 PM - 9:00 PM', isFree: false },
  ]
}
