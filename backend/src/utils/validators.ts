// ============================================================================
// VALIDATION HELPERS
// ============================================================================

// Pakistani phone number validation
export const isValidPakistaniPhone = (phone: string): boolean => {
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Pakistani phone numbers: +92XXXXXXXXXX or 03XXXXXXXXX
  const pakistaniPhoneRegex = /^(\+92|0)[0-9]{10}$/;
  return pakistaniPhoneRegex.test(cleaned);
};

// Normalize Pakistani phone number
export const normalizePhoneNumber = (phone: string): string => {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // If starts with 0, replace with +92
  if (cleaned.startsWith('0')) {
    cleaned = '92' + cleaned.substring(1);
  }
  
  // If doesn't start with 92, add it
  if (!cleaned.startsWith('92')) {
    cleaned = '92' + cleaned;
  }
  
  return '+' + cleaned;
};

// Email validation
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// CNIC validation (Pakistani format: 12345-1234567-8)
export const isValidCNIC = (cnic: string): boolean => {
  const cnicRegex = /^\d{5}-\d{7}-\d$/;
  return cnicRegex.test(cnic);
};

// Normalize CNIC
export const normalizeCNIC = (cnic: string): string => {
  // Remove all non-digit characters
  const digits = cnic.replace(/\D/g, '');
  
  // Format as 12345-1234567-8
  if (digits.length === 13) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  }
  
  return cnic;
};

// UUID validation
export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Password strength validation
export const isStrongPassword = (password: string): boolean => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return passwordRegex.test(password);
};

// Get password strength score (0-4)
export const getPasswordStrength = (password: string): number => {
  let score = 0;
  
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  
  return Math.min(score, 4);
};

// Coordinate validation
export const isValidCoordinate = (lat: number, lng: number): boolean => {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
};

// Price validation
export const isValidPrice = (price: number): boolean => {
  return typeof price === 'number' && price >= 0 && price <= 999999.99;
};

// Quantity validation
export const isValidQuantity = (quantity: number): boolean => {
  return Number.isInteger(quantity) && quantity > 0 && quantity <= 9999;
};

// String length validation
export const isValidLength = (
  str: string,
  min: number,
  max: number
): boolean => {
  return str.length >= min && str.length <= max;
};

// Sanitize string (remove HTML tags)
export const sanitizeString = (str: string): string => {
  return str.replace(/<[^>]*>/g, '').trim();
};

// Validate file type
export const isValidImageType = (mimetype: string): boolean => {
  const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/webp').split(',');
  return allowedTypes.includes(mimetype);
};

// Validate file size
export const isValidFileSize = (size: number): boolean => {
  const maxSize = parseInt(process.env.MAX_FILE_SIZE || '5242880'); // 5MB default
  return size <= maxSize;
};

// Order number generation
export const generateOrderNumber = (): string => {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `ORD-${dateStr}-${random}`;
};

// Atta request number generation
export const generateAttaRequestNumber = (): string => {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `ATTA-${dateStr}-${random}`;
};

// Slug generation
export const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Date validation
export const isValidDate = (date: string): boolean => {
  const d = new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
};

// Future date validation
export const isFutureDate = (date: string): boolean => {
  const d = new Date(date);
  const now = new Date();
  return d > now;
};

// Time slot validation
export const isValidTimeSlot = (startTime: string, endTime: string): boolean => {
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);
  return start < end;
};
