// Client-side service-area helpers (mirror of backend src/utils/geo.ts).
// Polygons are rings of [lng, lat] pairs.

export type LngLat = [number, number]

export interface ServiceAreaMessage {
  title: string
  message_en: string
  message_ur: string
  whatsapp: string
}

export interface ServiceAreaData {
  enabled: boolean
  polygons: LngLat[][]
  message: ServiceAreaMessage
}

/** Ray-casting point-in-polygon. point = [lng, lat]. */
export function pointInPolygon(point: LngLat, ring: LngLat[]): boolean {
  if (!Array.isArray(ring) || ring.length < 3) return false
  const x = point[0]
  const y = point[1]
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * True when the lat/lng is inside the city's deliverable area. When the city has
 * no active polygon (`enabled` false / empty), everything is considered in-area
 * so existing customers are never blocked.
 */
export function isWithinServiceArea(
  lat: number,
  lng: number,
  data?: ServiceAreaData | null
): boolean {
  if (!data || !data.enabled || !Array.isArray(data.polygons) || data.polygons.length === 0) {
    return true
  }
  return data.polygons.some((ring) => pointInPolygon([lng, lat], ring))
}
