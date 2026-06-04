/** Build a WhatsApp deep link from admin-configured URL or phone number (same as customer-app). */
export function buildWhatsAppUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 10) return null

  const intl = digits.startsWith('92')
    ? digits
    : digits.startsWith('0')
      ? `92${digits.slice(1)}`
      : `92${digits}`
  return `https://wa.me/${intl}`
}

export function openWhatsAppOrder(raw: string): boolean {
  const url = buildWhatsAppUrl(raw)
  if (!url) {
    if (typeof window !== 'undefined') {
      window.alert('WhatsApp order link is not configured for your city yet.')
    }
    return false
  }
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
