/** Default map centre — Gujrat, Pakistan */
export const DEFAULT_MAP_LAT = 32.5742
export const DEFAULT_MAP_LNG = 74.0789

export function hasGoogleMapsApiKey(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim())
}

/**
 * Google Maps embed URL (static preview only). Interactive picker uses Maps JS API.
 */
export function getGoogleMapsEmbedUrl(
  lat: number,
  lng: number,
  zoom = 15
): string {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  if (key) {
    return `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(key)}&center=${lat},${lng}&zoom=${zoom}`
  }
  return `https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed`
}

export function openGoogleMapsDirections(lat: number, lng: number): void {
  window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer')
}
