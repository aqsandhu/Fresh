// ============================================================================
// GEO UTILITIES — point-in-polygon for map-based service areas
// ============================================================================
// Polygons are stored as a ring of [lng, lat] pairs (GeoJSON coordinate order).
// Pure functions, no PostGIS dependency, so the same logic can run client-side.

export type LngLat = [number, number]; // [longitude, latitude]

/**
 * Ray-casting point-in-polygon test.
 * @param point [lng, lat]
 * @param ring  array of [lng, lat] pairs (open or closed ring)
 */
export function pointInPolygon(point: LngLat, ring: LngLat[]): boolean {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** True when at least one polygon ring contains the point. */
export function pointInAnyPolygon(point: LngLat, rings: LngLat[][]): boolean {
  return rings.some((ring) => pointInPolygon(point, ring));
}

/**
 * Validate a polygon ring: an array of 3..maxPoints numeric [lng, lat] pairs
 * within valid coordinate ranges. Returns a typed guard.
 */
export function isValidPolygonRing(ring: unknown, maxPoints = 1000): ring is LngLat[] {
  if (!Array.isArray(ring) || ring.length < 3 || ring.length > maxPoints) return false;
  return ring.every(
    (p) =>
      Array.isArray(p) &&
      p.length === 2 &&
      typeof p[0] === 'number' &&
      typeof p[1] === 'number' &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]) &&
      p[0] >= -180 &&
      p[0] <= 180 &&
      p[1] >= -90 &&
      p[1] <= 90
  );
}
