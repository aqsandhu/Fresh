// ============================================================================
// SERVICE AREA CHECK ON THE SERVER (A39, round 9)
// The delivery-area polygons were only checked by the website and the app
// when an address was saved with a map pin; an older app build or a direct
// API call could save an address (and order) outside the area the city
// delivers to. Same rule as the clients: a city with no active polygon is
// unrestricted, and an address without coordinates is not checked.
// ============================================================================

import { query } from '../config/database';
import { isMissingTable } from './dbErrors';
import { isValidPolygonRing, pointInPolygon, type LngLat } from './geo';

export const OUT_OF_AREA_MESSAGE =
  "Sorry, we don't deliver to this location yet. Please choose a point inside our delivery area.";

/** The service city for an address: the selected city id, else its city name. */
export async function cityIdForAddress(selectedCityId: string | null, cityName: string | null): Promise<string | null> {
  if (selectedCityId) return selectedCityId;
  if (!cityName) return null;
  const r = await query('SELECT id FROM service_cities WHERE LOWER(name) = LOWER($1) LIMIT 1', [cityName.trim()]);
  return r.rows[0]?.id ?? null;
}

/** True only when the city HAS active delivery areas and the point is outside all of them. */
export async function isOutsideServiceArea(
  cityId: string | null,
  lat: number | null | undefined,
  lng: number | null | undefined
): Promise<boolean> {
  if (!cityId || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  let rows: Array<{ polygon: unknown }>;
  try {
    rows = (await query('SELECT polygon FROM service_areas WHERE city_id = $1 AND is_active = true', [cityId])).rows;
  } catch (err) {
    if (isMissingTable(err)) return false;
    throw err;
  }
  const rings = rows
    .map((r) => (typeof r.polygon === 'string' ? safeParse(r.polygon) : r.polygon))
    .filter((ring): ring is LngLat[] => isValidPolygonRing(ring)); // not .filter(fn): the index would become maxPoints
  if (rings.length === 0) return false;
  return !rings.some((ring) => pointInPolygon([lng, lat], ring));
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
