import { getSelectedCityId } from './cityStorage';

export function withCityParams<T extends Record<string, unknown>>(
  params?: T
): T & { city_id?: string } {
  // Sync read — city id is cached in memory by CityContext after hydration.
  const cityId = _cachedCityId;
  if (!cityId) return (params || {}) as T & { city_id?: string };
  return { ...(params || {}), city_id: cityId } as T & { city_id?: string };
}

/** In-memory cache updated by CityContext so sync API helpers work. */
let _cachedCityId: string | null = null;

export function setCachedCityId(id: string | null): void {
  _cachedCityId = id;
}

export function getCachedCityId(): string | null {
  return _cachedCityId;
}

export async function hydrateCachedCityId(): Promise<void> {
  _cachedCityId = await getSelectedCityId();
}
