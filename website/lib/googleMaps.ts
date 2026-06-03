/** Default map centre — Gujrat, Pakistan (same as customer-app). */
export const DEFAULT_MAP_LAT = 32.5742
export const DEFAULT_MAP_LNG = 74.0789

let runtimeMapsKey = ''

/** Set at runtime after optional backend fetch (Render GOOGLE_MAPS_API_KEY). */
export function setRuntimeGoogleMapsApiKey(key: string): void {
  runtimeMapsKey = key.trim()
}

/**
 * Browser/build key if present. Empty string is normal — website uses Google embed
 * (same idea as Expo Go MapView without a project key).
 */
export function resolveGoogleMapsApiKey(): string {
  return (
    runtimeMapsKey ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    ''
  )
}

export function hasGoogleMapsApiKey(): boolean {
  return Boolean(resolveGoogleMapsApiKey())
}

export function getGoogleMapsEmbedUrl(
  lat: number,
  lng: number,
  zoom = 15
): string {
  const key = resolveGoogleMapsApiKey()
  if (key) {
    return `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(key)}&center=${lat},${lng}&zoom=${zoom}`
  }
  return `https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed`
}

export function openGoogleMapsDirections(lat: number, lng: number): void {
  window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer')
}
