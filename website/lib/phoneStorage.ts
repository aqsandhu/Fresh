/** Last successfully used login phone — enables PIN-only return visits. */
export const LAST_PHONE_KEY = 'freshbazar-last-phone';

export function getLastPhone(): string | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(LAST_PHONE_KEY);
  return v && v.trim().length > 0 ? v.trim() : null;
}

export function setLastPhone(phone: string): void {
  if (typeof window === 'undefined' || !phone?.trim()) return;
  localStorage.setItem(LAST_PHONE_KEY, phone.trim());
}

export function clearLastPhone(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LAST_PHONE_KEY);
}

/** Show only last 4 digits, e.g. •••• •••• 4567 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `•••• •••• ${digits.slice(-4)}`;
}

/** Build tel: href for Pakistani numbers shown in banner / UI. */
export function phoneToTelHref(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('92')) return `tel:+${digits}`;
  if (digits.startsWith('0')) return `tel:+92${digits.slice(1)}`;
  return `tel:+92${digits}`;
}

/** PIN re-auth / return visit window — 3 days. */
export const PIN_STALE_MS = 3 * 24 * 60 * 60 * 1000;
