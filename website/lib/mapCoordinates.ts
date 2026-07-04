/** Convert pixel delta to lat/lng change at a given zoom (Web Mercator). */
export function offsetLatLngFromPixels(
  lat: number,
  lng: number,
  zoom: number,
  dxPx: number,
  dyPx: number
): { lat: number; lng: number } {
  const scale = 256 * Math.pow(2, zoom)
  const latRad = (lat * Math.PI) / 180
  const lngPerPx = 360 / scale / Math.cos(latRad)
  const latPerPx = 360 / scale

  return {
    lat: lat - dyPx * latPerPx,
    lng: lng + dxPx * lngPerPx,
  }
}

export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom)
}

export function googleMapsEmbedUrl(lat: number, lng: number, zoom: number): string {
  const ll = `${lat},${lng}`
  // `ll` (not `q`) centres the map WITHOUT dropping Google's own marker, so only
  // our single centre pin shows. `t=h` = hybrid (satellite imagery + labels).
  return `https://maps.google.com/maps?ll=${encodeURIComponent(ll)}&z=${zoom}&t=h&output=embed`
}
